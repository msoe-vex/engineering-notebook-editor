# FR-entries-collab: Entries & collaborative editing

Status: current  
Related: [realtime](../../02-architecture/realtime.md), [ADR-001](../../02-architecture/decisions/ADR-001-gcp-only-sync.md)

## Summary

Entries store **metadata** in Firestore and TipTap/Yjs bodies in GCS. Multiple users edit via Hocuspocus. Images use returned `asset.id`; `assetIds` / `usedBy` stay consistent.

## Actors and permissions

Anyone with notebook access may create/edit/delete entries (subject to future finer ACLs).

## User-facing behavior

- `/…/entries/:entryId` — title, authors chips, phase, collab editor + format toolbar
- Presence/connection via collab WebSocket
- Validation warnings on flush; resources/references extracted when present
- Title GenAI when GenAI enabled — see [FR-genai-audit](./FR-genai-audit.md)

## Acceptance criteria

- [ ] Insert image → reload → image still loads (`asset.id` in TipTap, not pre-UUID)
- [ ] Two clients can edit same entry over WSS; flush persists TipTap/Yjs
- [ ] Create entry seeds authors from last-authors preference when available
- [ ] Delete entry removes associated content pointers / GCS as designed

## Data and APIs

- Entry metadata: `date`, `order`, `folderId`, `explorerOrder`, `authors`, `phase`, `assetIds`, `isValid`, …
- `GET|PUT …/entries/:id/content`, collab flush internal API
- Client densify: `workspaceState` (not legacy store)

## Non-goals

- TipTap JSON embedded in Firestore documents
- Offline-first CRDT without server
