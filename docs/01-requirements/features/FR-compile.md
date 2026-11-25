# FR-compile: LaTeX preview & server compile

Status: partial  
Related: [api-contracts jobs](../../03-reference/api-contracts.md), [ADR-006](../../02-architecture/decisions/ADR-006-compile-job.md), [FR-entries-collab](./FR-entries-collab.md)

## Summary

Per-entry LaTeX source preview and **server XeLaTeX jobs** produce the notebook PDF. Successful compile always mints a **new version** (`latestExportId` + `latest.pdf` alias). Up to **`MAX_COMPILE_EXPORTS` (10)** versions are retained; at the limit, compile returns **409** until the user deletes an older PDF — [FR-public-notebook](./FR-public-notebook.md).

## Actors and permissions

Notebook accessors. Share-link publish/revoke: org admin/owner (from the Compile page).

## User-facing behavior

- Entry page: ViewToggle (editor / split / LaTeX) with live LaTeX source from the open doc
- `/…/compile` — full-height `CloudNotebookCompiler` (named versions + share-links manager + PDF preview)
- Compile excludes templates, trashed entries, and entries flagged `hidden` (Hide from PDF)
- Compile enqueues a notebook job (`type: compile`); progress via SSE `job.*` with short user-facing `status` / `detail`

## Acceptance criteria

- [ ] Compile produces downloadable PDF via server job
- [x] Each successful compile creates a new export; `latestExportId` + export URL available after success
- [x] At most 10 versions retained; further compiles blocked until a version is deleted
- [x] Compile uses the single compressed image assets (no quality/original picker)
- [x] Split / LaTeX modes update live from editor content + metadata
- [x] No automatic BusyTeX fallback (optional `NEXT_PUBLIC_ALLOW_BUSYTEX_COMPILE` escape only)
- [x] Compile UI shows current-status-only progress (percent + single status line; no rolling stage log)

## Data and APIs

- `POST …/compile` or `POST …/jobs` `{ type: "compile" }`
- `GET …/exports` — retained versions (max 10); `PUT|GET|DELETE …/exports/:exportId/…`
- SSE `job.progress` | `job.done` | `job.failed` — progress may include `stage`, `detail`

## Server compile (local + future Tasks)

- Compile page → Core job → Compose/Cloud Run worker [`services/compile`](../../../services/compile/README.md) → SSE ([ADR-006](../../02-architecture/decisions/ADR-006-compile-job.md))
- Local: include `compile` in Compose `up` (parity with prod)
- BusyTeX WASM retained only as an explicit local escape hatch, not a scale path

## Non-goals

- Running full TeX inside a Core request (timeouts / memory)
- Treating BusyTeX as a peer production engine for full-notebook PDF
