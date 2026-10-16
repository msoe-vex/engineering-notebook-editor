# Service contracts

Local testing: [local-development](../04-guides/local-development.md). Architecture: [overview](../02-architecture/overview.md). Schema: [schema.md](./schema.md). Requirements: [01-requirements](../01-requirements/).

## Nested tenancy paths

Firestore / GCS nest under organizations:

- `organizations/{orgId}/members/{uid}`
- `organizations/{orgId}/teams/{teamId}/members/{uid}`
- `organizations/{orgId}/notebooks/{notebookId}`
- `organizations/{orgId}/notebooks/{notebookId}/members/{memberId}` (roster credits)
- `organizations/{orgId}/notebooks/{notebookId}/entries/{entryId}` (metadata + GCS pointers only)
- `organizations/{orgId}/notebooks/{notebookId}/assets/{assetId}`
- `organizations/{orgId}/notebooks/{notebookId}/audits/{auditId}`
- Top-level: `users/{uid}`, `invites/{inviteId}`

HTTP uses short `/orgs/...` routes that map to the nested collections.

Collab document names: `org:{orgId}:notebook:{notebookId}:entry:{entryId}`

## Core (`services/core`)

Auth: `Authorization: Bearer <Firebase ID token | local uid>`

### Health / session / users

- `GET /health`
- `GET /auth/session`
- `POST /users/me/bootstrap`
- `GET /users/me`
- `PATCH /users/me` — `{ displayName?, preferences? }`  
  Preferences (non-secret): `theme`, `defaultAuthors`, `genai.{enabled,provider,models,baseUrls}`, `lastOrgId`, `explorerSort`. **Never store API keys.**

### Organizations

- `GET/POST /orgs`
- `GET/PATCH/DELETE /orgs/:orgId`
- `GET/POST /orgs/:orgId/members`, `PATCH/DELETE /orgs/:orgId/members/:uid`
- `GET/POST /orgs/:orgId/invites`, `DELETE /orgs/:orgId/invites/:inviteId`
- `POST /invites/:inviteId/accept` — rejects expired invites; optional email match when both invite + user have email  
  Create sets `expiresAt` (default 14 days, `INVITE_TTL_DAYS` / body `expiresInDays`)

### Org teams (ACL groups)

- `GET/POST /orgs/:orgId/teams`
- `GET/PATCH/DELETE /orgs/:orgId/teams/:teamId`
- `GET /orgs/:orgId/teams/:teamId/members`
- `PUT/DELETE /orgs/:orgId/teams/:teamId/members/:uid`

### Notebooks

- `GET/POST /orgs/:orgId/notebooks`
- `GET/PATCH/DELETE /orgs/:orgId/notebooks/:notebookId`  
  PATCH fields include `name`, `title`, `subtitle`, `logoAssetId`, `folders`, `access`, `phases`, `lastCompiled`  
  DELETE cascades entries/assets/audits GCS blobs + subcollections

### Notebook folders

- `POST /orgs/:orgId/notebooks/:notebookId/folders` — `{ name, parentId?, order? }`
- `PATCH /orgs/:orgId/notebooks/:notebookId/folders/:folderId`
- `DELETE /orgs/:orgId/notebooks/:notebookId/folders/:folderId` — clears entry `folderId`s

### Notebook roster (credits)

- `GET/POST /orgs/:orgId/notebooks/:notebookId/members`
- `PATCH/DELETE /orgs/:orgId/notebooks/:notebookId/members/:memberId`

### Entries

- `GET/POST /orgs/:orgId/notebooks/:notebookId/entries`
- `POST /orgs/:orgId/notebooks/:notebookId/entries/reorder`  
  `{ mode: "explorer" | "day", orderedIds[], folderId?, date? }`  
  - `explorer` → `explorerOrder` (file tree)  
  - `day` → `order` (calendar/compile same-day tiebreaker)
- `GET/PATCH/DELETE /orgs/:orgId/notebooks/:notebookId/entries/:entryId`
- `GET/PUT .../entries/:entryId/content` (TipTap JSON via GCS)

Entry ordering axes: `date` + `order` (compile/calendar); `folderId` + `explorerOrder` (explorer).

### Assets

- `GET/POST /orgs/:orgId/notebooks/:notebookId/assets` — create may set `usedByEntryId`
- `PUT .../assets/:assetId/content` — authenticated binary upload
- `GET .../assets/:assetId/url` — signed read URL
- `DELETE .../assets/:assetId` — deletes GCS objects

### Exports (compiled PDF)

- `PUT /orgs/:orgId/notebooks/:notebookId/exports/:exportId/content` — PDF bytes; sets `lastCompiled` (use `latest`)
- `GET /orgs/:orgId/notebooks/:notebookId/exports/:exportId/url`

### Static assets

- `GET /static/busytex/*`, `GET /static/latex/*`

### Admin (`service_admin`)

- `GET /api/admin/metrics`
- `GET/PATCH /api/admin/users`, `GET /api/admin/users/:uid`
- `GET /api/admin/orgs`

### Internal (collab)

- `POST /internal/collab/flush`
- `POST /internal/collab/connections`

## Collaboration (`services/collab`)

- `WSS /` (Hocuspocus)
  - Auth token required unless `COLLAB_AUTH_DISABLED=true`
  - Org / notebook access checked from document name
  - Debounced flush → Core `/internal/collab/flush` (Yjs; TipTap only when real JSON supplied)

## Agents (`services/agents`)

- `GET /health`
- `POST /v1/orgs/:orgId/notebooks/:notebookId/audit`  
  Body: `{ provider?: "byok"|"vertex", rubric?, byokApiKey?, entries? }`  
  Requires **notebook access** (restricted mode respected). Vertex needs `grants.platformAi` or service_admin.
- `GET /v1/orgs/:orgId/notebooks/:notebookId/audits` — same ACL; newest first
