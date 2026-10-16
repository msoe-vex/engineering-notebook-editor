# Deploy (Cloud Run)

Script: [`infra/cloudrun/deploy.sh`](../../infra/cloudrun/deploy.sh)  
Build: [`infra/cloudrun/cloudbuild.yaml`](../../infra/cloudrun/cloudbuild.yaml)

## Prerequisites

- `gcloud` authenticated
- `PROJECT_ID` set
- Optional: `REGION` (default `us-central1`), `GCS_BUCKET`

## Steps

```bash
export PROJECT_ID=your-gcp-project
# optional: export REGION=us-central1 GCS_BUCKET=...
./infra/cloudrun/deploy.sh
```

Deploys **core**, **collab** (HTTP/2 + session affinity), **agents**, then **website** with public service URLs injected as `NEXT_PUBLIC_*`.

Production should keep `AUTH_FALLBACK=false` and `COLLAB_AUTH_DISABLED=false` (script defaults).

## After deploy

- Confirm Firebase Auth authorized domains include the website Cloud Run URL
- Smoke: sign-in → create org → entry → collab → compile
- See [smoke-tests.md](./smoke-tests.md)
