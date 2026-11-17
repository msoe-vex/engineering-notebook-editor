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
- [x] Async compile + judge workers (Compose HTTP dispatch) — [ADR-006](../02-architecture/decisions/ADR-006-compile-job.md), [ADR-007](../02-architecture/decisions/ADR-007-python-langgraph-judge.md)
- [x] Retire `services/agents` in favor of Core + website GenAI — [ADR-004](../02-architecture/decisions/ADR-004-agents-genai-gateway.md), [ADR-005](../02-architecture/decisions/ADR-005-genai-in-core.md)

## Product polish (after / outside the active plan)

- [ ] **Server-side entry search** — explorer filters are client-side; stretch epic in [explorer-search-context-menus](./plans/explorer-search-context-menus.md)
- [ ] **Invite `status`** — optional `pending | accepted | revoked`
- [ ] **`gcsPathOriginal`** — only if print-quality / lossless re-export becomes a real need; today one compressed blob is enough
- [ ] **Metrics persistence** — Core metrics in-memory today ([FR-admin](./features/FR-admin.md))
- [ ] **Cloud-native Settings/Help/About/Calendar** (optional) — still under `components/pages/`
- [ ] **Collab presence avatars** — beyond Live/Offline chip ([plan](./plans/cloud-ux-hardening.md) extras)

## Public / org storytelling (planned)

See [roadmap.md](../00-product/roadmap.md).

- [ ] **Active vs alumni** org members — [FR-orgs](./features/FR-orgs.md) · [#91](https://github.com/msoe-vex/engineering-notebook-editor/issues/91)
- [ ] **Public notebook share link** — [FR-public-notebook](./features/FR-public-notebook.md) · [#89](https://github.com/msoe-vex/engineering-notebook-editor/issues/89)
- [ ] **Public org page** (projects, donors/sponsors, events, social, media; public\|hidden) — [FR-org-public-page](./features/FR-org-public-page.md) · [#90](https://github.com/msoe-vex/engineering-notebook-editor/issues/90)
- [ ] Keep [vex-website](https://github.com/msoe-vex/vex-website) as current club site until an explicit migration plan exists

## Platform / job dispatch (planned)

See [async-jobs.md](../02-architecture/async-jobs.md), [ADR-008](../02-architecture/decisions/ADR-008-job-dispatch-evolution.md).

- [x] Compose `compile` + `judge` workers + Core job docs/SSE (`JOB_DISPATCH=http`)
- [ ] **`JOB_DISPATCH=pubsub`** + Compose Pub/Sub emulator (same topic/sub names as GCP) — [#93](https://github.com/msoe-vex/engineering-notebook-editor/issues/93)
- [ ] Optional **Cloud Tasks** dispatcher as an alternate port (not the preferred parity path)

## Non-goals

See [vision.md](../00-product/vision.md) and ADRs 001–008.

## Context

Legacy archive: [`website/archive/legacy/`](../../website/archive/legacy/).
