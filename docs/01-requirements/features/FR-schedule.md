# FR-schedule: Schedule / calendar

Status: current  
Related: [glossary](../../00-product/glossary.md) (`date` + `order`)

## Summary

Calendar view arranges non-template entries by **date**; same-day sequence uses **order**. Reorder persists via Core `mode: "day"`.

## Actors and permissions

Notebook accessors.

## User-facing behavior

- `/…/schedule` ( `/calendar` redirects)
- Month/week; drag entries between days / within day
- Deep links `?date=&view=`

## Acceptance criteria

- [ ] Moving an entry updates `date` and same-day `orderedIds` via API
- [ ] Explorer `explorerOrder` unchanged by calendar DnD
- [ ] Templates excluded from schedule

## Data and APIs

- `reorderEntries` mode `day` with `date` + `orderedIds`
- Densified metadata via `workspaceState` for CalendarView

## Non-goals

- External calendar sync (Google/Outlook)
