# Service contracts

Local testing: [local-development](../04-guides/local-development.md). Architecture: [overview](../02-architecture/overview.md). Schema: [schema.md](./schema.md). Requirements: [01-requirements](../01-requirements/). Titles GenAI: [ADR-004](../02-architecture/decisions/ADR-004-agents-genai-gateway.md), [ADR-005](../02-architecture/decisions/ADR-005-genai-in-core.md). Notebook Judge: [ADR-007](../02-architecture/decisions/ADR-007-python-langgraph-judge.md).

## Client topology (who calls what)

```
Browser (website)
  ├─ Firebase Auth
  ├─ Core REST ……………………… domain API (orgs, entries, assets, AI, rubrics/judgments)
  ├─ Collab WSS ………………… realtime Yjs
  ├─ local GenAI URL ……… Ollama / LM Studio (titles/captions only)
  └─ Next.js /api/* ………… optional same-origin BFF only (see below) — not a second domain API
```

**BFF (Backend for Frontend):** a small HTTP route that runs **in the Next.js website process** so the browser can call same-origin `/api/...` instead of a cross-origin service. It forwards the request (often with the user’s `Authorization` header) to Core or an external provider. BFFs are **not** where business logic or ACL should live long-term; prefer the browser → Core directly when CORS and cookies allow.

Core path style: **no `/v1/` prefix** (`/orgs/...`, `/ai/...`, `/health`, `/internal/...`).

## Website Next.js routes (`website/src/app/api`)

| Route today | Role | Disposition |
| --- | --- | --- |
| `POST /api/genai` | BYOK text generate (key in body) | **Keep as BYOK CORS BFF** (browser → Next → provider). Not Vertex; not Core. |
| `POST /api/genai/models` | BYOK list models | **Keep** alongside `/api/genai` for the same reason. |

Nothing else under `website/src/app/api` today. Page routes and Server Components are UI, not this table.

## Nested tenancy paths

Firestore / GCS nest under organizations:

- `organizations/{orgId}/members/{uid}`
- `organizations/{orgId}/teams/{teamId}/members/{uid}`
- `organizations/{orgId}/notebooks/{notebookId}`
- `organizations/{orgId}/notebooks/{notebookId}/members/{memberId}` (roster credits)
- `organizations/{orgId}/notebooks/{notebookId}/entries/{entryId}` (metadata + GCS pointers only)
- `organizations/{orgId}/notebooks/{notebookId}/assets/{assetId}`
- `organizations/{orgId}/notebooks/{notebookId}/rubrics/{rubricId}`
- `organizations/{orgId}/notebooks/{notebookId}/judgments/{judgmentId}`
- Top-level: `users/{uid}`, `invites/{inviteId}`

HTTP uses short `/orgs/...` routes that map to the nested collections.

Collab document names: `org:{orgId}:notebook:{notebookId}:entry:{entryId}`

## Core (`services/core`)

Auth: `Authorization: Bearer <Firebase ID token | local uid>`

### Health / session / users

- `GET /health`
- `GET /auth/session`
- `POST /users/me/bootstrap`
- `GET /users/me` — includes `secondaryEmails[]` (no verify tokens)
- `PATCH /users/me` — `{ displayName?, preferences? }`
  Preferences (non-secret): `theme`, `defaultAuthors`, `genai.{enabled,provider,models,baseUrls}`, `lastOrgId`, `explorerSort`. **Never store API keys.**
- `POST /users/me/secondary-emails` `{ email }` — sends verify via `NotificationPort`
- `POST /users/me/secondary-emails/verify` `{ token }`
- `DELETE /users/me/secondary-emails/:email`

### Organizations

- `GET/POST /orgs`
- `GET/PATCH/DELETE /orgs/:orgId` — PATCH may include `name`, `slug` (unique), `publicPage` (`visibility`, `about` / legacy `mission`, `logoAssetId`, announcement, cta, `sections`)
- `GET/POST /orgs/:orgId/members`, `PATCH/DELETE /orgs/:orgId/members/:uid` — PATCH `{ role?, status?: active|alumni, imageAssetId?, displayName?, title?, public? }`; alumni cannot mutate (403)
- `GET/PUT/DELETE /orgs/:orgId/donors|projects|events|social-links[/:itemId]` — org catalogs; each item has `public?: boolean` (default true). Site chrome + section gates via `PATCH /orgs/:orgId`.
- `GET/POST /orgs/:orgId/invites`, `DELETE /orgs/:orgId/invites/:inviteId` — create may send email via `NotificationPort`; `status`: `pending`\|`accepted`\|`revoked` (DELETE soft-revokes pending invites)
- `POST /invites/:inviteId/accept` — rejects expired/revoked/accepted invites; optional email match when invite has an email  
  Create sets `expiresAt` (default 14 days, `INVITE_TTL_DAYS` / body `expiresInDays`)

### Public (no auth)

Headless CMS endpoints for public organization data and published PDF documents. Accessible when `org.publicPage.visibility === "public"`.

- `GET /public/o/:slug` — full org public page bundle (profile, logoUrl, donors, projects, events, members, social, publications); omits items with `public === false` and whole sections with `sections.<key> === false`
- `GET /public/o/:slug/projects` — list public projects (`public !== false`)
- `GET /public/o/:slug/donors` — list public donors/sponsors (`public !== false`)
- `GET /public/o/:slug/events` — list public events (`public !== false`)
- `GET /public/o/:slug/members` — list public members (`public !== false`)
- `GET /public/o/:slug/social` — list public social links (`public !== false`)
- `GET /public/o/:slug/publications` — list published PDF documents explicitly marked `visibility: "public"`. Returns publication name, notebook title, and direct PDF url. **Unlisted** publications (which require the direct unguessable key) and **private** notebooks are excluded from this catalog. No internal IDs leaked.
- `GET /public/o/:slug/publications/:key` — metadata for an individual public or unlisted publication (returns org name/slug, notebook title/subtitle, publication name, visibility, and canonical PDF `url`). Zero internal database IDs leaked.
- `GET /public/o/:slug/publications/:key/pdf` — streams compiled PDF bytes for this publication through Core (default); `?json=1` returns `{ url }` storage/signed URL.
- `GET /public/o/:slug/assets/:assetId` — streams public org assets (images, logos) with caching headers, decoupled from GCS credentials.

### Org teams (ACL groups)

- `GET/POST /orgs/:orgId/teams`
- `GET/PATCH/DELETE /orgs/:orgId/teams/:teamId`
- `GET /orgs/:orgId/teams/:teamId/members`
- `PUT/DELETE /orgs/:orgId/teams/:teamId/members/:uid`

### Notebooks

- `GET/POST /orgs/:orgId/notebooks`
- `GET/PATCH/DELETE /orgs/:orgId/notebooks/:notebookId`  
  PATCH fields include `name`, `title`, `subtitle`, `logoAssetId`, `folders`, `access`, `phases`, `latestExportId`, `archivedAt`, plus legacy share fields (`publicAccess` / `publicKey` / `publicExportId` / `revokePublic`) kept for older clients — prefer **Share links** APIs below  
  Public URL shape: `/o/:orgSlug/n/:key` (per share link)  
  DELETE cascades entries/assets/rubrics/judgments GCS blobs + subcollections
- `POST /orgs/:orgId/notebooks/:notebookId/archive` — sets `archivedAt`, locks notebook into read-only mode (admins/owners only; blocks entry/folder/asset/contributor/rubric/judge/compile mutations with 403)
- `POST /orgs/:orgId/notebooks/:notebookId/unarchive` — clears `archivedAt`, restores write permissions (admins/owners only)

### Notebook folders

- `POST /orgs/:orgId/notebooks/:notebookId/folders` — `{ name, parentId?, order? }`
- `PATCH /orgs/:orgId/notebooks/:notebookId/folders/:folderId`
- `DELETE /orgs/:orgId/notebooks/:notebookId/folders/:folderId` — clears entry `folderId`s

### Notebook roster (credits)

- Preferred: `PATCH /orgs/:orgId/notebooks/:notebookId` with `{ contributorUids: string[] }` (org member uids only; order = credits order)
- `GET /orgs/:orgId/notebooks/:notebookId/members` — resolves `contributorUids` to display rows (`name`/`role`/`imageAssetId` from org members); falls back to legacy roster docs; `?trashed=1` for soft-deleted legacy only
- Legacy: `POST/PATCH/DELETE …/members/:memberId` (+ restore/permanent) still accepted for old docs

### Entries

- `GET/POST /orgs/:orgId/notebooks/:notebookId/entries`
- `GET …/entries/search?q=` — metadata search (title/authors/phase/date); `includeBody=1` also scans TipTap text (capped)
- `POST /orgs/:orgId/notebooks/:notebookId/entries/reorder`  
  `{ mode: "explorer" | "day", orderedIds[], folderId?, date? }`  
  - `explorer` → `explorerOrder` (file tree)  
  - `day` → `order` (calendar/compile same-day tiebreaker)
- `GET/PATCH/DELETE /orgs/:orgId/notebooks/:notebookId/entries/:entryId` — `DELETE` soft-deletes (`deletedAt`); SSE `entry.upserted`
- `POST .../entries/:entryId/restore` — clear `deletedAt`
- `DELETE .../entries/:entryId/permanent` — hard-delete TipTap/Yjs + metadata (+ comments); SSE `entry.deleted`
- `GET/PUT .../entries/:entryId/content` (TipTap JSON via GCS)
- `GET/POST …/entries/:entryId/comments` — thread body in MetadataStore; TipTap `commentAnchor` mark holds `commentId` (Yjs); POST may include `mentionedUids` (org members → `NotificationPort` `comment_mention`)
- `PATCH/DELETE …/entries/:entryId/comments/:commentId` — PATCH `{ body?, resolved? }`; SSE `comment.upserted` / `comment.deleted`; denorm `openCommentCount` / `commentCount` on entry
- `GET /orgs/:orgId/notebooks/:notebookId/events` — **SSE** metadata fanout (`text/event-stream`). Auth: `Authorization: Bearer …` (use `fetch`, not `EventSource`). Events: `entry.upserted`, `entry.deleted`, `notebook.updated`, `entries.changed`, `comment.upserted`, `comment.deleted`, `job.*`, `ping`. Website must not open Firestore listeners.

Entry ordering axes: `date` + `order` (compile/calendar); `folderId` + `explorerOrder` (explorer).

### Assets

- `GET/POST /orgs/:orgId/notebooks/:notebookId/assets` — create may set `usedByEntryId`
- `PUT .../assets/:assetId/content` — authenticated binary upload streamed through Core to GCS (max **64 MiB**; see `MAX_UPLOAD_BYTES` / `BODY_LIMIT_BYTES`). Website does not talk to GCS directly.
- `GET .../assets/:assetId/url` — signed read URL
- `DELETE .../assets/:assetId` — deletes GCS objects

### Org assets (avatars / public CMS media)

- `GET/POST /orgs/:orgId/assets` — admin write; members may list
- `PUT /orgs/:orgId/assets/:assetId/content` — admin binary upload (same size limits)
- `GET /orgs/:orgId/assets/:assetId/url` — signed read (org members)
- `DELETE /orgs/:orgId/assets/:assetId` — admin; clears GCS `organizations/{orgId}/assets/{assetId}/compressed`

Over-limit bodies return **413**. Clients should preflight with `assertUploadSize` from `@engineering-notebook/shared`.

### Exports (compiled PDF)

- `GET /orgs/:orgId/notebooks/:notebookId/exports` — list retained compile PDFs (max 10) + `latestExportId`
- `PUT /orgs/:orgId/notebooks/:notebookId/exports/:exportId/content` — PDF bytes for preview; writes unversioned preview (`latest.pdf`) without consuming a version slot; updates `lastPreviewAt`; **64 MiB** limit
- `POST /orgs/:orgId/notebooks/:notebookId/exports/save` — `{ label? }` snapshot current preview into a permanent saved version; **409** at `MAX_COMPILE_EXPORTS` (10)
- `PATCH /orgs/:orgId/notebooks/:notebookId/exports/:exportId` — `{ label }` rename a version
- `GET /orgs/:orgId/notebooks/:notebookId/exports/:exportId/url` — signed URL (`latest` → preview or `latestExportId`)
- `DELETE /orgs/:orgId/notebooks/:notebookId/exports/:exportId` — delete a saved version (share links retarget to next latest or revoke; deleting latest promotes the next newest)

### Share links (public PDF URLs)

- `GET /orgs/:orgId/notebooks/:notebookId/share-links` — active links (`?includeRevoked=1` for history); migrates legacy `publicKey` once
- `POST /orgs/:orgId/notebooks/:notebookId/share-links` — `{ name, exportId }` → new UUID `key` (admin+)
- `PATCH /orgs/:orgId/notebooks/:notebookId/share-links/:linkId` — `{ name?, exportId? }` (admin+)
- `DELETE /orgs/:orgId/notebooks/:notebookId/share-links/:linkId` — revoke (removes public key lookup) (admin+)
- Public URL shape: `/o/:orgSlug/n/:key`

### Static assets

- `GET /static/busytex/*`, `GET /static/latex/*`

### Admin (`service_admin`)

- `GET /api/admin/metrics`
- `GET/PATCH /api/admin/users`, `GET /api/admin/users/:uid`
- `GET /api/admin/orgs`

### Internal (collab)

- `POST /internal/collab/flush`
- `POST /internal/collab/connections`
- `GET /internal/collab/yjs`

### Notebook jobs (user + worker) — [ADR-006](../02-architecture/decisions/ADR-006-compile-job.md), [ADR-008](../02-architecture/decisions/ADR-008-job-dispatch-evolution.md)

Firestore: `organizations/{orgId}/notebooks/{notebookId}/jobs/{jobId}` (+ `jobLocks/` for single-flight).

- `POST /orgs/:orgId/notebooks/:notebookId/jobs` — `{ type, resourceKey?, payload? }` → `202 { jobId }` | `409 { jobId }` (in flight) | `503` (dispatch unavailable)
- `GET /orgs/:orgId/notebooks/:notebookId/jobs/:jobId`
- `POST …/compile` — shortcut for `{ type: "compile", resourceKey: "notebook" }`

**Dispatch (Pub/Sub only):** `JOB_DISPATCH=pubsub` (default) | `none`. Core publishes JSON `{ jobId, type, orgId, notebookId, payload }` to topics `notebook-jobs-compile` / `notebook-jobs-judge`. Workers **pull** subscriptions `notebook-jobs-*-worker` (health: `GET /health` only — no HTTP wake).

Internal generic (header `x-internal-secret`):

- `POST /internal/jobs/:jobId/progress` — `{ orgId, notebookId, status?, progress?, stage?, detail? }`
- `POST /internal/jobs/:jobId/complete` — `{ orgId, notebookId, result? }`
- `POST /internal/jobs/:jobId/fail` — `{ orgId, notebookId, error? }`

Internal compile helpers:

- `GET /internal/compile/snapshot?orgId&notebookId` — **metadata only** (`schema: paths-v1`): entry `tipTapGcsPath`, assets `{ contentType, gcsPath }` (no base64 / TipTap bodies)
- `GET /internal/storage/object?orgId&notebookId&key=` — stream notebook-scoped GCS object (worker pull)
- `GET /internal/compile/asset-ref?orgId&notebookId&assetId=` — resolve `{ contentType, gcsPath }` for TipTap-discovered ids
- `PUT /internal/compile/export?orgId&notebookId&exportId=latest&jobId=` (also completes the job)
- `POST /internal/compile/progress` | `/failed` — thin wrappers around job progress/fail; progress accepts `stage` (`fetch`|`tex`|`xelatex`|`upload`) and `detail`

SSE: `job.progress` | `job.done` | `job.failed` (fields include `jobType`; progress may include `stage`, `detail`)

### Judge / rubrics

Extract and score are **separate** jobs (Python LangGraph worker — [ADR-007](../02-architecture/decisions/ADR-007-python-langgraph-judge.md); `payload.phase`: `normalize` | `score`).

- `POST …/rubrics` — raw body + `Content-Type` (+ optional `X-Rubric-Name`) → `201` rubric (`status: uploaded`)
- `POST …/rubrics/custom` `{ name?, matrix? }` → `201` blank/custom rubric (`status: ready`)
- `GET …/rubrics` | `GET …/rubrics?trashed=1` | `GET …/rubrics/:rubricId`
- `PATCH …/rubrics/:rubricId` `{ name?, matrix? }` → edit matrix (sets `ready`)
- `DELETE …/rubrics/:rubricId` — soft-delete (Trash); `POST …/restore`; `DELETE …/permanent`
- `POST …/rubrics/:rubricId/normalize` `{ inference?, byok? }` → `202 { jobId }` extract PDF/text → matrix only
- `POST …/judge` `{ rubricId, inference?, byok? }` → `202 { jobId, judgmentId }` | `409` in flight  
  - Requires rubric `status: ready` with categories (not trashed)  
  - BYOK keys are **dispatch-only**; `vertex` needs `platformAi` / service admin
- `GET …/judgments` | `GET …/judgments/:judgmentId`
- `DELETE …/judgments/:judgmentId` | `DELETE …/judgments` — delete one grade / clear all past grades

Internal: `GET/PATCH /internal/judge/rubric`, `POST /internal/judge/normalize-complete`, `POST /internal/judge/progress|complete|failed`, `POST /internal/ai/complete` (unified Vertex + BYOK; `/internal/ai/byok` alias)

Normalized shape: `RubricMatrix` — criteria rows × level columns (label, points, description) + `totalMaxPoints`. Judgment includes awarded level per criterion, `entryIds`, and denormalized `rubricName`.

## Collaboration (`services/collab`)

- `WSS /` (Hocuspocus)
  - Auth token required unless `COLLAB_AUTH_DISABLED=true`
  - Org / notebook access checked from document name
  - Debounced flush → Core `/internal/collab/flush` (Yjs body)
  - Website mirrors TipTap JSON with `PUT …/entries/:id/content` after the provider is synced (keeps compile / `GET …/content` current)

## GenAI titles / captions ([ADR-004](../02-architecture/decisions/ADR-004-agents-genai-gateway.md), [ADR-005](../02-architecture/decisions/ADR-005-genai-in-core.md))

Website orchestrates **titles and captions only**. Notebook **Judge** is a separate server job — see **Judge / rubrics** above ([ADR-007](../02-architecture/decisions/ADR-007-python-langgraph-judge.md)).

### Inference (titles/captions)

| Provider | Hop |
| --- | --- |
| `local` | Browser → user base URL (`http://localhost:11434`) |
| BYOK (`openai` / `gemini` / `anthropic` / …) | Browser → provider, or browser → `POST /api/ai/complete` (CORS BFF; alias `/api/genai`) → provider. Keys ephemeral ([ADR-003](../02-architecture/decisions/ADR-003-byok-keys-local.md)). **Not Core.** |
| `vertex` | Browser → Core `POST /ai/complete` (Bearer + `grants.platformAi` or service_admin) |

- `POST /ai/complete` — **Vertex only**; one model turn per request. Reject BYOK/local here.
- BYOK model list stays on `POST /api/ai/models` (alias `/api/genai/models`, or browser-direct if the provider allows).

Judge worker inference uses Core `/internal/ai/complete` (Vertex + BYOK dispatch), not the browser audit loop. The old `/audits` collection and browser-orchestrated scorecards are **removed**.

## Agents — removed

Former `services/agents` deleted. Vertex proxy lives on Core; notebook Judge lives in `services/judge`.
