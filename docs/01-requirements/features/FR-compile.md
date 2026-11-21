# FR-compile: LaTeX preview & server compile

Status: partial  
Related: [api-contracts jobs](../../03-reference/api-contracts.md), [ADR-006](../../02-architecture/decisions/ADR-006-compile-job.md), [FR-entries-collab](./FR-entries-collab.md)

## Summary

Per-entry LaTeX source preview and **server XeLaTeX jobs** produce the notebook PDF. Successful compile writes a versioned export (+ `latest.pdf` alias), sets `lastCompiled` / `latestExportId`, and **prunes** older exports that are neither latest nor the shared (`publicExportId`) PDF — [FR-public-notebook](./FR-public-notebook.md).

## Actors and permissions

Notebook accessors. Share-link publish/revoke: org admin/owner.

## User-facing behavior

- Entry page: ViewToggle (editor / split / LaTeX) with live LaTeX source from the open doc
- `/…/compile` — full-height `CloudNotebookCompiler` (version list + PDF preview; share link + delete)
- Compile enqueues a notebook job (`type: compile`); progress via SSE `job.*` with optional `stage` / `detail`

## Acceptance criteria

- [ ] Compile produces downloadable PDF via server job
- [x] `lastCompiled` / `latestExportId` and export URL available after success
- [x] At most latest + shared PDF retained; non-shared older versions pruned
- [x] Compile uses the single compressed image assets (no quality/original picker)
- [x] Split / LaTeX modes update live from editor content + metadata
- [x] No automatic BusyTeX fallback (optional `NEXT_PUBLIC_ALLOW_BUSYTEX_COMPILE` escape only)
- [x] Compile UI shows staged SSE messages (`fetch` / `tex` / `xelatex` / `upload`) plus percent

## Data and APIs

- `POST …/compile` or `POST …/jobs` `{ type: "compile" }`
- `GET …/exports` — retained versions; `PUT|GET|DELETE …/exports/:exportId/…`
- SSE `job.progress` | `job.done` | `job.failed` — progress may include `stage`, `detail`

## Server compile (local + future Tasks)

- Compile page → Core job → Compose/Cloud Run worker [`services/compile`](../../../services/compile/README.md) → SSE ([ADR-006](../../02-architecture/decisions/ADR-006-compile-job.md))
- Local: include `compile` in Compose `up` (parity with prod)
- BusyTeX WASM retained only as an explicit local escape hatch, not a scale path

## Non-goals

- Running full TeX inside a Core request (timeouts / memory)
- Treating BusyTeX as a peer production engine for full-notebook PDF
