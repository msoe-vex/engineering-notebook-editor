# Plan: Explorer search/filters & standardized context menus

**Status:** mostly done (Epic F server search deferred)  
**Created:** 2026-10-17  
**Audience:** engineering + product  
**Related:** [FR-explorer](../features/FR-explorer.md), [FR-orgs](../features/FR-orgs.md), [FR-notebooks](../features/FR-notebooks.md), [backlog](../backlog.md), [cloud UX plan](./cloud-ux-hardening.md)

Improve notebook sidebar discovery (search + filters) and make **right-click / overflow menus consistent** across cloud surfaces—not only entries and folders.

When an epic ships, check it off here and fold lasting acceptance into the matching FR.

---

## Goals

1. Make explorer search and filters faster to use and easier to understand (chips, saved clarity, keyboard).
2. Standardize context menus so orgs, notebooks, people/teams, entries, folders, and related chrome share one interaction model.
3. Prefer inline rename / create-then-rename over modal prompts where the sidebar already lists the item (partially shipped for entries/folders).

## Non-goals

- Server-side full-text search across entry bodies (keep as backlog stretch; this plan stays client-side unless a later epic promotes it).
- Replacing the existing `DropdownMenu` overflow (“⋯”)—context menus **complement** it; both should call the same action helpers.
- OS-level tray menus or electron-only APIs.

---

## Priority legend

| Sev | Meaning |
| --- | --- |
| **P1** | Daily friction / inconsistency users hit often |
| **P2** | Polish / density / discoverability |

---

## Epic overview

| Epic | Title | Sev | Primary FR |
| --- | --- | --- | --- |
| A | Shared `ContextMenu` primitive | P1 | shell / UI |
| B | Explorer search & filter UX | P1 | [FR-explorer](../features/FR-explorer.md) |
| C | Explorer actions completeness | P1 | FR-explorer |
| D | Org / notebook / people / team menus | P1 | [FR-orgs](../features/FR-orgs.md), [FR-notebooks](../features/FR-notebooks.md) |
| E | Keyboard & a11y parity | P2 | NFR-a11y / explorer |
| F | Optional server search (stretch) | P2 | FR-explorer + backlog |

Suggested order: **A → C (wire explorer) → B → D → E** (F only if product prioritizes).

---

## Epic A — Shared `ContextMenu` primitive (P1)

### Problem

Explorer already has an ad-hoc portal menu (`NotebookEntryList`). Other lists (org notebooks, people, teams, contributors) use overflow menus only or nothing on right-click. Behavior, styling, and dismiss rules diverge.

### Work

- [x] Extract a reusable `ContextMenu` (portal, viewport clamping, Esc / outside click, separators, danger items, optional icons)—same visual language as `DropdownMenu`.
- [x] Single `MenuItem` type (shared via `menuTypes.ts`) for dropdown + context menu builders; `MenuList` shared renderer.
- [x] Document: right-click opens context menu; “⋯” opens the same items; no silent no-op on empty background where create actions apply.

### Acceptance

- [x] One component powers explorer context menus without regressing current entry/folder/root actions.

---

## Epic B — Explorer search & filter UX (P1)

### Problem

Filters exist (text, phase, author, date range) but are easy to miss, hard to see when active, and don’t surface “why is this tree empty?” well.

### Work

- [x] Persist filter panel open/closed + last filters per notebook (`sessionStorage`).
- [x] Active filter **chips** under the search field (phase / author / dates / kind / query) with one-click clear per chip + Clear all.
- [x] Empty state when filtering: “No matches” + Clear filters.
- [x] Search focuses with `/` when not typing in another field.
- [x] Phase filter: icon+color chips (reuse `PhaseChip`).
- [x] Author filter: datalist typeahead from known authors.
- [x] “All / Entries / Templates” kind toggle.
- [x] Sort modes (name, date, phase); while filtering/searching, matches show as a flat sorted list.

### Acceptance

- [x] User can apply phase+date filters, see chips, clear one chip, and restore the full tree.
- [x] FR-explorer filter acceptance amended with chips + empty state.

---

## Epic C — Explorer actions completeness (P1)

### Problem

Create flows and rename were prompt-heavy; context menus don’t cover every action users expect from a file tree.

### Work

- [x] Create entry/folder immediately with default name; inline rename in the sidebar (Enter commit, Esc cancel).
- [x] Rename entry/folder from menu uses inline field (not modal prompt).
- [x] Double-click row label to rename (when not dragging); keep single-click = open/toggle.
- [x] Context menu: Open, Rename, Duplicate, Move to…, New entry/subfolder (folders), Delete; templates keep “New from template”.
- [x] Multi-select: context menu offers bulk Move / Delete when selection size &gt; 1.
- [x] Root / empty-area menu: New entry, New folder.

### Acceptance

- [x] New blank entry appears in the tree and focuses rename without a dialog.
- [x] Right-click and ⋯ expose the same action set for a given row.

---

## Epic D — Org / notebook / people / team menus (P1)

### Problem

Cloud chrome outside the explorer lacks consistent right-click actions.

### Work

- [x] **Org list (home):** Open, People, Rename/Delete (permission-gated); same items on ⋯.
- [x] **Notebook list (org):** Open, Settings, Rename, Delete; same items on ⋯.
- [x] **People / invites:** Change role, Remove; Copy link, Renew invite, Revoke (confirm); same items on ⋯.
- [x] **Teams:** Show/hide people, Rename, Delete via context + ⋯.
- [x] **Contributors roster:** Edit, Upload photo, Unlink account, Remove.
- [x] Reuse Epic A primitive; gate items with the same permission checks as toolbar buttons.

### Acceptance

- [x] Primary org/notebook/team/contributor rows support context menus aligned with overflow actions.
- [x] Destructive items require the same confirmations as today.
- [x] People/invites context menu parity.

---

## Epic E — Keyboard & a11y (P2)

### Work

- [x] Arrow keys move highlight in open context menu; Enter activates; Esc closes.
- [x] `aria-haspopup` on dropdown triggers; menu `role="menu"` / `menuitem`.
- [x] Rename input: Escape cancels without saving empty names (keep previous / default).

### Acceptance

- [x] Context menu usable without a pointer on desktop.

---

## Epic F — Server-side search (stretch, P2)

### Problem

Client-side title/author/date filters miss body content and don’t scale for huge notebooks.

### Work

- [ ] Design Core search endpoint (title + optional body excerpt); wire explorer query when length ≥ N.
- [ ] Keep local filters as progressive enhancement / offline of metadata.

Only schedule if product elevates the backlog item **Server-side entry search**.

---

## Docs updates checklist

| Doc | Update when shipping |
| --- | --- |
| [FR-explorer](../features/FR-explorer.md) | Chips, empty filter state, inline create/rename, shared menus |
| [FR-orgs](../features/FR-orgs.md) / [FR-notebooks](../features/FR-notebooks.md) | Context menus on lists |
| [backlog.md](../backlog.md) | Link this plan; demote duplicate bullets |
| Smoke / a11y | Keyboard menu checks |

---

## Verification

- Create entry → rename inline → reload → title persists.
- Filters: phase + date → chips → clear one → Clear all.
- Right-click entry/folder/root; same actions as ⋯ where applicable.
- Org notebook list and home org list: right-click matches overflow actions; confirms still fire.
