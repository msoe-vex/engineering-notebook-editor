# Compile worker

On-demand XeLaTeX worker for notebook PDFs (`job type: compile`). Talks to Core over internal APIs; the website never calls this service directly.

See [ADR-006](../../docs/02-architecture/decisions/ADR-006-compile-job.md) for the generic job model.

## Modes

| `COMPILE_MODE` | Behavior |
| --- | --- |
| `server` (default) | HTTP on `:8090` — `POST /jobs` queues work (local Compose / Cloud Run service, min instances 0) |
| `job` | One-shot CLI — Cloud Run Job / `docker compose run` |

## Local (wired to UI)

```bash
cd infra
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build firebase gcs core collab compile
```

Core has `COMPILE_SERVICE_URL=http://compile:8090` and `JOB_DISPATCH=http`. On **Compile** in the app:

1. Browser `POST /orgs/…/notebooks/…/compile` → durable job → `202 { jobId }` (or `409` if in flight)
2. Core `JobDispatchPort` POSTs worker `/jobs`
3. Worker fetches **metadata** snapshot → pulls TipTap + assets via `/internal/storage/object` → XeLaTeX → `PUT /internal/compile/export`
4. SSE `job.progress` / `job.done` / `job.failed`
5. UI refreshes the PDF

Snapshot never embeds asset bytes (scales to many images per notebook).

BusyTeX is **not** the default fallback. Optional: `NEXT_PUBLIC_ALLOW_BUSYTEX_COMPILE=1`.

## One-shot

```bash
docker compose -f docker-compose.yml run --rm \
  -e COMPILE_MODE=job \
  -e ORG_ID=… -e NOTEBOOK_ID=… \
  compile
```

## APIs

**Worker**

| Method | Path | Auth |
| --- | --- | --- |
| `GET` | `/health` | — |
| `POST` | `/jobs` `{ orgId, notebookId, jobId, type?, payload? }` | `x-internal-secret` |

**Core (user)**

| Method | Path |
| --- | --- |
| `POST` | `/orgs/:orgId/notebooks/:notebookId/compile` → `202` / `409` / `503` |
| `POST` | `/orgs/:orgId/notebooks/:notebookId/jobs` — generic enqueue |
| `GET` | `/orgs/:orgId/notebooks/:notebookId/jobs/:jobId` |

**Core (internal)** — see [api-contracts](../../docs/03-reference/api-contracts.md)
