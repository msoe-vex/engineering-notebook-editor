# Runbook: Collab / sync issues

## Symptoms

Editors diverge; “disconnected”; content missing after reload; flush errors in Collab logs.

## Checks

1. Collab service up; `NEXT_PUBLIC_COLLAB_WS_URL` / Cloud Run WSS (`wss://`)
2. Session affinity + HTTP/2 on Collab Cloud Run
3. `COLLAB_AUTH_DISABLED` must be false in prod
4. Core reachable from Collab (`CORE_API_URL`) for flush
5. Document name matches `org:…:notebook:…:entry:…`

## Mitigations

- Restart Collab revision; verify Core `/internal/collab/flush`
- Have users hard-refresh; compare GCS tipTap vs Yjs if investigating data loss
- See [realtime.md](../../02-architecture/realtime.md)
