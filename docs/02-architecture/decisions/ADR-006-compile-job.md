# ADR-006: Async notebook jobs (compile first)

Status: accepted  
Date: 2026-10 (revised)

Sequence diagrams: [diagrams.md — compile job](../diagrams.md#sequence-async-compile-job).

## Context

Full-notebook PDF compile is too heavy for Core request timeouts and for in-browser BusyTeX at scale (hundreds of pages/assets). Other work (asset post-process, server-side audits) will need the same durable enqueue → worker → progress pattern. Core already fans out notebook SSE.

## Decision

1. **Generic notebook jobs** under `organizations/{orgId}/notebooks/{notebookId}/jobs/{jobId}` with `type`, `resourceKey`, `payload`, `result`, and status machine (`queued|running|succeeded|failed|cancelled`).
2. **Single-flight** per `(notebookId, type, resourceKey)` via `jobLocks/…` — duplicate enqueue returns `409` with the in-flight `jobId`.
3. **UI → Core only** — `POST …/jobs` or shortcut `POST …/compile` (`type: "compile"`). Never browser → worker.
4. **SSE** `job.progress` | `job.done` | `job.failed` (include `jobType`).
5. **`JobDispatchPort`** — local `HttpJobDispatch` (`COMPILE_SERVICE_URL` / `JOB_WORKER_URLS`); prod later Cloud Tasks (`JOB_DISPATCH=tasks`). Core routes never hardcode Tasks vs HTTP.
6. **Compile worker** (`services/compile`) runs XeLaTeX; reports via `/internal/compile/*` which update job docs + SSE.
7. **Snapshot is metadata-only** — TipTap GCS keys + asset paths; worker pulls bytes via `/internal/storage/object` (avoids multi‑MiB JSON / Core body limits as asset counts grow).
8. **BusyTeX** is **not** a production fallback. Optional local escape only when `NEXT_PUBLIC_ALLOW_BUSYTEX_COMPILE=1`. Default local = Compose `compile` for parity with prod.

Job types: `compile` (shipped), `judge` (shipped — Python LangGraph worker via `services/judge`, [ADR-007](./ADR-007-python-langgraph-judge.md)). Reserved: `asset.process`, `audit.run` (legacy browser audits may remain until fully replaced).

## Consequences

- Local: include `compile` in Compose `up`; Compile button uses the server job path.
- Prod: point `COMPILE_SERVICE_URL` (or Tasks) at scale-to-zero service / Job; same UI and job docs.
- Future workers plug in via type → URL map without new Core public APIs.

## Alternatives considered

- **Always-on compile microservice with no job docs** — rejected; no single-flight, harder to resume UI, poor base for other job types.
- **BusyTeX as peer engine** — rejected for full-notebook PDF; too slow/fragile at scale.
- **TeX inside Core request** — rejected; Cloud Run timeouts/memory.
- **Pub/Sub required for modularity** — rejected for now; Cloud Tasks (or HTTP) is enough; shared **job protocol** is the modularity.
