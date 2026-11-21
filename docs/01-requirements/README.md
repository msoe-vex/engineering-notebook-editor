# Requirements

Authoritative **what must be true** for the live product.

| Kind | Prefix | Location |
| --- | --- | --- |
| Feature | `FR-*` | [features/](./features/) |
| Quality (non-functional) | `NFR-*` | [quality/](./quality/) |
| Backlog | — | [backlog.md](./backlog.md) |

Status values: **current** (shipped), **partial**, **planned**.

Templates: [_templates/FR.md](./_templates/FR.md), [_templates/NFR.md](./_templates/NFR.md).  
Product context: [00-product/](../00-product/). Contracts: [03-reference/](../03-reference/).

## Active plans

| Plan | Status |
| --- | --- |
| [Platform ports (metadata, identity, notifications)](./plans/platform-ports.md) | Epics A–D done; stretch GenAi / second-cloud deferred |
| [Cloud UX hardening & legacy parity](./plans/cloud-ux-hardening.md) | mostly done (manual smoke leftovers) |
| [Mobile-responsive shell](./plans/mobile-responsive.md) | mostly done (device smoke leftovers) |
| [Explorer search & context menus](./plans/explorer-search-context-menus.md) | done (Epic F server search deferred) |

Also: [backlog.md](./backlog.md) · [roadmap](../00-product/roadmap.md).

## Feature index

| ID | Title | Status |
| --- | --- | --- |
| [FR-auth](./features/FR-auth.md) | Authentication & session (multi-email / Collab IdentityPort remaining) | partial |
| [FR-notifications](./features/FR-notifications.md) | Transactional email & notifications (console; Resend remaining) | partial |
| [FR-orgs](./features/FR-orgs.md) | Organizations, people, invites, teams, alumni | current |
| [FR-notebooks](./features/FR-notebooks.md) | Notebooks, Settings, Contributors, access | partial |
| [FR-public-notebook](./features/FR-public-notebook.md) | Public notebook share link (judgments stay private) | partial |
| [Public / collab / comments plan](./plans/public-collab-comments-polish.md) | CMS share UX, cursors, comments, compile SSE, trash | current (A–F) |
| [FR-org-public-page](./features/FR-org-public-page.md) | Public organization profile page | partial |
| [FR-comments](./features/FR-comments.md) | Entry comments (Yjs anchors + SSE threads) | partial |
| [FR-entries-collab](./features/FR-entries-collab.md) | Entries & collaborative editing | partial |
| [FR-explorer](./features/FR-explorer.md) | Explorer, folders, search | partial |
| [FR-trash](./features/FR-trash.md) | Trash (entries, rubrics, contributors, phases) | current |
| [FR-schedule](./features/FR-schedule.md) | Schedule / calendar | partial |
| [FR-compile](./features/FR-compile.md) | LaTeX preview & server compile jobs | partial |
| [FR-zip](./features/FR-zip.md) | ZIP backup export/import | current |
| [FR-genai-judge](./features/FR-genai-judge.md) | GenAI titles & notebook Judge | current |
| [FR-account](./features/FR-account.md) | Account preferences | current |
| [FR-admin](./features/FR-admin.md) | Platform admin | current |
| [FR-help](./features/FR-help.md) | Help & About | current |

## Quality index

| ID | Title | Status |
| --- | --- | --- |
| [NFR-security](./quality/NFR-security.md) | Security & tenancy | current |
| [NFR-privacy](./quality/NFR-privacy.md) | Privacy & secrets | current |
| [NFR-reliability](./quality/NFR-reliability.md) | Reliability & data integrity | current |
| [NFR-performance](./quality/NFR-performance.md) | Performance | partial |
| [NFR-accessibility](./quality/NFR-accessibility.md) | Accessibility | partial |
| [NFR-responsive](./quality/NFR-responsive.md) | Responsive & mobile usability | planned |
| [NFR-compliance](./quality/NFR-compliance.md) | Compliance posture | partial |
