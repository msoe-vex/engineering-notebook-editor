# FR-compile: LaTeX preview & server compile

Status: partial  
Related: [api-contracts jobs](../../03-reference/api-contracts.md), [ADR-006](../../02-architecture/decisions/ADR-006-compile-job.md), [FR-entries-collab](./FR-entries-collab.md)

## Summary

Per-entry LaTeX source preview and **server XeLaTeX jobs** produce the notebook PDF. Successful compile uploads `exports/latest.pdf` and sets `lastCompiled`.

## Actors and permissions

Notebook accessors.

## User-facing behavior

- Entry page: ViewToggle (editor / split / LaTeX) with live LaTeX source from the open doc
- `/…/compile` — full-height `CloudNotebookCompiler` (compact chrome + edge-to-edge PDF preview)
- Compile enqueues a notebook job (`type: compile`); progress via SSE `job.*`

## Acceptance criteria

- [ ] Compile produces downloadable PDF via server job
- [ ] `lastCompiled` and export URL available after success
- [x] Compile uses the single compressed image assets (no quality/original picker)
- [ ] Split / LaTeX modes update live from editor content + metadata
- [x] No automatic BusyTeX fallback (optional `NEXT_PUBLIC_ALLOW_BUSYTEX_COMPILE` escape only)

## Data and APIs

- `POST …/compile` or `POST …/jobs` `{ type: "compile" }`
- `PUT|GET …/exports/:exportId/content|url` (use `latest`)
- SSE `job.progress` | `job.done` | `job.failed`

## Server compile (local + future Tasks)

- Compile page → Core job → Compose/Cloud Run worker [`services/compile`](../../../services/compile/README.md) → SSE ([ADR-006](../../02-architecture/decisions/ADR-006-compile-job.md))
- Local: include `compile` in Compose `up` (parity with prod)
- BusyTeX WASM retained only as an explicit local escape hatch, not a scale path

## Non-goals

- Running full TeX inside a Core request (timeouts / memory)
- Treating BusyTeX as a peer production engine for full-notebook PDF
