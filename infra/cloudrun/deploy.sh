#!/usr/bin/env bash
# Deploy all Cloud Run services. Requires gcloud auth and PROJECT_ID.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-us-central1}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

TOPIC_COMPILE="${PUBSUB_TOPIC_COMPILE:-notebook-jobs-compile}"
TOPIC_JUDGE="${PUBSUB_TOPIC_JUDGE:-notebook-jobs-judge}"
SUB_COMPILE="${PUBSUB_SUBSCRIPTION_COMPILE:-notebook-jobs-compile-worker}"
SUB_JUDGE="${PUBSUB_SUBSCRIPTION_JUDGE:-notebook-jobs-judge-worker}"

echo "Ensuring Pub/Sub topics + subscriptions…"
gcloud pubsub topics create "$TOPIC_COMPILE" --project="$PROJECT_ID" 2>/dev/null || true
gcloud pubsub topics create "$TOPIC_JUDGE" --project="$PROJECT_ID" 2>/dev/null || true
gcloud pubsub subscriptions create "$SUB_COMPILE" \
  --topic="$TOPIC_COMPILE" --project="$PROJECT_ID" 2>/dev/null || true
gcloud pubsub subscriptions create "$SUB_JUDGE" \
  --topic="$TOPIC_JUDGE" --project="$PROJECT_ID" 2>/dev/null || true

echo "Building images…"
gcloud builds submit "$REPO_ROOT" --config="$REPO_ROOT/infra/cloudrun/cloudbuild.yaml" --project="$PROJECT_ID"

CORE_IMAGE="gcr.io/${PROJECT_ID}/core-service"
COLLAB_IMAGE="gcr.io/${PROJECT_ID}/collab-service"
WEBSITE_IMAGE="gcr.io/${PROJECT_ID}/website-service"
COMPILE_IMAGE="gcr.io/${PROJECT_ID}/compile-service"
JUDGE_IMAGE="gcr.io/${PROJECT_ID}/judge-service"

gcloud run deploy core-service \
  --image "$CORE_IMAGE" \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars "FIREBASE_PROJECT_ID=${PROJECT_ID},GCS_BUCKET=${GCS_BUCKET:-${PROJECT_ID}-notebook},AUTH_FALLBACK=false,VERTEX_STUB=false,JOB_DISPATCH=pubsub,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},PUBSUB_TOPIC_COMPILE=${TOPIC_COMPILE},PUBSUB_TOPIC_JUDGE=${TOPIC_JUDGE}" \
  --project "$PROJECT_ID"

CORE_URL="$(gcloud run services describe core-service --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"

# Grant Core publish on job topics
CORE_SA="$(gcloud run services describe core-service --region "$REGION" --project "$PROJECT_ID" --format='value(spec.template.spec.serviceAccountName)')"
if [[ -z "${CORE_SA}" || "${CORE_SA}" == "null" ]]; then
  CORE_SA="${PROJECT_ID}-compute@developer.gserviceaccount.com"
fi
gcloud pubsub topics add-iam-policy-binding "$TOPIC_COMPILE" \
  --member="serviceAccount:${CORE_SA}" --role="roles/pubsub.publisher" --project="$PROJECT_ID" || true
gcloud pubsub topics add-iam-policy-binding "$TOPIC_JUDGE" \
  --member="serviceAccount:${CORE_SA}" --role="roles/pubsub.publisher" --project="$PROJECT_ID" || true

gcloud run deploy collab-service \
  --image "$COLLAB_IMAGE" \
  --region "$REGION" \
  --allow-unauthenticated \
  --use-http2 \
  --session-affinity \
  --set-env-vars "FIREBASE_PROJECT_ID=${PROJECT_ID},CORE_API_URL=${CORE_URL},COLLAB_AUTH_DISABLED=false,AUTH_FALLBACK=false" \
  --project "$PROJECT_ID"

COLLAB_URL="$(gcloud run services describe collab-service --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"
COLLAB_WS="${COLLAB_URL/https:/wss:}"

# Pull workers must stay alive (CPU always allocated + min instances ≥ 1).
# Scale-to-zero will miss Pub/Sub pull messages.
echo "Deploying compile / judge pull workers (min-instances=1, cpu always)…"
gcloud run deploy compile-service \
  --image "$COMPILE_IMAGE" \
  --region "$REGION" \
  --no-allow-unauthenticated \
  --min-instances=1 \
  --cpu=1 \
  --no-cpu-throttling \
  --set-env-vars "CORE_API_URL=${CORE_URL},GOOGLE_CLOUD_PROJECT=${PROJECT_ID},PUBSUB_SUBSCRIPTION_COMPILE=${SUB_COMPILE},COMPILE_MODE=server" \
  --project "$PROJECT_ID"

gcloud run deploy judge-service \
  --image "$JUDGE_IMAGE" \
  --region "$REGION" \
  --no-allow-unauthenticated \
  --min-instances=1 \
  --cpu=1 \
  --no-cpu-throttling \
  --set-env-vars "CORE_API_URL=${CORE_URL},GOOGLE_CLOUD_PROJECT=${PROJECT_ID},PUBSUB_SUBSCRIPTION_JUDGE=${SUB_JUDGE}" \
  --project "$PROJECT_ID"

for svc in compile-service judge-service; do
  SA="$(gcloud run services describe "$svc" --region "$REGION" --project "$PROJECT_ID" --format='value(spec.template.spec.serviceAccountName)')"
  if [[ -z "${SA}" || "${SA}" == "null" ]]; then
    SA="${PROJECT_ID}-compute@developer.gserviceaccount.com"
  fi
  SUB="$SUB_COMPILE"
  [[ "$svc" == "judge-service" ]] && SUB="$SUB_JUDGE"
  gcloud pubsub subscriptions add-iam-policy-binding "$SUB" \
    --member="serviceAccount:${SA}" --role="roles/pubsub.subscriber" --project="$PROJECT_ID" || true
done

gcloud run deploy website-service \
  --image "$WEBSITE_IMAGE" \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars "NEXT_PUBLIC_CORE_API_URL=${CORE_URL},NEXT_PUBLIC_COLLAB_WS_URL=${COLLAB_WS},NEXT_PUBLIC_ASSETS_BASE_URL=${CORE_URL},NEXT_PUBLIC_FIREBASE_PROJECT_ID=${PROJECT_ID}" \
  --project "$PROJECT_ID"

echo "Deployed. Core=${CORE_URL}"
echo "Note: compile/judge use Pub/Sub pull — keep min-instances ≥ 1 and CPU always allocated."
