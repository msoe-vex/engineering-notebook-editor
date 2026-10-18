# Runbook: Compile / PDF failures

## Symptoms

Server compile job stuck or fails; missing TeX packages; export upload 403; blank PDF; `503` compile_service_unavailable.

## Checks

1. Compose/Cloud Run **compile** worker healthy (`:8090/health`); Core `COMPILE_SERVICE_URL` / `JOB_DISPATCH`
2. Notebook SSE `job.progress` | `job.done` | `job.failed`; Firestore `…/jobs/{jobId}` status
3. Worker logs / `main.log` tail on XeLaTeX errors (e.g. missing `ulem.sty` → `texlive-plain-generic`)
4. Core export `PUT /internal/compile/export` and GCS `exports/latest.pdf`
5. Worker object pulls (`/internal/storage/object`) failing — empty TipTap/assets → empty/broken PDF

## Mitigations

- Restart `compile` + Core; confirm `INTERNAL_SERVICE_SECRET` matches
- Retry compile; check `lastCompiled` / export URL
- Do **not** rely on BusyTeX for large notebooks; optional escape only with `NEXT_PUBLIC_ALLOW_BUSYTEX_COMPILE=1`
- Related: [FR-compile](../../01-requirements/features/FR-compile.md), [ADR-006](../../02-architecture/decisions/ADR-006-compile-job.md)
