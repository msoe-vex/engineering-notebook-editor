# Compile worker

On-demand XeLaTeX worker for notebook PDFs. Talks to Core over internal APIs; the website never calls this service directly.

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

Core has `COMPILE_SERVICE_URL=http://compile:8090`. On **Compile** in the app:

1. Browser `POST /orgs/…/notebooks/…/compile` → `202 { jobId }`
2. Core forwards to `compile` `/jobs`
3. Worker snapshots → XeLaTeX → `PUT /internal/compile/export`
4. SSE `compile.progress` / `compile.done` (or `failed`)
5. UI refreshes the PDF

If the worker is down, the page falls back to in-browser BusyTeX.

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
| `POST` | `/jobs` `{ orgId, notebookId, jobId }` | `x-internal-secret` |

**Core (user)**

| Method | Path |
| --- | --- |
| `POST` | `/orgs/:orgId/notebooks/:notebookId/compile` → `202` |

**Core (internal)** — see [api-contracts](../../docs/03-reference/api-contracts.md)
