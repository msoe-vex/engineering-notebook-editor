# Roadmap — progress and plans

Living plan for ENGen (engineering notebook editor). Pair with [vision.md](./vision.md), [journeys.md](./journeys.md), and [backlog.md](../01-requirements/backlog.md).  
GitHub issues: [msoe-vex/engineering-notebook-editor/issues](https://github.com/msoe-vex/engineering-notebook-editor/issues).

**Origin:** Built for **robotics design notebooks** (VEX, FIRST, and similar teams) — structured entries, phases, credits, and printable PDFs — now a multi-tenant cloud product (GCP + Firebase).

**Related public site (separate repo):** [msoe-vex/vex-website](https://github.com/msoe-vex/vex-website) is the current marketing / club website. Longer term, ENGen may host a **public org profile** that can complement that site — without mixing it into the signed-in **org dashboard**.

---

## Current progress (shipped / in tree)

| Area | Status | Notes |
| --- | --- | --- |
| Cloud tenancy (orgs, notebooks, invites, teams, multi-owner) | Done | [FR-orgs](../01-requirements/features/FR-orgs.md) |
| Collaborative entries (Yjs / Hocuspocus) | Partial | Shipped core path; polish left in [FR-entries-collab](../01-requirements/features/FR-entries-collab.md) (mega-proposal [#66](https://github.com/msoe-vex/engineering-notebook-editor/issues/66) closed) |
| Explorer / chrome / share / archive | Partial | UX plans active; archive + share dialog shipped |
| Entry trash | Done | [FR-trash](../01-requirements/features/FR-trash.md) |
| **Async compile jobs + `services/compile`** | Done (local HTTP) | [ADR-006](../02-architecture/decisions/ADR-006-compile-job.md); Compose worker `:8090` |
| **Judge worker (`services/judge`)** | Done (local HTTP) | [ADR-007](../02-architecture/decisions/ADR-007-python-langgraph-judge.md); Compose `:8091` |
| GenAI in Core + website orchestration | Done / evolving | [ADR-004](../02-architecture/decisions/ADR-004-agents-genai-gateway.md), [ADR-005](../02-architecture/decisions/ADR-005-genai-in-core.md); `services/agents` removed |
| Account Profile / Preferences | Done | [FR-account](../01-requirements/features/FR-account.md) |
| Docs Diátaxis + plans | Done | UX / mobile / explorer / GenAI plans under `01-requirements/plans/` |
| Job dispatch → Pub/Sub | Planned | [ADR-008](../02-architecture/decisions/ADR-008-job-dispatch-evolution.md), [#93](https://github.com/msoe-vex/engineering-notebook-editor/issues/93) — local emulator ↔ GCP parity |
| Cloud Tasks dispatch | Optional alternate | Push-HTTP wake without a bus; weaker local 1:1 than Pub/Sub |

Open bugs / older requests: tables [#87](https://github.com/msoe-vex/engineering-notebook-editor/issues/87), descriptions [#81](https://github.com/msoe-vex/engineering-notebook-editor/issues/81), comments [#79](https://github.com/msoe-vex/engineering-notebook-editor/issues/79), tagging [#64](https://github.com/msoe-vex/engineering-notebook-editor/issues/64), LuaLaTeX [#67](https://github.com/msoe-vex/engineering-notebook-editor/issues/67), explorer dual modes [#69](https://github.com/msoe-vex/engineering-notebook-editor/issues/69), AI judge UX [#68](https://github.com/msoe-vex/engineering-notebook-editor/issues/68).

---

## Platform: jobs & workers

**Current:** Core durable jobs + Compose **`compile`** / **`judge`** workers via `JOB_DISPATCH=http` — [async-jobs.md](../02-architecture/async-jobs.md).

**Next:** `JOB_DISPATCH=pubsub` — Core publishes; workers subscribe; Compose Pub/Sub emulator uses the **same topic/sub names** as GCP ([ADR-008](../02-architecture/decisions/ADR-008-job-dispatch-evolution.md), [#93](https://github.com/msoe-vex/engineering-notebook-editor/issues/93)).

**Optional:** Cloud Tasks as an alternate port if push-HTTP wake is enough without a bus.

---

## Planned product surfaces

### A. Public notebook link — [#89](https://github.com/msoe-vex/engineering-notebook-editor/issues/89)

Shareable **public / unlisted** read-only notebook URL. Default remains private.  
[FR-public-notebook](../01-requirements/features/FR-public-notebook.md).

### B. Public org profile vs org dashboard — [#90](https://github.com/msoe-vex/engineering-notebook-editor/issues/90), [#92](https://github.com/msoe-vex/engineering-notebook-editor/issues/92)

| Surface | Audience | Purpose |
| --- | --- | --- |
| **Org dashboard** | Members / admins | Notebooks, People, Teams, settings |
| **Public org page** | Outsiders | Projects, donors/sponsors, events, social, media (public\|hidden) |

[FR-org-public-page](../01-requirements/features/FR-org-public-page.md). Complements [vex-website](https://github.com/msoe-vex/vex-website); no forced migration in v1.

### C. Active vs alumni — [#91](https://github.com/msoe-vex/engineering-notebook-editor/issues/91)

Split People into **Active** and **Alumni**; alumni lose write access. [FR-orgs](../01-requirements/features/FR-orgs.md).

---

## Suggested delivery order

1. Finish active UX/mobile/explorer plans as needed for stability  
2. **Pub/Sub** job dispatch (`JOB_DISPATCH=pubsub` + emulator) — [#93](https://github.com/msoe-vex/engineering-notebook-editor/issues/93)  
3. **Alumni status** — [#91](https://github.com/msoe-vex/engineering-notebook-editor/issues/91)  
4. **Public notebook link** — [#89](https://github.com/msoe-vex/engineering-notebook-editor/issues/89)  
5. **Public org page** + dashboard IA split — [#90](https://github.com/msoe-vex/engineering-notebook-editor/issues/90), [#92](https://github.com/msoe-vex/engineering-notebook-editor/issues/92)  

---

## Non-goals (this roadmap slice)

- Replacing GitHub as code host  
- Merging vex-website into this repo in the first pass  
- Public crawl of private notebooks without explicit publish  
- Billing / paid org pages  
- Requiring Cloud Tasks before Pub/Sub for “modularity” (job protocol is enough; Pub/Sub is for parity — ADR-008)
