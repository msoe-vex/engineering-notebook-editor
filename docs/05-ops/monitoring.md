# Monitoring

Status: baseline (expand with production exporters as needed).

## Health endpoints

| Service | Check |
| --- | --- |
| Core | `GET /health` |
| Agents | `GET /health` |
| Collab | process up + WSS accept (no public HTTP health required) |
| Website | HTTP 200 on `/` (auth chrome) |

## Admin metrics

Core `GET /api/admin/metrics` — **in-memory** today (not durable). See [FR-admin](../01-requirements/features/FR-admin.md) / backlog.

## What to watch

- Auth failures spike (401/403 on Core)
- Collab flush errors / backlog (Core `/internal/collab/flush`)
- GCS signed URL / upload failures
- Compile client errors (browser-side BusyTeX; correlate with static asset 404s)

## Runbooks

[runbooks/](./runbooks/)
