# FR-explorer: Explorer, folders, search

Status: partial  
Related: [FR-entries-collab](./FR-entries-collab.md), [glossary](../../00-product/glossary.md), [cloud UX plan](../plans/cloud-ux-hardening.md)

## Summary

Notebook sidebar lists folders and entries (including templates) with DnD **explorerOrder** (separate from calendar `order`). Client-side filters: text, phase, author, date range. Templates use a distinct icon and appear in the **New** menu (blank + from template).

## Actors and permissions

Notebook accessors.

## User-facing behavior

- `NotebookEntryList`: create/rename/delete folder; nest via `parentId`; assign `folderId`
- DnD reorder siblings → `POST …/entries/reorder` mode `explorer`
- Phase icon+color as entry glyph when set; template glyph for templates
- Duplicate entry; **New** dropdown (blank entry, blank template, from each template); mark template
- Search filters panel (title/authors/date/phase text + structured filters)
- Toast + refresh/revert on reorder failure
- Multi-select: Ctrl/Cmd click toggle, Shift click range; bulk Move… / Delete

## Acceptance criteria

- [ ] Create folder → move entry → reload → still nested
- [ ] Explorer DnD does not change calendar `order` / `date`
- [ ] Filters hide non-matching entries; clear resets
- [ ] Templates appear in the unified tree with a distinct icon; New menu lists templates
- [ ] Multi-select can move or delete several entries at once

## Data and APIs

- `notebook.folders` map; entry `folderId`, `explorerOrder`
- Reorder: `{ mode: "explorer", orderedIds, folderId? }`

## Non-goals

- Server-side full-text search (see [backlog](../backlog.md))
