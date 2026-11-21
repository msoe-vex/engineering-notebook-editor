# Improvement backlog

Forward-looking work. Requirements index: [README.md](./README.md). Parity epics A–H are done (git history).

## Active plans

**[Public CMS, collab cursors, comments, jobs SSE, trash](./plans/public-collab-comments-polish.md)** — **Shipped (A–F)**; leftover polish (public comment decoration strip, api-contracts stage note detail, judge stage reuse).

**[Platform ports](./plans/platform-ports.md)** — Epics A–D shipped (incl. StoragePort hardening/docs); stretch GenAiCompletePort / second-cloud adapters deferred — [ADR-009](../02-architecture/decisions/ADR-009-platform-ports.md).

## UX plans (largely shipped)

**[Cloud UX hardening & legacy parity](./plans/cloud-ux-hardening.md)** — Mostly done; manual smoke leftovers only.

**[Mobile-responsive shell](./plans/mobile-responsive.md)** — Mostly done; phone/tablet shell + drawer + bottom tabs shipped; device smoke remains.

**[Explorer search & context menus](./plans/explorer-search-context-menus.md)** — Done; Epic F server search stays deferred (see Product polish).

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

- [x] **Server-side entry search** — `GET …/entries/search?q=` (+ optional `includeBody=1`); explorer merges body hits
- [x] **Invite `status`** — `pending | accepted | revoked` (revoke soft-deletes; accept sets accepted)
- [ ] **`gcsPathOriginal`** — only if print-quality need appears
- [x] **Metrics persistence** — Core counters in MetadataStore `system/metrics` (periodic + signal flush)
- [x] **Collab presence avatars** — Hocuspocus awareness initials (cloud UX)

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
- [x] **`MetadataStore`** migrate Core business routes
- [x] Collab shares Core identity / ACL (no divergent Admin Auth path)
- [x] **StoragePort hardening** — product blobs via port; object-key contract; workers via Core internal APIs

## Non-goals

See [vision.md](../00-product/vision.md) and ADRs 001–009.

## Context

Legacy archive: [`website/archive/legacy/`](../../website/archive/legacy/).
