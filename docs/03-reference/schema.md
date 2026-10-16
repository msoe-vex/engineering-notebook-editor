# Cloud data model (schema v5)

Authoritative TypeScript types: [`packages/shared/src/types.ts`](../../packages/shared/src/types.ts).  
Clients never talk to Firestore directly (`infra/firestore.rules` deny); Core / Agents / Collab use Admin SDK.

## Current collections (implemented)

### Top-level

| Path | Key fields |
| --- | --- |
| `users/{uid}` | `email?`, `displayName?`, `platformRole?` (`service_admin`), `grants?` (`{ platformAi?: boolean }`), `preferences?` (non-secret: theme, authors, genai provider/models — never API keys), `createdAt`, `updatedAt` |
| `organizations/{orgId}` | `name`, `createdBy`, `createdAt`, `updatedAt` |
| `invites/{inviteId}` | `orgId`, `email`, `role`, `createdBy`, `createdAt`, `expiresAt`, `acceptedAt?` |

### Under `organizations/{orgId}`

| Path | Role | Key fields |
| --- | --- | --- |
| `members/{uid}` | Org ACL | `role` (`owner` \| `admin` \| `member`), `email?`, `joinedAt` |
| `teams/{teamId}` | Org ACL groups (not notebook branding) | `name`, `createdBy`, timestamps |
| `teams/{teamId}/members/{uid}` | Team membership | `joinedAt` |
| `notebooks/{notebookId}` | Notebook summary | See below |
| `notebooks/{id}/members/{memberId}` | **Credits roster** (may lack app account) | `name`, `role`, `order`, `imageAssetId?`, `linkedUid?` |
| `notebooks/{id}/entries/{entryId}` | Entry **metadata only** | See below |
| `notebooks/{id}/assets/{assetId}` | Asset metadata | `contentType`, `byteSize`, `gcsPath`, `createdBy`, `usedBy[]` |
| `notebooks/{id}/audits/{auditId}` | Rubric scorecards | `provider`, `scores`, `advice[]`, `summary?`, … |

### Notebook summary (`NotebookSummaryV5`)

```
schemaVersion: 5
orgId, name
title?, subtitle?, logoAssetId?
folders: Record<folderId, { name, parentId, order }>
  // folder.order = sibling position under parentId (explorer tree only)
access?: { mode: "org" | "restricted", teamIds[], userIds[] }
phases?: Record<phaseId, { name, description, iconName, color, order }>
lastCompiled?
createdAt?, createdBy?, updatedAt
```

### Entry metadata (`EntryMetadataV5`) — Firestore only

```
title, authors[], phase, date
folderId, explorerOrder   // file explorer (sibling order within folder)
order                     // calendar + compile same-day tiebreaker
isTemplate?
resources?, references?, assetIds?
isValid?, validationErrors?
tipTapGcsPath, tipTapRev, yjsGcsPath, yjsRev
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

Bodies are **never** in Firestore. GCS:

| Blob | Key pattern |
| --- | --- |
| TipTap JSON | `organizations/{orgId}/notebooks/{notebookId}/entries/{entryId}.json` |
| Yjs binary | `…/yjs/{entryId}.ydoc` |
| Asset bytes | `…/assets/{assetId}/compressed` (and optionally `original`) |
| Export PDF | `…/exports/{exportId}.pdf` — **helper exists; no write path yet** |

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
| `AssetMetadata.gcsPathOriginal` | Never written (compressed path is used) |
| `NotebookMember.linkedUid` | Members UI does not wire account link yet |
| Metrics | In-memory in Core; Firestore `metrics/…` aspirational |

See [backlog.md](../01-requirements/backlog.md).

## What must NOT go in Firestore

| Data | Where |
| --- | --- |
| BYOK / GenAI API keys | localStorage or ephemeral request body |
| TipTap / Yjs / images / PDFs / BusyTeX WASM | GCS |
| Service credentials | Secret Manager / env |
| Full entry bodies inside audits | Scorecards + advice only |

## Cascade deletes

Notebook (and org) delete removes Firestore children (entries, assets, audits, roster) **and** related GCS objects (TipTap, Yjs, assets, exports).
