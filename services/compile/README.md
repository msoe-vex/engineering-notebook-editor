# Compile worker

On-demand XeLaTeX worker for notebook PDFs (`job type: compile`). Talks to Core over internal APIs; the website never calls this service directly.

See [ADR-006](../../docs/02-architecture/decisions/ADR-006-compile-job.md) and [ADR-008](../../docs/02-architecture/decisions/ADR-008-job-dispatch-evolution.md).

## Modes

| `COMPILE_MODE` | Behavior |
| --- | --- |
| `server` (default) | HTTP health on `:8090` + **Pub/Sub pull** subscriber for jobs |
| `job` | One-shot CLI — Cloud Run Job / `docker compose run` |

## Local (wired to UI)

```bash
cd infra
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build firebase gcs pubsub core collab compile judge website
```

Core uses `JOB_DISPATCH=pubsub`. On **Compile** in the app:

1. Browser `POST /orgs/…/notebooks/…/compile` → durable job → `202 { jobId }` (or `409` if in flight)
2. Core `JobDispatchPort` publishes to `notebook-jobs-compile`
3. Worker pull → fetches **metadata** snapshot → TipTap + assets via `/internal/storage/object` → XeLaTeX → `PUT /internal/compile/export`
4. SSE `job.progress` / `job.done` / `job.failed`
5. UI refreshes the PDF

BusyTeX is **not** the default fallback. Optional: `NEXT_PUBLIC_ALLOW_BUSYTEX_COMPILE=1`.

## Prod (Cloud Run)

Pull process must stay alive: **min instances ≥ 1** and CPU always allocated — see [deploy-cloudrun.md](../../docs/04-guides/deploy-cloudrun.md).

## One-shot

```bash
docker compose -f docker-compose.yml run --rm \
  -e COMPILE_MODE=job \
  -e ORG_ID=… -e NOTEBOOK_ID=… \
  compile
```
