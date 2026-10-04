#!/usr/bin/env bash
# Run only after confirming the selected project's billing/credits.
set -euo pipefail
: "${SHADY_GCP_PROJECT:?Set SHADY_GCP_PROJECT to the approved Google project ID}"
SHADY_GCP_REGION="${SHADY_GCP_REGION:-europe-west1}"
SHADY_IMAGE_TAG="${SHADY_IMAGE_TAG:-$(git rev-parse --short HEAD)}"
SHADY_IMAGE="${SHADY_GCP_REGION}-docker.pkg.dev/${SHADY_GCP_PROJECT}/shady/backend:${SHADY_IMAGE_TAG}"

# Build locally to avoid Cloud Build fees and extra service-account permissions.
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  --project="$SHADY_GCP_PROJECT"
if ! gcloud artifacts repositories describe shady --project="$SHADY_GCP_PROJECT" \
  --location="$SHADY_GCP_REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create shady --repository-format=docker \
    --project="$SHADY_GCP_PROJECT" --location="$SHADY_GCP_REGION" \
    --description="Shady public hackathon backend"
fi
gcloud auth configure-docker "${SHADY_GCP_REGION}-docker.pkg.dev" --quiet
docker build --platform linux/amd64 --tag "$SHADY_IMAGE" .
docker push "$SHADY_IMAGE"
gcloud run deploy shady-api --project="$SHADY_GCP_PROJECT" \
  --region="$SHADY_GCP_REGION" --image="$SHADY_IMAGE" \
  --allow-unauthenticated --cpu=2 --memory=4Gi --cpu-throttling \
  --no-cpu-boost --min=0 --max=1 --max-instances=1 --concurrency=1 \
  --timeout=300 --port=8080 --execution-environment=gen2 \
  --startup-probe=httpGet.path=/health,httpGet.port=8080,periodSeconds=5,timeoutSeconds=2,failureThreshold=48 \
  --set-env-vars=SHADY_DATA_DIR=/app/data/processed,SHADY_LOG_FILE= \
  --quiet

gcloud run services describe shady-api --project="$SHADY_GCP_PROJECT" \
  --region="$SHADY_GCP_REGION" --format='value(status.url)'
