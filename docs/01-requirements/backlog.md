# Improvement backlog

Forward-looking work. Requirements index: [README.md](./README.md). Parity epics A–H are done (git history).

## Active plans

**[Cloud UX hardening & legacy parity](./plans/cloud-ux-hardening.md)** — P0 image upload `bodyLimit`, toasts, phase icons, split/live LaTeX, metadata save + sync, validation revalidation, editor chrome, unified templates, calendar day height, skeletons, share dialog.

**[Mobile-responsive shell](./plans/mobile-responsive.md)** — Phone/tablet layouts; notebook section nav; explorer drawer; [NFR-responsive](./quality/NFR-responsive.md).

**[Explorer search & context menus](./plans/explorer-search-context-menus.md)** — Sidebar search/filter; shared `ContextMenu`.

**[Platform ports](./plans/platform-ports.md)** — MetadataStore depth, identity, notifications — [ADR-009](../02-architecture/decisions/ADR-009-platform-ports.md).

## Done (architecture hygiene)

- [x] Archive unreachable legacy UI under `website/archive/legacy/`
- [x] Replace `@/lib/store` with `workspaceState` / `workspaceBridge`
- [x] Archive `lib/github`, `lib/storage`, `hooks/useWorkspace`, classic `Editor.tsx`
- [x] Extract live `NotebookFormatToolbar` + `insertBlock`
- [x] Docs restructure (product / FR-NFR / architecture / reference / guides / ops)
- [x] Async compile + judge workers + **Pub/Sub-only** wake — [ADR-006](../02-architecture/decisions/ADR-006-compile-job.md), [ADR-007](../02-architecture/decisions/ADR-007-python-langgraph-judge.md), [ADR-008](../02-architecture/decisions/ADR-008-job-dispatch-evolution.md)
- [x] Retire `services/agents` — [ADR-004](../02-architecture/decisions/ADR-004-agents-genai-gateway.md), [ADR-005](../02-architecture/decisions/ADR-005-genai-in-core.md)
- [x] `NotificationPort` console + invite email hook
- [x] Password reset + Google/GitHub sign-in hooks (Firebase client)
- [x] Alumni `status` API + People Active/Alumni sections
- [x] Public org/notebook APIs + `/o/:slug` routes (MVP)

## Product polish

- [ ] **Server-side entry search**
- [ ] **Invite `status`** — optional `pending | accepted | revoked`
- [ ] **`gcsPathOriginal`** — only if print-quality need appears
- [ ] **Metrics persistence**
- [ ] **Collab presence avatars**

## Public / people polish

- [x] **Org-scoped assets** + People photo upload
- [x] **Public CMS admin UI** (`/orgs/:id/public`) + delete cascade
- [x] **Public notebook** TipTap read-only + copy URL + last PDF
- [ ] Keep [vex-website](https://github.com/msoe-vex/vex-website) until explicit migration

## Platform / job dispatch

- [x] `JOB_DISPATCH=pubsub` + Compose emulator + worker pull — [#93](https://github.com/msoe-vex/engineering-notebook-editor/issues/93)
- [x] **Prod Pub/Sub** topics/IAM + Cloud Run always-on note for pull workers

## Platform / ports & identity

- [x] `AuthPort` + `StoragePort` + `JobDispatchPort` (pubsub) + `NotificationPort` (console / Resend)
- [x] Password reset + social sign-in hooks
- [x] **Multi-email** (verified secondaries) + Resend adapter
- [x] **`MetadataStore`** migrate users/rbac (+ more)
- [x] Collab shares Core identity / ACL (no divergent Admin Auth path)

## Non-goals

See [vision.md](../00-product/vision.md) and ADRs 001–009.

## Context

Legacy archive: [`website/archive/legacy/`](../../website/archive/legacy/).
