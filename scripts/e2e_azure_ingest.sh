#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-}"
API_KEY="${API_KEY:-}"
IMAGE_PATH="${IMAGE_PATH:-test_images/knife.jpg}"
PRODUCT_SKU="${PRODUCT_SKU:-WK-KN-200}"
FACILITY="${FACILITY:-yangjiang}"

AZURE_RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-}"
AZURE_SERVICEBUS_NAMESPACE="${AZURE_SERVICEBUS_NAMESPACE:-}"
AZURE_SERVICEBUS_QUEUE="${AZURE_SERVICEBUS_QUEUE:-defect-jobs}"
AZURE_STORAGE_ACCOUNT="${AZURE_STORAGE_ACCOUNT:-}"
AZURE_STORAGE_PROCESSED_CONTAINER="${AZURE_STORAGE_PROCESSED_CONTAINER:-processed-images}"
AZURE_WORKER_JOB_NAME="${AZURE_WORKER_JOB_NAME:-defectiq-worker}"

if [[ -z "$API_URL" ]]; then
  echo "API_URL is required (e.g. https://your-api.example.com)"
  exit 1
fi
if [[ -z "$AZURE_RESOURCE_GROUP" ]]; then
  echo "AZURE_RESOURCE_GROUP is required"
  exit 1
fi
if [[ -z "$AZURE_SERVICEBUS_NAMESPACE" ]]; then
  echo "AZURE_SERVICEBUS_NAMESPACE is required"
  exit 1
fi
if [[ -z "$AZURE_STORAGE_ACCOUNT" ]]; then
  echo "AZURE_STORAGE_ACCOUNT is required"
  exit 1
fi

if [[ ! -f "$IMAGE_PATH" ]]; then
  echo "Image not found at $IMAGE_PATH"
  exit 1
fi

echo "Ingesting image..."
curl_args=(-sS -X POST "${API_URL}/api/v1/ingest"
  -F "image=@${IMAGE_PATH}"
  -F "product_sku=${PRODUCT_SKU}"
  -F "facility=${FACILITY}"
)
if [[ -n "$API_KEY" ]]; then
  curl_args+=(-H "X-API-Key: ${API_KEY}")
fi

ingest_response="$(curl "${curl_args[@]}")"
echo "Ingest response: ${ingest_response}"

image_id="$(python - <<'PY'
import json,sys
payload = json.loads(sys.stdin.read())
print(payload.get("image_id",""))
PY
<<< "${ingest_response}")"

if [[ -z "$image_id" ]]; then
  echo "Failed to parse image_id from ingest response"
  exit 1
fi

processed_blob_name="${image_id}.json"
echo "Waiting for worker to process image_id=${image_id}"

attempts=0
max_attempts=30
sleep_seconds=10
while [[ $attempts -lt $max_attempts ]]; do
  active_count="$(az servicebus queue show \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --namespace-name "${AZURE_SERVICEBUS_NAMESPACE}" \
    --name "${AZURE_SERVICEBUS_QUEUE}" \
    --query "countDetails.activeMessageCount" -o tsv)"

  exists="$(az storage blob exists \
    --account-name "${AZURE_STORAGE_ACCOUNT}" \
    --container-name "${AZURE_STORAGE_PROCESSED_CONTAINER}" \
    --name "${processed_blob_name}" \
    --auth-mode login \
    --query "exists" -o tsv)"

  echo "Queue active messages: ${active_count}, processed blob exists: ${exists}"

  if [[ "${exists}" == "True" || "${exists}" == "true" ]]; then
    echo "✅ Processed blob found: ${AZURE_STORAGE_PROCESSED_CONTAINER}/${processed_blob_name}"
    exit 0
  fi

  attempts=$((attempts + 1))
  sleep "${sleep_seconds}"
done

echo "❌ Timed out waiting for processed blob."
echo "Attempting to fetch worker logs..."

execution_name="$(az containerapp job execution list \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --name "${AZURE_WORKER_JOB_NAME}" \
  --query "[0].name" -o tsv)"

if [[ -n "$execution_name" ]]; then
  az containerapp job execution logs show \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${AZURE_WORKER_JOB_NAME}" \
    --execution "${execution_name}" \
    --tail 200 || true
else
  echo "No worker executions found for ${AZURE_WORKER_JOB_NAME}"
fi

exit 1
