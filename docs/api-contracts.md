# Service Contracts (Scaffold)

## Core (`services/core`)

- `GET /health`
- `GET /api/admin/metrics` (requires `x-platform-role: service_admin`)
- `GET /orgs`
- `POST /orgs`
- `GET /orgs/:orgId/notebooks`
- `POST /orgs/:orgId/notebooks`
- `GET /assets/busytex/*` (placeholder route space for GCS-backed static assets)
- `GET /auth/session` (requires a bearer session token header)

## Collaboration (`services/collab`)

- `WSS /` (Hocuspocus)
  - Auth token header required unless `COLLAB_AUTH_DISABLED=true`
  - Doc persistence: debounced in-memory snapshot placeholder

## Agents (`services/agents`)

- `GET /health`
- `POST /v1/notebooks/:notebookId/audit`
  - Body: `{ "provider": "byok" | "vertex", "rubric"?: string }`
  - `provider=vertex` requires header `x-platform-ai-grant: true`
