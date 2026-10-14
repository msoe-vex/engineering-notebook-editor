#!/usr/bin/env bash
# Deploy all Cloud Run services. Requires gcloud auth and PROJECT_ID.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-us-central1}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "Building images…"
gcloud builds submit "$REPO_ROOT" --config="$REPO_ROOT/infra/cloudrun/cloudbuild.yaml" --project="$PROJECT_ID"

CORE_IMAGE="gcr.io/${PROJECT_ID}/core-service"
COLLAB_IMAGE="gcr.io/${PROJECT_ID}/collab-service"
AGENTS_IMAGE="gcr.io/${PROJECT_ID}/agents-service"
WEBSITE_IMAGE="gcr.io/${PROJECT_ID}/website-service"

gcloud run deploy core-service \
  --image "$CORE_IMAGE" \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars "FIREBASE_PROJECT_ID=${PROJECT_ID},GCS_BUCKET=${GCS_BUCKET:-${PROJECT_ID}-notebook},AUTH_FALLBACK=false" \
  --project "$PROJECT_ID"

CORE_URL="$(gcloud run services describe core-service --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"

gcloud run deploy collab-service \
  --image "$COLLAB_IMAGE" \
  --region "$REGION" \
  --allow-unauthenticated \
  --use-http2 \
  --session-affinity \
  --set-env-vars "FIREBASE_PROJECT_ID=${PROJECT_ID},CORE_API_URL=${CORE_URL},COLLAB_AUTH_DISABLED=false,AUTH_FALLBACK=false" \
  --project "$PROJECT_ID"

gcloud run deploy agents-service \
  --image "$AGENTS_IMAGE" \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars "FIREBASE_PROJECT_ID=${PROJECT_ID},AUTH_FALLBACK=false,VERTEX_STUB=false" \
  --project "$PROJECT_ID"

COLLAB_URL="$(gcloud run services describe collab-service --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"
AGENTS_URL="$(gcloud run services describe agents-service --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"
COLLAB_WS="${COLLAB_URL/https:/wss:}"

gcloud run deploy website-service \
  --image "$WEBSITE_IMAGE" \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars "NEXT_PUBLIC_CORE_API_URL=${CORE_URL},NEXT_PUBLIC_AGENTS_API_URL=${AGENTS_URL},NEXT_PUBLIC_COLLAB_WS_URL=${COLLAB_WS},NEXT_PUBLIC_ASSETS_BASE_URL=${CORE_URL},NEXT_PUBLIC_FIREBASE_PROJECT_ID=${PROJECT_ID}" \
  --project "$PROJECT_ID"

echo "Deployed. Core=${CORE_URL}"
