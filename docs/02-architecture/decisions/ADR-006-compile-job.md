# ADR-006: Compile as on-demand job (not always-on service)

Status: accepted (local prototype)  
Date: 2026-10

## Context

In-browser BusyTeX works but is heavy on weak devices and requires the tab to stay open. A long-lived “compile microservice” next to Core/Collab would idle-cost Cloud Run and still need queueing for TeX CPU. Core already fans out notebook SSE.

## Decision

1. **UI → Core `POST …/compile` → worker** (never browser → worker). SSE `compile.progress` | `done` | `failed`.
2. **Local worker** is an HTTP service (`COMPILE_MODE=server`, Compose `compile`) for easy triggering; **prod** can use the same image as Cloud Run Job or min-instances=0 service.
3. **Core owns ACL + storage + SSE** + internal snapshot/export/progress/failed (`x-internal-secret`).
4. **BusyTeX fallback** when `COMPILE_SERVICE_URL` is unset or the worker is unreachable.
5. **Worker uses XeLaTeX** (TeX Live), same `notebook.sty` template.

## Consequences

- Local: include `compile` in Compose `up`; Compile button uses the server path.
- Prod: point `COMPILE_SERVICE_URL` at Job trigger / scale-to-zero service; same UI.

## Alternatives considered

- **Always-on Compile HTTP service** — rejected; idle cost + no distinct trust boundary vs a job.
- **Only browser BusyTeX forever** — fine for desktop; weak for phones / leave-and-return.
- **TeX inside Core request** — rejected; Cloud Run timeouts/memory for full notebooks.
