# FR-explorer: Explorer, folders, search

Status: current  
Related: [FR-entries-collab](./FR-entries-collab.md), [glossary](../../00-product/glossary.md)

## Summary

Notebook sidebar lists folders and entries with DnD **explorerOrder** (separate from calendar `order`). Client-side filters: text, phase, author, date range. Templates listed separately.

## Actors and permissions

Notebook accessors.

## User-facing behavior

- `NotebookEntryList`: create/rename/delete folder; nest via `parentId`; assign `folderId`
- DnD reorder siblings → `POST …/entries/reorder` mode `explorer`
- Duplicate entry; create from template / mark template
- Search filters panel (title/authors/date/phase text + structured filters)

## Acceptance criteria

- [ ] Create folder → move entry → reload → still nested
- [ ] Explorer DnD does not change calendar `order` / `date`
- [ ] Filters hide non-matching entries; clear resets

## Data and APIs

- `notebook.folders` map; entry `folderId`, `explorerOrder`
- Reorder: `{ mode: "explorer", orderedIds, folderId? }`

## Non-goals

- Server-side full-text search (see [backlog](../backlog.md))
