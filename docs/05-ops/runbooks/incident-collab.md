# Runbook: Collab / sync issues

## Symptoms

Editors diverge; “disconnected”; content missing after reload; flush errors in Collab logs.

## Checks

1. Collab service up; `NEXT_PUBLIC_COLLAB_WS_URL` / Cloud Run WSS (`wss://`)
2. Session affinity + HTTP/2 on Collab Cloud Run
3. `COLLAB_AUTH_DISABLED` must be false in prod
4. Core reachable from Collab (`CORE_API_URL`) for flush / `GET /internal/collab/yjs`
5. Local fake-gcs: Core must use `GCS_EMULATOR_ENDPOINT=http://gcs:4443` (not `STORAGE_EMULATOR_HOST`) and compose `-public-host`/`-external-url` must be `gcs:4443`. Wrong host or the Node env var makes `download()`/`exists()` 404 while `save()` still works.
6. Document name matches `org:…:notebook:…:entry:…`

## Mitigations

- Restart Collab revision; verify Core `/internal/collab/flush`
- Have users hard-refresh; compare GCS tipTap vs Yjs if investigating data loss
- See [realtime.md](../../02-architecture/realtime.md)
