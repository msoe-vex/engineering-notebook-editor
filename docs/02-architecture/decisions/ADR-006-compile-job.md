# ADR-006: Async notebook jobs (compile first)

Status: accepted  
Date: 2026-10 (revised)

Sequence diagrams: [diagrams.md — compile job](../diagrams.md#sequence-async-compile-job).

## Context

Full-notebook PDF compile is too heavy for Core request timeouts and for in-browser BusyTeX at scale (hundreds of pages/assets). Other work (asset post-process, notebook Judge) needs the same durable enqueue → worker → progress pattern. Core already fans out notebook SSE.

## Decision

1. **Generic notebook jobs** under `organizations/{orgId}/notebooks/{notebookId}/jobs/{jobId}` with `type`, `resourceKey`, `payload`, `result`, and status machine (`queued|running|succeeded|failed|cancelled`).
2. **Single-flight** per `(notebookId, type, resourceKey)` via `jobLocks/…` — duplicate enqueue returns `409` with the in-flight `jobId`.
3. **UI → Core only** — `POST …/jobs` or shortcut `POST …/compile` (`type: "compile"`). Never browser → worker.
4. **SSE** `job.progress` | `job.done` | `job.failed` (include `jobType`).
5. **`JobDispatchPort`** — wake path evolved to **Pub/Sub-only** ([ADR-008](./ADR-008-job-dispatch-evolution.md)). Core routes never hardcode transport details.
6. **Compile worker** (`services/compile`) runs XeLaTeX; reports via `/internal/compile/*` which update job docs + SSE.
7. **Snapshot is metadata-only** — TipTap GCS keys + asset paths; worker pulls bytes via `/internal/storage/object` (avoids multi‑MiB JSON / Core body limits as asset counts grow).
8. **BusyTeX** is **not** a production fallback. Optional local escape only when `NEXT_PUBLIC_ALLOW_BUSYTEX_COMPILE=1`. Default local = Compose `compile` for parity with prod.

Job types: `compile` (shipped), `judge` (shipped — Python LangGraph worker via `services/judge`, [ADR-007](./ADR-007-python-langgraph-judge.md)). Reserved: `asset.process`.

## Consequences

- Local: include `pubsub` + `compile` / `judge` pull workers in Compose; Compile button uses the server job path.
- Prod: same topics/subs; workers pull (see ADR-008). Same UI and job docs.

## Alternatives considered

- **Always-on compile microservice with no job docs** — rejected; no single-flight, harder to resume UI, poor base for other job types.
- **BusyTeX as peer engine** — rejected for full-notebook PDF; too slow/fragile at scale.
- **TeX inside Core request** — rejected; Cloud Run timeouts/memory.
- **Pub/Sub required for modularity** — originally deferred; later accepted for **local↔prod parity** of the wake path ([ADR-008](./ADR-008-job-dispatch-evolution.md)). Job protocol remains the modularity boundary.
