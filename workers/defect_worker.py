"""
Azure Service Bus worker for defect analysis.
Downloads raw images, runs analysis, and writes processed JSON to Blob Storage.
"""

import asyncio
import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from typing import Optional

from azure.identity import DefaultAzureCredential
from azure.servicebus import ServiceBusClient
from azure.storage.blob import BlobServiceClient, ContentSettings

from agents.defect_analyzer_gpt52 import WikoDefectAnalyzerGPT52

logger = logging.getLogger("defect_worker")

_blob_service_client: Optional[BlobServiceClient] = None
_servicebus_client: Optional[ServiceBusClient] = None
_event_loop: Optional[asyncio.AbstractEventLoop] = None


def _get_event_loop() -> asyncio.AbstractEventLoop:
    global _event_loop
    if _event_loop is None or _event_loop.is_closed():
        _event_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_event_loop)
    return _event_loop


def _get_blob_service_client() -> BlobServiceClient:
    global _blob_service_client
    if _blob_service_client:
        return _blob_service_client

    conn_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
    account_name = os.getenv("AZURE_STORAGE_ACCOUNT")
    if conn_string:
        _blob_service_client = BlobServiceClient.from_connection_string(conn_string)
        return _blob_service_client

    if not account_name:
        raise ValueError("AZURE_STORAGE_ACCOUNT is required when no connection string is provided")

    account_url = f"https://{account_name}.blob.core.windows.net"
    _blob_service_client = BlobServiceClient(account_url=account_url, credential=DefaultAzureCredential())
    return _blob_service_client


def _get_servicebus_client() -> ServiceBusClient:
    global _servicebus_client
    if _servicebus_client:
        return _servicebus_client

    conn_string = os.getenv("AZURE_SERVICEBUS_CONNECTION_STRING")
    namespace = os.getenv("AZURE_SERVICEBUS_NAMESPACE")

    if conn_string:
        _servicebus_client = ServiceBusClient.from_connection_string(conn_string)
        return _servicebus_client

    if not namespace:
        raise ValueError("AZURE_SERVICEBUS_NAMESPACE is required when no connection string is provided")

    if ".servicebus.windows.net" not in namespace:
        namespace = f"{namespace}.servicebus.windows.net"

    _servicebus_client = ServiceBusClient(
        fully_qualified_namespace=namespace,
        credential=DefaultAzureCredential(),
    )
    return _servicebus_client


def _decode_message_body(message) -> dict:
    body = message.body
    if hasattr(body, "__iter__") and not isinstance(body, (bytes, str)):
        body = b"".join(body)
    if isinstance(body, bytes):
        body = body.decode("utf-8")
    return json.loads(body)


def _build_processed_payload(image_id: str, analysis, payload: dict) -> dict:
    processed_at = datetime.now(timezone.utc).isoformat()
    bounding_boxes = []
    if analysis.bounding_box:
        bounding_boxes.append(analysis.bounding_box)

    return {
        "image_id": image_id,
        "timestamps": {
            "ingested_at": payload.get("received_at"),
            "processed_at": processed_at,
        },
        "metadata": {
            "product_sku": payload.get("product_sku"),
            "facility": payload.get("facility"),
            "source_blob": {
                "container": payload.get("raw_container"),
                "blob_name": payload.get("blob_name"),
            },
            "content_type": payload.get("content_type"),
            "extra": payload.get("metadata", {}),
        },
        "defect_findings": {
            "defect_detected": analysis.defect_detected,
            "defect_type": analysis.defect_type.value,
            "severity": analysis.severity.value,
            "description": analysis.description,
            "confidence": analysis.confidence,
            "bounding_boxes": bounding_boxes,
        },
        "model_version": analysis.model_version,
    }


def _process_message(analyzer: WikoDefectAnalyzerGPT52, payload: dict) -> None:
    image_id = payload.get("image_id")
    raw_container = payload.get("raw_container", os.getenv("AZURE_STORAGE_RAW_CONTAINER", "raw-images"))
    processed_container = payload.get(
        "processed_container",
        os.getenv("AZURE_STORAGE_PROCESSED_CONTAINER", "processed-images"),
    )
    blob_name = payload.get("blob_name")
    product_sku = payload.get("product_sku")
    facility = payload.get("facility")

    if not all([image_id, blob_name, product_sku, facility]):
        raise ValueError("Missing required fields in message payload")

    blob_service = _get_blob_service_client()

    processed_blob_name = f"{image_id}.json"
    processed_blob_client = blob_service.get_blob_client(
        container=processed_container,
        blob=processed_blob_name,
    )
    if processed_blob_client.exists():
        logger.info("Processed blob already exists for %s, skipping", image_id)
        return

    raw_blob_client = blob_service.get_blob_client(container=raw_container, blob=blob_name)

    with tempfile.NamedTemporaryFile(suffix=os.path.splitext(blob_name)[1]) as tmp:
        download_stream = raw_blob_client.download_blob()
        download_stream.readinto(tmp)
        tmp.flush()

        loop = _get_event_loop()
        analysis = loop.run_until_complete(
            analyzer.analyze_defect(
                image_path=tmp.name,
                product_sku=product_sku,
                facility=facility,
                production_data=payload.get("metadata"),
            )
        )

    processed_payload = _build_processed_payload(image_id, analysis, payload)
    processed_blob_client.upload_blob(
        json.dumps(processed_payload),
        overwrite=True,
        content_settings=ContentSettings(content_type="application/json"),
    )


def main() -> None:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    queue_name = os.getenv("AZURE_SERVICEBUS_QUEUE", "defect-jobs")
    max_messages = int(os.getenv("WORKER_MAX_MESSAGES", "10"))
    max_delivery_attempts = int(os.getenv("WORKER_MAX_DELIVERY_ATTEMPTS", "5"))

    analyzer = WikoDefectAnalyzerGPT52()
    servicebus_client = _get_servicebus_client()

    processed = 0
    with servicebus_client:
        receiver = servicebus_client.get_queue_receiver(
            queue_name=queue_name,
            max_wait_time=10,
        )
        with receiver:
            while processed < max_messages:
                messages = receiver.receive_messages(max_message_count=1, max_wait_time=10)
                if not messages:
                    logger.info("No messages received, exiting")
                    break

                for message in messages:
                    try:
                        payload = _decode_message_body(message)
                        _process_message(analyzer, payload)
                        receiver.complete_message(message)
                        processed += 1
                        logger.info("Processed message %s", payload.get("image_id"))
                    except Exception as exc:
                        logger.exception("Failed processing message: %s", exc)
                        if message.delivery_count >= max_delivery_attempts:
                            receiver.dead_letter_message(
                                message,
                                reason="processing-failed",
                                error_description=str(exc),
                            )
                        else:
                            receiver.abandon_message(message)


if __name__ == "__main__":
    main()
