# FR-explorer: Explorer, folders, search

Status: partial  
Related: [FR-entries-collab](./FR-entries-collab.md), [glossary](../../00-product/glossary.md), [cloud UX plan](../plans/cloud-ux-hardening.md)

## Summary

Notebook sidebar lists folders and entries (including templates) with DnD **explorerOrder** (separate from calendar `order`). Client-side filters: text, phase, author, date range. Templates use a distinct icon and appear in the **New** menu (blank + from template).

## Actors and permissions

Notebook accessors.

## User-facing behavior

- `NotebookEntryList`: create/rename/delete folder; nest via `parentId`; assign `folderId`. Deleting a folder promotes its entries and child folders one level up (to the deleted folder’s parent / root) — contents are not deleted.
- New entry/folder creates immediately with a default name; sidebar name becomes an inline text field (Enter save, Esc cancel). Rename from the row menu uses the same inline field.
- DnD reorder siblings → `POST …/entries/reorder` mode `explorer`
- Phase icon+color as entry glyph when set; template glyph for templates
- Duplicate entry; **New** dropdown (blank entry, blank template, from each template); mark template
- Search + filters: text query, phase dropdown (`PhasePicker`), author typeahead, date range, Show/Sort selects; scrollable filter panel (max height) with clearer separation from the list; while filtering, flat sorted match list; active filter chips; session-persisted per notebook; `/` focuses search; empty “No matches” + Clear filters
- Shared `ContextMenu` + `DropdownMenu` use the same `MenuItem` builders (Open, Rename, Duplicate, Move…, Delete; folders: New entry/subfolder; multi-select bulk Move/Delete)
- Double-click entry/folder label to rename inline
- Toast + refresh/revert on reorder failure
- Multi-select: Ctrl/Cmd click toggle, Shift click range; bulk Move… / Delete via context menu (no selection toolbar)
- Entry delete (single/bulk) moves to **Trash** ([FR-trash](./FR-trash.md)); folder delete promotes children (no toast Undo — confirm dialog only)
- Phone (&lt; `md`): full-screen list when no entry open; overlay drawer when an entry is open (list control + Entries tab)
- Desktop: double-click the explorer ↔ main resize handle to reset width (default 22/78)

## Acceptance criteria

- [ ] Create folder → move entry → reload → still nested
- [ ] Explorer DnD does not change calendar `order` / `date`
- [x] Filters hide non-matching entries; chips + Clear all / Clear filters empty state
- [ ] Templates appear in the unified tree with a distinct icon; New menu lists templates
- [ ] Multi-select can move or delete several entries at once
- [ ] Entry delete sends items to Trash (not permanent purge)
- [x] On phone, explorer is not a persistent side-by-side split; entry edit is full-width

## Data and APIs

- `notebook.folders` map; entry `folderId`, `explorerOrder`
- Reorder: `{ mode: "explorer", orderedIds, folderId? }`

## Non-goals

- Server-side full-text search (see [backlog](../backlog.md))
