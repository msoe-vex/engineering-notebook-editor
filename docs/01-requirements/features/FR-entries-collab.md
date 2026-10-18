# FR-entries-collab: Entries & collaborative editing

Status: partial  
Related: [realtime](../../02-architecture/realtime.md), [ADR-001](../../02-architecture/decisions/ADR-001-gcp-only-sync.md), [cloud UX plan](../plans/cloud-ux-hardening.md)

## Summary

Entries store **metadata** in Firestore and TipTap/Yjs bodies in GCS. Multiple users edit bodies via Hocuspocus. Metadata patches go through Core REST; other clients receive updates over Core **SSE** (`…/events`). Images use returned `asset.id`; `assetIds` / `usedBy` stay consistent. Binary uploads are capped at **64 MiB** (`MAX_UPLOAD_BYTES` / `BODY_LIMIT_BYTES`).

## Actors and permissions

Anyone with notebook access may create/edit/delete entries (subject to future finer ACLs).

## User-facing behavior

- `/…/entries/:entryId` — title, authors chips, phase picker (icon+color), collab editor + format toolbar
- View modes: editor / split / LaTeX with live source preview from current doc + metadata; **no split on phone** (&lt; `md`)
- Phone: date/phase/authors behind a disclosure; list drawer control in entry chrome
- Entry meta (date/phase/authors) toggles via chevron; starts collapsed on phone, open on desktop
- Saving indicator on metadata patches; optimistic sidebar updates; Core SSE keeps other sessions fresh
- Presence via collab WebSocket: Live/Offline plus peer awareness avatars (initials)
- Validation on content flush; metadata-field revalidation when notebook phases change (Core)
- Toasts on asset upload failure and other transient outcomes
- Title GenAI when GenAI enabled — see [FR-genai-audit](./FR-genai-audit.md)

## Acceptance criteria

- [ ] Insert image → reload → image still loads (`asset.id` in TipTap, not pre-UUID)
- [ ] Image under 64 MiB uploads; over-limit shows toast (no silent skip)
- [ ] Two clients can edit same entry body over WSS; flush persists TipTap/Yjs
- [ ] Two clients: metadata change in one updates sidebar/header in the other via SSE
- [ ] Create entry seeds authors from last-authors preference when available
- [ ] Delete entry removes associated content pointers / GCS as designed
- [ ] Saving… / Saved visible on metadata patch; split LaTeX updates while typing
- [x] Phone: editor | LaTeX only (split hidden); entry body scrolls in a dedicated pane

## Data and APIs

- Entry metadata: `date`, `order`, `folderId`, `explorerOrder`, `authors`, `phase`, `assetIds`, `isValid`, …
- `GET|PUT …/entries/:id/content`, collab flush internal API
- `GET …/notebooks/:id/events` — SSE metadata fanout
- Client densify: `workspaceState` (not legacy store)

## Non-goals

- TipTap JSON embedded in Firestore documents
- Offline-first CRDT without server
- Browser Firestore listeners for metadata
