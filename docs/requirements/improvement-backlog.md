# Improvement backlog

Forward-looking work on the **current** cloud product. Parity epics A–H are done (see git history). Product spec: [current-product.md](./current-product.md). Schema gaps: [schema.md](../schema.md).

## Done (architecture hygiene)

- [x] Archive unreachable legacy UI under `website/archive/legacy/`
- [x] Replace `@/lib/store` with `workspaceState` / `workspaceBridge` for cloud routes
- [x] Archive `lib/github`, `lib/storage`, `hooks/useWorkspace`, classic `Editor.tsx`
- [x] Extract live `NotebookFormatToolbar` + `insertBlock`

## Product polish

- [ ] **Server-side entry search** (optional) — explorer filters are client-side on loaded metadata
- [ ] **`NotebookMember.linkedUid`** — wire optional link from roster to org member
- [ ] **Invite `status`** — optional `pending | accepted | revoked` beyond `acceptedAt` / delete
- [ ] **`gcsPathOriginal`** — write when uploading originals alongside compressed assets
- [ ] **Metrics persistence** — Core metrics are in-memory; Firestore `metrics/…` only if needed for ops
- [ ] **Cloud-native Settings/Help/About/Calendar** (optional) — pages still live under `components/pages/`; fine as-is

## Non-goals

Do not implement as live sync / primary storage:

- GitHub commit/pull as primary sync (ZIP / LWW only if offline bridges return)
- Local File System Access as primary sync
- Storing BYOK keys in Firestore
- Embedding TipTap / Yjs bodies in Firestore docs

## Context

Unreachable local/GitHub UI + store: [`website/archive/legacy/`](../../website/archive/legacy/).
