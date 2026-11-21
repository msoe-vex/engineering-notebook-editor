# Roadmap — progress and plans

Living plan for ENGen (engineering notebook editor). Pair with [vision.md](./vision.md), [journeys.md](./journeys.md), and [backlog.md](../01-requirements/backlog.md).  
GitHub issues: [msoe-vex/engineering-notebook-editor/issues](https://github.com/msoe-vex/engineering-notebook-editor/issues).

**Origin:** Built for **robotics design notebooks** (VEX, FIRST, and similar teams) — structured entries, phases, credits, and printable PDFs — now a multi-tenant cloud product (GCP + Firebase).

**Related public site (separate repo):** [msoe-vex/vex-website](https://github.com/msoe-vex/vex-website) is the current marketing / club website. Longer term, ENGen may host a **public org profile** that can complement that site — without mixing it into the signed-in **org dashboard**.

---

## Current progress (shipped / in tree)

| Area | Status | Notes |
| --- | --- | --- |
| Cloud tenancy (orgs, notebooks, invites, teams, multi-owner, alumni) | Done | [FR-orgs](../01-requirements/features/FR-orgs.md) |
| Collaborative entries (Yjs / Hocuspocus) | Partial | Core path + Collab via Core ACL; polish in [FR-entries-collab](../01-requirements/features/FR-entries-collab.md) |
| Explorer / chrome / share / archive | Done / polish | UX plans largely shipped; archive + share dialog; mobile leftovers = manual smoke |
| Entry trash | Done | [FR-trash](../01-requirements/features/FR-trash.md) |
| **Async compile + judge + Pub/Sub wake** | Done | Local Compose + prod deploy script/docs ([ADR-008](../02-architecture/decisions/ADR-008-job-dispatch-evolution.md)); live GCP smoke still optional |
| GenAI in Core + website orchestration | Done / evolving | [ADR-004](../02-architecture/decisions/ADR-004-agents-genai-gateway.md), [ADR-005](../02-architecture/decisions/ADR-005-genai-in-core.md) |
| Account Profile / Preferences | Done | [FR-account](../01-requirements/features/FR-account.md); secondary emails + provider link |
| Auth / notifications | Done (ports slice) | Reset + social hooks; secondary emails; `NotificationPort` console + Resend — [FR-auth](../01-requirements/features/FR-auth.md), [FR-notifications](../01-requirements/features/FR-notifications.md) |
| Public org page + notebooks | Done (MVP) | Slug `/o/:slug`, CMS admin UI, TipTap public entries, copy URL, last PDF; org assets + People photos |
| Platform ports | Done (stretch left) | `AuthPort`, `StoragePort`, `JobDispatchPort`, `NotificationPort`, `MetadataStore`; Epic B storage hardening/docs shipped; stretch = GenAiCompletePort / second-cloud adapters — [ADR-009](../02-architecture/decisions/ADR-009-platform-ports.md) |

Open bugs / older requests: tables [#87](https://github.com/msoe-vex/engineering-notebook-editor/issues/87), descriptions [#81](https://github.com/msoe-vex/engineering-notebook-editor/issues/81), comments [#79](https://github.com/msoe-vex/engineering-notebook-editor/issues/79), tagging [#64](https://github.com/msoe-vex/engineering-notebook-editor/issues/64), LuaLaTeX [#67](https://github.com/msoe-vex/engineering-notebook-editor/issues/67), explorer dual modes [#69](https://github.com/msoe-vex/engineering-notebook-editor/issues/69), AI judge UX [#68](https://github.com/msoe-vex/engineering-notebook-editor/issues/68).

---

## Platform: jobs & workers

**Current:** `JOB_DISPATCH=pubsub` — Core publishes; `compile` / `judge` **pull**. Compose emulator + Cloud Run deploy path (topics/IAM, min-instances ≥ 1, CPU always-on) — [deploy-cloudrun.md](../04-guides/deploy-cloudrun.md).

HTTP Core→worker wake is **retired**.

---

## Platform: ports & identity

**Current:** Ports above including MetadataStore on Core business routes; StoragePort is the only product blob API (GCS adapter); workers fetch/put bytes via Core internal APIs — [platform-ports.md](../01-requirements/plans/platform-ports.md) Epics A–D.

**Next:** Optional GenAiCompletePort; AWS/Mongo/S3 adapters remain non-goals until a real migration.

---

## Planned product polish

### Done (ports / public polish slice)

- Doc/contract sync; org assets + People photos; public CMS + delete cascade; public notebook UX; prod Pub/Sub deploy wiring; MetadataStore users/rbac + Collab ACL; secondary emails + Resend

### UX plans (largely shipped)

1. [Cloud UX hardening](../01-requirements/plans/cloud-ux-hardening.md) — **mostly done** (manual smoke leftovers)  
2. [Mobile-responsive shell](../01-requirements/plans/mobile-responsive.md) — **mostly done** (device smoke + soft-keyboard check)  
3. [Explorer search & context menus](../01-requirements/plans/explorer-search-context-menus.md) — **done** (Epic F server search deferred)

### Active plans (next) — pick up on `microservices`

1. [UI standardization](../01-requirements/plans/ui-standardization.md) — kit, side rails, Settings IA, ImageField, quieter copy, drop `V5` type suffix  
2. Manual smoke leftovers (mobile keyboard, share ACL, upload limits) — [smoke-tests](../04-guides/smoke-tests.md)  
3. Older GitHub issues (tables, tagging, …) when prioritized  
4. Stretch ports: GenAiCompletePort / second-cloud adapters only if needed — [platform-ports.md](../01-requirements/plans/platform-ports.md)  

### Recently shipped on `microservices`

1. [Public CMS / collab / comments / jobs SSE / trash](../01-requirements/plans/public-collab-comments-polish.md) — Epics A–F (polish leftovers in plan)  
2. [Public content IA Option C](../01-requirements/plans/public-content-ia.md) — donors/projects/events tabs; section gates  
3. [Notebook PDF share links](../01-requirements/features/FR-public-notebook.md) — named compile versions + explicit share links; `/o/:slug/n/:key` proxies PDF via Core  



Handoff notes: [local-development.md](../04-guides/local-development.md#handoff--continue-later).

### Explicitly out of scope for public surfaces

- **Rubrics / judgments are not public** — remain org/notebook ACL only. Publish/revoke is recorded on the notebook (`publishedAt` / `publishedBy`) for admins; no public judgment trail.

---

## Non-goals (this roadmap slice)

- Replacing GitHub as code host  
- Merging vex-website into this repo in the first pass  
- Public crawl of private notebooks without explicit publish  
- Public exposure of judgments / rubric grades  
- Billing / paid org pages  
- Restoring HTTP job wake or preferring Cloud Tasks over Pub/Sub  
- Dual-writing two clouds or replacing the IdP wholesale (ADR-009)
