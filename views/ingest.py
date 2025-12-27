"""
Ingest endpoint for Azure-backed processing pipeline.
Uploads raw images to Blob Storage and enqueues a Service Bus message.
"""

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from azure.core.exceptions import ResourceExistsError
from azure.identity import DefaultAzureCredential
from azure.servicebus import ServiceBusClient, ServiceBusMessage
from azure.storage.blob import BlobServiceClient, ContentSettings
from flask import Blueprint, jsonify, request

from utils.auth import require_api_key
from utils.validation import validate_image_file, validate_facility, validate_product_sku

logger = logging.getLogger(__name__)

ingest_bp = Blueprint("ingest_bp", __name__)

_blob_service_client: Optional[BlobServiceClient] = None
_servicebus_client: Optional[ServiceBusClient] = None


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


def _ensure_container_exists(container_name: str) -> None:
    blob_service = _get_blob_service_client()
    container_client = blob_service.get_container_client(container_name)
    try:
        container_client.create_container()
    except ResourceExistsError:
        return


@ingest_bp.route("/ingest", methods=["POST"])
@require_api_key
def ingest_image():
    """
    Ingest an image for async processing.

    Request:
        - image: Image file (JPEG/PNG/WebP, max 16MB)
        - product_sku: Product SKU (required)
        - facility: Facility code (required)
        - metadata: Optional JSON string (batch_id, shift, etc.)
    """
    if "image" not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    file = request.files["image"]
    if not file or file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    is_valid, error_msg = validate_image_file(file)
    if not is_valid:
        logger.warning("Invalid file upload: %s", error_msg)
        return jsonify({"error": error_msg}), 400

    product_sku = request.form.get("product_sku", "").strip().upper()
    is_valid, error_msg = validate_product_sku(product_sku)
    if not is_valid:
        return jsonify({"error": error_msg}), 400

    facility = request.form.get("facility", "").strip().lower()
    is_valid, error_msg = validate_facility(facility)
    if not is_valid:
        return jsonify({"error": error_msg}), 400

    metadata = {}
    if request.form.get("metadata"):
        try:
            metadata = json.loads(request.form["metadata"])
        except json.JSONDecodeError:
            return jsonify({"error": "Invalid metadata JSON"}), 400

    raw_container = os.getenv("AZURE_STORAGE_RAW_CONTAINER", "raw-images")
    processed_container = os.getenv("AZURE_STORAGE_PROCESSED_CONTAINER", "processed-images")
    queue_name = os.getenv("AZURE_SERVICEBUS_QUEUE", "defect-jobs")

    _ensure_container_exists(raw_container)
    _ensure_container_exists(processed_container)

    image_id = str(uuid.uuid4())
    filename = file.filename or "upload.jpg"
    ext = os.path.splitext(filename)[1].lower()
    if not ext:
        ext = ".jpg"
    blob_name = f"{image_id}{ext}"

    received_at = datetime.now(timezone.utc).isoformat()

    blob_service = _get_blob_service_client()
    blob_client = blob_service.get_blob_client(container=raw_container, blob=blob_name)

    content_settings = ContentSettings(content_type=file.mimetype or "application/octet-stream")
    blob_metadata = {
        "image_id": image_id,
        "product_sku": product_sku,
        "facility": facility,
        "received_at": received_at,
    }

    file.stream.seek(0)
    blob_client.upload_blob(
        file.stream,
        overwrite=True,
        metadata=blob_metadata,
        content_settings=content_settings,
    )

    message_body = {
        "image_id": image_id,
        "blob_name": blob_name,
        "raw_container": raw_container,
        "processed_container": processed_container,
        "product_sku": product_sku,
        "facility": facility,
        "received_at": received_at,
        "content_type": file.mimetype,
        "metadata": metadata,
    }

    servicebus_client = _get_servicebus_client()
    with servicebus_client:
        sender = servicebus_client.get_queue_sender(queue_name=queue_name)
        with sender:
            sender.send_messages(
                ServiceBusMessage(
                    json.dumps(message_body),
                    content_type="application/json",
                    message_id=image_id,
                )
            )

    return jsonify({
        "success": True,
        "image_id": image_id,
        "blob_name": blob_name,
        "raw_container": raw_container,
        "queue": queue_name,
        "enqueued_at": received_at,
    }), 202
