# FR-trash: Entry trash

Status: current  
Related: [FR-explorer](./FR-explorer.md), [schema](../../03-reference/schema.md), [api-contracts](../../03-reference/api-contracts.md)

## Summary

Deleted entries move to **Trash** (soft-delete) instead of being erased immediately. Users can restore or permanently purge. Folder delete still promotes children (folders are not trashed).

## Actors and permissions

Anyone with notebook access may trash, restore, and purge entries (same as create/delete today).

## User-facing behavior

- Explorer / bulk delete → **Move to Trash** (sets `deletedAt`); toast links to Trash
- `/orgs/:orgId/notebooks/:notebookId/trash` — list trashed entries; Restore; Delete forever; Empty trash
- Notebook section nav includes **Trash**
- Opening a trashed entry URL shows restore / open Trash (editor disabled)
- Trashed entries hidden from explorer, calendar/compile metadata, and ZIP export
- Permanent purge removes TipTap/Yjs + Firestore metadata

## Acceptance criteria

- [ ] Delete entry → disappears from explorer, appears in Trash with content intact
- [ ] Restore → back in explorer at previous folder (if that folder was deleted, Core has already rewritten `folderId` to the promote target / root)
- [ ] Delete forever / Empty trash → entry gone; content not recoverable
- [ ] ZIP export omits trashed entries

## Data and APIs

- Entry field: `deletedAt?: string | null` (ISO)
- `DELETE …/entries/:id` — soft-delete
- `POST …/entries/:id/restore` — clear `deletedAt`
- `DELETE …/entries/:id/permanent` — hard-delete

## Non-goals

- Folder trash (folders promote children on delete)
- Automatic purge after N days (future)
- Server-side snapshots / event log (separate)
