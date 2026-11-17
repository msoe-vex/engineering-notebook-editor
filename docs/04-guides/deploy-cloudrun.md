# Deploy (Cloud Run)

Script: [`infra/cloudrun/deploy.sh`](../../infra/cloudrun/deploy.sh)  
Build: [`infra/cloudrun/cloudbuild.yaml`](../../infra/cloudrun/cloudbuild.yaml)

## Prerequisites

- `gcloud` authenticated
- `PROJECT_ID` set
- Optional: `REGION` (default `us-central1`), `GCS_BUCKET`
- Pub/Sub API enabled on the project

## Steps

```bash
export PROJECT_ID=your-gcp-project
# optional: export REGION=us-central1 GCS_BUCKET=...
./infra/cloudrun/deploy.sh
```

The script:

1. Creates Pub/Sub topics `notebook-jobs-compile` / `notebook-jobs-judge` and pull subscriptions `…-worker` (idempotent)
2. Builds **core**, **collab**, **compile**, **judge**, **website** images
3. Deploys Core with `JOB_DISPATCH=pubsub` (no worker HTTP wake URLs)
4. Grants Core `roles/pubsub.publisher` on both topics
5. Deploys **compile** / **judge** pull workers with **min-instances=1** and **CPU always allocated** (`--no-cpu-throttling`), and grants `roles/pubsub.subscriber` on their subscriptions
6. Deploys collab (HTTP/2 + session affinity) and website with `NEXT_PUBLIC_*` URLs

Production should keep `AUTH_FALLBACK=false` and `COLLAB_AUTH_DISABLED=false` (script defaults).

### Pull workers must stay alive

Cloud Run scale-to-zero is incompatible with long-lived Pub/Sub **pull** subscribers. Keep `min-instances ≥ 1` and CPU always-on for `compile-service` / `judge-service`. Health remains `GET /health` only — Core does not `POST /jobs` to workers.

## After deploy

- Confirm Firebase Auth authorized domains include the website Cloud Run URL
- Smoke: sign-in → create org → entry → collab → compile (Pub/Sub lag / worker logs if stuck)
- See [smoke-tests.md](./smoke-tests.md) and [local-development.md](./local-development.md) Compose checklist
- Core **SSE** (`GET …/notebooks/:id/events`) sends a ping every ~25 s; ensure Cloud Run / load balancer idle timeouts stay above that (and prefer request timeout ≥ 3600 s for long-lived streams if you terminate SSE at a proxy)
- Optional Core env: `BODY_LIMIT_BYTES` (default 64 MiB), `NOTIFICATION_PROVIDER=resend` + `RESEND_API_KEY` when ready
