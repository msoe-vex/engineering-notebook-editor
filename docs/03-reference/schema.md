# Cloud data model (schema v5)

Authoritative TypeScript types: [`packages/shared/src/types.ts`](../../packages/shared/src/types.ts).  
Clients never talk to Firestore/metadata store directly (`infra/firestore.rules` deny); Core / Collab use server adapters ([ADR-009](../02-architecture/decisions/ADR-009-platform-ports.md)).

**Shipped** fields are below. **Planned** product surfaces (public org page, public notebooks, alumni, richer auth) are sketched at the end so FRs and implementation share one contract — update this file when those land in `types.ts`.

## Current collections (implemented)

### Top-level

| Path | Key fields |
| --- | --- |
| `users/{uid}` | `email?`, `displayName?`, `platformRole?` (`service_admin`), `grants?` (`{ platformAi?: boolean }`), `preferences?` (non-secret: theme, authors, genai provider/models — never API keys), `createdAt`, `updatedAt` |
| `organizations/{orgId}` | `name`, `createdBy`, `createdAt`, `updatedAt` |
| `invites/{inviteId}` | `orgId`, `email`, `role`, `status?` (`pending`\|`accepted`\|`revoked`), `createdBy`, `createdAt`, `expiresAt`, `acceptedAt?`, `revokedAt?` |
| `system/metrics` | Platform request counters (persisted by Core) | `totalRequests`, `status2xx/4xx/5xx`, `totalLatencyMs`, `persistedAt` |

### Under `organizations/{orgId}`

| Path | Role | Key fields |
| --- | --- | --- |
| `members/{uid}` | Org ACL + public credits | `role`, `title?`, `public?` (default true), `email?`, `displayName?`, `imageAssetId?`, `status?` (`active`\|`alumni`), `joinedAt` |
| `assets/{assetId}` | Org-scoped media | `contentType`, `byteSize`, `gcsPath`, `createdBy`, `usedBy[]` — GCS `organizations/{orgId}/assets/{id}/compressed` |
| `teams/{teamId}` | Org ACL groups (not notebook branding) | `name`, `createdBy`, timestamps |
| `teams/{teamId}/members/{uid}` | Team membership | `joinedAt` |
| `notebooks/{notebookId}` | Notebook summary | See below |
| `notebooks/{id}/members/{memberId}` | **Legacy** credits docs (prefer `contributorUids`) | `name`, `role`, `order`, `imageAssetId?`, `orgMemberUid?`, `deletedAt?` |
| `notebooks/{id}/entries/{entryId}` | Entry **metadata only** | See below |
| `…/entries/{entryId}/comments/{commentId}` | Comment **thread body** (anchor is TipTap mark) | `body`, `createdBy`, `createdAt`, `resolvedAt?`, `anchorQuote?`, `mentionedUids?` |
| `notebooks/{id}/assets/{assetId}` | Notebook asset metadata | `contentType`, `byteSize`, `gcsPath`, `createdBy`, `usedBy[]` |
| `notebooks/{id}/rubrics/{rubricId}` | Competition rubrics | `name`, `matrix?`, `status` (`uploaded`\|`normalizing`\|`ready`\|`failed`), `sourceGcsPath?`, `deletedAt?`, … |
| `notebooks/{id}/judgments/{judgmentId}` | Judge grades | `rubricId`, `matrix`, `categories[]`, `totalPoints`, `totalMaxPoints`, `summary`, `status` (`running`\|`completed`\|`failed`), `jobId?`, … |
| `notebooks/{id}/jobs/{jobId}` | Async jobs | `type` (`compile`\|`judge`\|…), `status`, `payload`, `result?`, … |

### Notebook summary (`NotebookSummary`)

```
schemaVersion: 5
orgId, name
title?, subtitle?, logoAssetId?
folders: Record<folderId, { name, parentId, order }>
  // folder.order = sibling position under parentId (explorer tree only)
access?: { mode: "org" | "restricted", teamIds[], userIds[] }
phases?: Record<phaseId, { name, description, iconName, color, order, deletedAt? }>
contributorUids?: string[]   // ordered org member uids for credits
latestExportId?              // most recent compile export id
publicKey? / publicExportId? // legacy single-link fields; prefer shareLinks/
createdAt?, createdBy?, updatedAt
```

### Entry metadata (`EntryMetadata`) — Firestore only

```
title, authors[], phase, date
folderId, explorerOrder   // file explorer (sibling order within folder)
order                     // calendar + compile same-day tiebreaker
isTemplate?
hidden?                   // omit from PDF compile; still listed in explorer
resources?, references?, assetIds?
isValid?, validationErrors?
tipTapGcsPath, tipTapRev, yjsGcsPath, yjsRev
deletedAt?                // soft-delete (Trash); omit/null when live
openCommentCount?         // denorm unresolved threads
commentCount?             // denorm all threads
createdAt, updatedAt
```

**Two order axes (do not conflate):**

| Axis | Fields | Controlled in | Used by |
| --- | --- | --- | --- |
| Explorer tree | `folderId`, `explorerOrder`; folders `parentId`+`order` | File explorer DnD | Sidebar listing only |
| Compile / calendar | `date`, then `order` | Calendar DnD (same day) | BusyTeX / LaTeX entry order |

Compile sort: `date` ascending → `order` ascending → `id`. Folder nesting never affects compile order.

`order` is **per-date**: many entries may share `order: 1` on different dates. Within one date, calendar DnD densifies to `0…n-1`.

Core: `POST …/entries/reorder` with `mode: "explorer" | "day"` reindexes only the listed siblings.

Bodies are **never** in Firestore. Blobs live behind Core `StoragePort` (GCS adapter today).

### Object-key contract (adapter-agnostic)

Keys are plain strings built by [`gcsKeys`](../../packages/shared/src/paths.ts) in `packages/shared` (historical name; not an SDK type). Metadata fields `tipTapGcsPath` / `yjsGcsPath` / `gcsPath` / `sourceGcsPath` store those same keys. Routes and workers must not import a vendor storage SDK — only `StoragePort` (or Core `/internal/storage/object` for workers).

| Blob | Key pattern (`gcsKeys.*`) |
| --- | --- |
| TipTap JSON | `organizations/{orgId}/notebooks/{notebookId}/entries/{entryId}.json` |
| Yjs binary | `…/yjs/{entryId}.ydoc` |
| Notebook asset | `…/assets/{assetId}/compressed` (and optionally `original`) |
| Org asset | `organizations/{orgId}/assets/{assetId}/compressed` |
| Export PDF | `…/exports/{exportId}.pdf` (compile worker writes `latest` via Core) |
| Rubric source | `…/rubrics/{rubricId}/source{ext}` |
| Static BusyTeX / LaTeX | `static/busytex/{appVersion}/…`, `static/latex-template/{appVersion}/…` |

Collab room name: `org:{orgId}:notebook:{notebookId}:entry:{entryId}`.

### Naming: three “team” concepts

| Concept | Store | UI |
| --- | --- | --- |
| **Organization** | `organizations/{id}` | Home / org hub |
| **Org Team** (ACL group) | `organizations/…/teams` | Org Teams page |
| **Notebook roster** (credits) | `notebooks/…/members` | Notebook → Members |
| **Notebook branding** | `title` / `subtitle` / `logoAssetId` / `phases` on notebook | Notebook → Setup (+ phases TBD) |

Do not conflate org ACL Members with notebook credits Members.

---

## Underused / optional fields

| Field | Notes |
| --- | --- |
| `AssetMetadata.gcsPathOriginal` | Never written — client uploads a single compressed JPEG today |
| Metrics | In-memory in Core; Firestore `metrics/…` aspirational |

See [backlog.md](../01-requirements/backlog.md).

## What must NOT go in Firestore

| Data | Where |
| --- | --- |
| BYOK / GenAI API keys | localStorage or ephemeral request body |
| TipTap / Yjs / images / PDFs / BusyTeX WASM | Object store via `StoragePort` (GCS adapter) |
| Service credentials | Secret Manager / env |
| Full entry bodies inside judgments | Rationale + entry id cites only |

## Cascade deletes

Notebook (and org) delete removes Firestore children (entries, assets, rubrics, judgments, jobs, roster) **and** related storage objects (TipTap, Yjs, assets, exports, rubric sources) via `StoragePort`.

---

## Public / people / auth extras (in `types.ts`; wire remaining UI polish as needed)

Implemented fields for [FR-org-public-page](../01-requirements/features/FR-org-public-page.md), [FR-public-notebook](../01-requirements/features/FR-public-notebook.md), [FR-orgs](../01-requirements/features/FR-orgs.md) alumni, [FR-auth](../01-requirements/features/FR-auth.md). Keep FRs in sync as acceptance criteria are checked off.

### Org slug + public page

| Path / field | Notes |
| --- | --- |
| `organizations/{orgId}.slug` | Globally unique, URL-safe; admin-set if not taken; reserved list |
| `orgSlugs/{slug}` → `{ orgId }` | Lookup / uniqueness (or equivalent unique index) |
| `organizations/{orgId}.publicPage` | `{ visibility, announcement?, about?, logoAssetId?, cta?, sections?: { about?, donors?, projects?, events?, members?, social? } }` — section keys omit/true = on; `mission` legacy alias of `about` |
| `…/donors/{id}` | name, imageAssetId?, url?, tier?, order, `public?` (default true) |
| `…/projects/{id}` | title, season?, summary, highlights[], externalUrl?, imageAssetId?, order, `public?` |
| `…/events/{id}` | kind?, day/time or date; title; location; imageAssetId?; order; `public?` |
| Public members | Org `members/{uid}` where `public !== false` (incl. alumni) |
| `…/socialLinks/{id}` | label, url, imageAssetId?, order, `public?` |
| `…/publicMedia/{id}` | assetId, caption?, order |

Public URLs: `/o/:slug`, `/o/:slug/projects`, `/events`, `/members`.

### Public notebook share links

Preferred model: explicit `shareLinks/{linkId}` under the notebook:

```
id, key            // unguessable UUID in the public URL
name               // user-facing label
exportId           // compile export this link serves
createdAt, createdBy?, updatedAt?
revokedAt?         // set when revoked; public lookup removed
```

| Lookup | Purpose |
| --- | --- |
| `organizations/{orgId}/publicNotebookKeys/{key}` → `{ notebookId, linkId }` | Resolve `/o/:orgSlug/n/:key` |
| `…/notebooks/{notebookId}/shareLinks/{linkId}` | Share link metadata |
| `…/notebooks/{notebookId}/compileExports/{exportId}` | Retained versions (max 10; optional `label`) |
| GCS `…/exports/{exportId}.pdf` (+ `latest.pdf` alias) | Compiled PDF bytes |

Legacy notebook fields `publicAccess` / `publicKey` / `publicExportId` may still exist; Core migrates them into one share link named “Share” on first share-links read.

URL: **`/o/:orgSlug/n/:key`** serves that link’s PDF via website → Core proxy. At most **10** compile exports (`MAX_COMPILE_EXPORTS`).

### Org member alumni

| Field | Notes |
| --- | --- |
| `members/{uid}.status` | `"active"` \| `"alumni"` (default active) |
| `members/{uid}.alumniAt?` | set when moved to alumni |

### Auth / user profile extras

| Field | Notes |
| --- | --- |
| `users/{uid}.secondaryEmails[]` | `{ email, verified, verifiedAt? }` — invite matching when verified |
| `users/{uid}.linkedProviders[]` | provider ids from IdP (informational; source of truth is IdP) |

### Notifications

No durable “mail queue” required in MVP; optional later `notificationLog/{id}` for admin audit. Provider secrets stay in env — [FR-notifications](../01-requirements/features/FR-notifications.md).
