# Runbook: Compile / PDF failures

## Symptoms

BusyTeX stuck or fails; missing fonts/packages; export upload 403; blank PDF.

## Checks

1. Browser console / compile status steps
2. Static assets: Core `/static/busytex/*`, `/static/latex/*`, website rewrites
3. Manifest `/latex/manifest.json` and template `/notebook-template/*`
4. Core export `PUT …/exports/latest/content` auth
5. Entry TipTap fetch failures (GCS signed URLs)

## Mitigations

- Re-run BusyTeX asset download/upload scripts if statics empty
- Retry compile; check `lastCompiled` / export URL
- Related: [FR-compile](../../01-requirements/features/FR-compile.md)
