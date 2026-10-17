# Service contracts

Local testing: [local-development](../04-guides/local-development.md). Architecture: [overview](../02-architecture/overview.md). Schema: [schema.md](./schema.md). Requirements: [01-requirements](../01-requirements/). GenAI: [ADR-004](../02-architecture/decisions/ADR-004-agents-genai-gateway.md), [ADR-005](../02-architecture/decisions/ADR-005-genai-in-core.md).

## Client topology (who calls what)

```
Browser (website)
  ├─ Firebase Auth
  ├─ Core REST ……………………… domain API (orgs, entries, assets, AI, audits)
  ├─ Collab WSS ………………… realtime Yjs
  ├─ local GenAI URL ……… Ollama / LM Studio (loopback only)
  └─ Next.js /api/* ………… optional same-origin BFF only (see below) — not a second domain API
```

**BFF (Backend for Frontend):** a small HTTP route that runs **in the Next.js website process** so the browser can call same-origin `/api/...` instead of a cross-origin service. It forwards the request (often with the user’s `Authorization` header) to Core or an external provider. BFFs are **not** where business logic or ACL should live long-term; prefer the browser → Core directly when CORS and cookies allow.

Core path style: **no `/v1/` prefix** (`/orgs/...`, `/ai/...`, `/health`, `/internal/...`). Agents’ `/v1/...` is legacy.

## Website Next.js routes (`website/src/app/api`)

| Route today | Role | Disposition |
| --- | --- | --- |
| `POST /api/genai` | BYOK text generate (key in body) | **Keep as BYOK CORS BFF** (browser → Next → provider). Not Vertex; not Core. |
| `POST /api/genai/models` | BYOK list models | **Keep** alongside `/api/genai` for the same reason. |
| `POST /api/agents/audit` | Proxy to Agents `/v1/.../audit` | **Delete**. Browser judge + Core audits. |

Nothing else under `website/src/app/api` today. Page routes and Server Components are UI, not this table.

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
- `GET /orgs/:orgId/notebooks/:notebookId/events` — **SSE** metadata fanout (`text/event-stream`). Auth: `Authorization: Bearer …` (use `fetch`, not `EventSource`). Events: `entry.upserted`, `entry.deleted`, `notebook.updated`, `entries.changed`, `ping`. Website must not open Firestore listeners.

Entry ordering axes: `date` + `order` (compile/calendar); `folderId` + `explorerOrder` (explorer).

### Assets

- `GET/POST /orgs/:orgId/notebooks/:notebookId/assets` — create may set `usedByEntryId`
- `PUT .../assets/:assetId/content` — authenticated binary upload streamed through Core to GCS (max **64 MiB**; see `MAX_UPLOAD_BYTES` / `BODY_LIMIT_BYTES`). Website does not talk to GCS directly.
- `GET .../assets/:assetId/url` — signed read URL
- `DELETE .../assets/:assetId` — deletes GCS objects

Over-limit bodies return **413**. Clients should preflight with `assertUploadSize` from `@engineering-notebook/shared`.

### Exports (compiled PDF)

- `PUT /orgs/:orgId/notebooks/:notebookId/exports/:exportId/content` — PDF bytes; sets `lastCompiled` (use `latest`); same **64 MiB** body limit as assets
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

## GenAI on Core ([ADR-005](../02-architecture/decisions/ADR-005-genai-in-core.md)) — shipped

Website **orchestrates** titles and the rubric judge loop. Core **Vertex-infers**, **serves notebook reads for tools**, and **stores audit runs** (including progress).

### Inference

| Provider | Hop |
| --- | --- |
| `local` | Browser → user base URL |
| BYOK (`openai` / `gemini` / `anthropic` / …) | Browser → provider, or browser → `POST /api/genai` (CORS BFF) → provider. Keys ephemeral ([ADR-003](../02-architecture/decisions/ADR-003-byok-keys-local.md)). **Not Core.** |
| `vertex` | Browser → Core `POST /ai/complete` (Bearer + `grants.platformAi` or service_admin) |

- `POST /ai/complete` — **Vertex only**; one model turn per request (chat/completions-shaped body; schema TBD). Reject BYOK/local here.
- BYOK model list stays on `POST /api/genai/models` (or browser-direct if the provider allows).

### Audits (notebook-scoped) — multi-request progress

Core does **not** run the judge. The website drives many short requests; Core holds run state so the UI (or another tab) can poll.

- `POST /orgs/:orgId/notebooks/:notebookId/audits` — start run `{ status: "running", rubric?, provider? }` → `{ id, ... }`
- `PATCH /orgs/:orgId/notebooks/:notebookId/audits/:auditId` — progress updates, e.g. `{ status?, steps?, summary?, scores?, advice?, error? }`  
  Typical: append tool-trace / partial summary while running; final body sets `status: "completed"` or `"failed"`
- `GET /orgs/:orgId/notebooks/:notebookId/audits/:auditId` — poll one run
- `GET /orgs/:orgId/notebooks/:notebookId/audits` — list (newest first)

All require notebook ACL.

### Judge tools (reads)

Prefer existing entry APIs; add thin helpers only if needed:

| Tool intent | Prefer |
| --- | --- |
| List entries | `GET .../entries` |
| Entry metadata | `GET .../entries/:entryId` |
| Entry body | `GET .../entries/:entryId/content` (truncate client-side if huge) |
| Keyword search | `GET .../entries?q=` or `GET .../ai/search?q=` |

### Website client flow (target)

1. `POST …/audits` → `running`.  
2. Loop: inference (local / `/api/genai` / `/ai/complete`) → tool GETs on Core → optional `PATCH …/audits/:id` with progress.  
3. Final `PATCH` → `completed` + scorecard (or `failed`).  
4. UI may also keep local step state; poll `GET` if needed.

## Agents — removed

Former `services/agents` deleted. Audits + Vertex live on Core; judge runs in the website.
