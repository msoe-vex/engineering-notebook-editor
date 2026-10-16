# FR-compile: LaTeX preview & BusyTeX compile

Status: current  
Related: [api-contracts exports](../../03-reference/api-contracts.md)

## Summary

Per-entry LaTeX preview and notebook BusyTeX WASM compile produce PDF. Successful compile uploads `exports/latest.pdf` and sets `lastCompiled`.

## Actors and permissions

Notebook accessors.

## User-facing behavior

- Entry page: view toggle / LaTeX preview
- `/…/compile` — `CloudNotebookCompiler`
- Static BusyTeX / latex assets via Core `/static/busytex/*`, `/static/latex/*`

## Acceptance criteria

- [ ] Compile produces downloadable PDF
- [ ] `lastCompiled` and export URL available after success
- [ ] Quality vs compressed image mode selectable if exposed in UI

## Data and APIs

- `PUT|GET …/exports/:exportId/content|url` (use `latest`)
- Client: `compileCloudNotebook.ts` + `busytex` helpers (no legacy `compileNotebook` store path)

## Non-goals

- Server-side TeX live service (compile runs in browser WASM against uploaded content)
