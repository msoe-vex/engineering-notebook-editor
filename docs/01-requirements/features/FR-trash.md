# FR-trash: Entry trash

Status: current  
Related: [FR-explorer](./FR-explorer.md), [schema](../../03-reference/schema.md), [api-contracts](../../03-reference/api-contracts.md)

## Summary

Deleted entries and **rubrics** move to **Trash** (soft-delete) instead of being erased immediately. Users can restore or permanently purge. Folder delete still promotes children (folders are not trashed). Past **grades** (judge runs) are deleted permanently from the Judge tab (not trashed).

## Actors and permissions

Anyone with notebook access may trash, restore, and purge entries/rubrics (same as create/delete today).

## User-facing behavior

- Explorer / bulk delete → **Move to Trash** (sets `deletedAt`); toast links to Trash
- Judge rubric context menu → **Move to Trash**
- `/orgs/:orgId/notebooks/:notebookId/trash` — list trashed entries + rubrics; Restore; Delete forever; Empty trash
- Notebook section nav includes **Trash**
- Opening a trashed entry URL shows restore / open Trash (editor disabled)
- Trashed entries hidden from explorer, calendar/compile metadata, and ZIP export
- Permanent purge removes TipTap/Yjs + Firestore metadata (entries) or rubric source + doc (rubrics)

## Acceptance criteria

- [ ] Delete entry → disappears from explorer, appears in Trash with content intact
- [ ] Delete rubric → disappears from Judge list, appears in Trash
- [ ] Restore → back in explorer / Judge (if that folder was deleted, Core has already rewritten `folderId` to the promote target / root)
- [ ] Delete forever / Empty trash → entry/rubric gone; content not recoverable
- [ ] ZIP export omits trashed entries

## Data and APIs

- Entry / rubric field: `deletedAt?: string | null` (ISO)
- `DELETE …/entries/:id` — soft-delete; `POST …/restore`; `DELETE …/permanent`
- `DELETE …/rubrics/:id` — soft-delete; `POST …/restore`; `DELETE …/permanent`
- `GET …/rubrics?trashed=1` — trashed rubrics only

## Non-goals

- Folder trash (folders promote children on delete)
- Trashing grades (grades are hard-deleted from Judge)
- Automatic purge after N days (future)
- Server-side snapshots / event log (separate)
