# FR-zip: ZIP backup export/import

Status: current  
Related: [ADR-002](../../02-architecture/decisions/ADR-002-zip-lww-backup.md)

## Summary

v5 ZIP export/import round-trips notebook metadata, TipTap content, folders/phases/members, and asset bytes. Import remaps asset IDs. **Last-write-wins**—not a sync protocol.

## Actors and permissions

Notebook accessors (overflow menu).

## User-facing behavior

- Export ZIP / Import ZIP from workspace chrome
- Import applies LWW to the open notebook

## Acceptance criteria

- [ ] Export → wipe/recreate or clear → import restores entries + images
- [ ] Asset IDs remapped; TipTap image refs updated
- [ ] Logo / phases / folders included when present

## Data and APIs

- Client: `zipV5.ts`, `zipAssets.ts`
- Shared migrate helpers in `@engineering-notebook/shared`

## Non-goals

- GitHub push/pull; multi-device sync conflict UI
