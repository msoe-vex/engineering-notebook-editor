# Improvement backlog

Forward-looking work. Requirements index: [README.md](./README.md). Parity epics A–H are done (git history).

## Active plans

**[Cloud UX hardening & legacy parity](./plans/cloud-ux-hardening.md)** — P0 image upload `bodyLimit`, toasts, phase icons, split/live LaTeX, metadata save + sync, validation revalidation, editor chrome, unified templates, calendar day height, skeletons, share dialog. Prefer that plan over ad-hoc polish until it is marked done.

**[Mobile-responsive shell](./plans/mobile-responsive.md)** — Phone/tablet layouts for all signed-in surfaces; notebook section nav (slim strip desktop, bottom tabs mobile); explorer drawer; entry editor without split on narrow; [NFR-responsive](./quality/NFR-responsive.md).

**[Explorer search & context menus](./plans/explorer-search-context-menus.md)** — Sidebar search/filter chips + empty states; shared `ContextMenu` primitive; standardize right-click for explorer, orgs, notebooks, people/teams, contributors.

## Done (architecture hygiene)

- [x] Archive unreachable legacy UI under `website/archive/legacy/`
- [x] Replace `@/lib/store` with `workspaceState` / `workspaceBridge`
- [x] Archive `lib/github`, `lib/storage`, `hooks/useWorkspace`, classic `Editor.tsx`
- [x] Extract live `NotebookFormatToolbar` + `insertBlock`
- [x] Docs restructure (product / FR-NFR / architecture / reference / guides / ops)

## Product polish (after / outside the active plan)

- [ ] **Server-side entry search** — explorer filters are client-side; stretch epic in [explorer-search-context-menus](./plans/explorer-search-context-menus.md)
- [ ] **Invite `status`** — optional `pending | accepted | revoked`
- [ ] **`gcsPathOriginal`** — only if print-quality / lossless re-export becomes a real need; today one compressed blob is enough
- [ ] **Metrics persistence** — Core metrics in-memory today ([FR-admin](./features/FR-admin.md))
- [ ] **Cloud-native Settings/Help/About/Calendar** (optional) — still under `components/pages/`
- [ ] **Collab presence avatars** — beyond Live/Offline chip ([plan](./plans/cloud-ux-hardening.md) extras)

## Non-goals

See [vision.md](../00-product/vision.md) and ADRs 001–003.

## Context

Legacy archive: [`website/archive/legacy/`](../../website/archive/legacy/).
