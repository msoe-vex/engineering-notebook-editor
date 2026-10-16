# Improvement backlog

Forward-looking work. Requirements index: [README.md](./README.md). Parity epics A–H are done (git history).

## Done (architecture hygiene)

- [x] Archive unreachable legacy UI under `website/archive/legacy/`
- [x] Replace `@/lib/store` with `workspaceState` / `workspaceBridge`
- [x] Archive `lib/github`, `lib/storage`, `hooks/useWorkspace`, classic `Editor.tsx`
- [x] Extract live `NotebookFormatToolbar` + `insertBlock`
- [x] Docs restructure (product / FR-NFR / architecture / reference / guides / ops)

## Product polish

- [ ] **Server-side entry search** — explorer filters are client-side ([FR-explorer](./features/FR-explorer.md))
- [ ] **`NotebookMember.linkedUid`** — optional link roster → org member
- [ ] **Invite `status`** — optional `pending | accepted | revoked`
- [ ] **`gcsPathOriginal`** — write originals alongside compressed assets
- [ ] **Metrics persistence** — Core metrics in-memory today ([FR-admin](./features/FR-admin.md))
- [ ] **Cloud-native Settings/Help/About/Calendar** (optional) — still under `components/pages/`

## Non-goals

See [vision.md](../00-product/vision.md) and ADRs 001–003.

## Context

Legacy archive: [`website/archive/legacy/`](../../website/archive/legacy/).
