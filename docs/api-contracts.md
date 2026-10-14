# Service contracts

Local testing: [local-development.md](./local-development.md). Architecture: [microservices-architecture.md](./microservices-architecture.md).

## Nested tenancy paths

Firestore / GCS nest under organizations:

- `organizations/{orgId}/members/{uid}`
- `organizations/{orgId}/notebooks/{notebookId}`
- `organizations/{orgId}/notebooks/{notebookId}/entries/{entryId}` (metadata + GCS pointers only)
- `organizations/{orgId}/notebooks/{notebookId}/assets/{assetId}`
- `organizations/{orgId}/notebooks/{notebookId}/audits/{auditId}`
- Top-level: `users/{uid}`, `invites/{inviteId}`, `metrics/…`

HTTP uses short `/orgs/...` routes that map to the nested collections.

Collab document names: `org:{orgId}:notebook:{notebookId}:entry:{entryId}`

## Core (`services/core`)

Auth: `Authorization: Bearer <Firebase ID token | local uid>`

- `GET /health`
- `GET /auth/session`
- `POST /users/me/bootstrap`, `GET /users/me`
- `GET/POST /orgs`
- `GET/PATCH/DELETE /orgs/:orgId`
- `GET/POST /orgs/:orgId/members`, `PATCH/DELETE /orgs/:orgId/members/:uid`
- `GET/POST /orgs/:orgId/invites`, `DELETE /orgs/:orgId/invites/:inviteId`, `POST /invites/:inviteId/accept`
- `GET/POST /orgs/:orgId/notebooks`
- `GET/PATCH/DELETE /orgs/:orgId/notebooks/:notebookId`
- `GET/POST /orgs/:orgId/notebooks/:notebookId/entries`
- `GET/PATCH/DELETE /orgs/:orgId/notebooks/:notebookId/entries/:entryId`
- `GET/PUT .../entries/:entryId/content` (TipTap JSON via GCS)
- `GET/POST /orgs/:orgId/notebooks/:notebookId/assets`
- `GET .../assets/:assetId/url`, `DELETE .../assets/:assetId`
- `GET /static/busytex/*`, `GET /static/latex/*`
- Admin (`service_admin`): `GET /api/admin/metrics`, `GET/PATCH /api/admin/users`, `GET /api/admin/orgs`
- Internal: `POST /internal/collab/flush`, `POST /internal/collab/connections`

## Collaboration (`services/collab`)

- `WSS /` (Hocuspocus)
  - Auth token required unless `COLLAB_AUTH_DISABLED=true`
  - Org membership checked from document name
  - Debounced flush → Core `/internal/collab/flush` (Firestore meta + GCS Yjs/TipTap)

## Agents (`services/agents`)

- `GET /health`
- `POST /v1/orgs/:orgId/notebooks/:notebookId/audit`
  - Body: `{ "provider": "byok" | "vertex", "rubric"?: string, "byokApiKey"?: string, "entries"?: [...] }`
  - `provider=vertex` requires `users/{uid}.grants.platformAi` (or service_admin)
- `GET /v1/orgs/:orgId/notebooks/:notebookId/audits`
