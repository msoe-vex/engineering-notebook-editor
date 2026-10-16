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

## Feature index

| ID | Title | Status |
| --- | --- | --- |
| [FR-auth](./features/FR-auth.md) | Authentication & session | current |
| [FR-orgs](./features/FR-orgs.md) | Organizations, people, invites, teams | current |
| [FR-notebooks](./features/FR-notebooks.md) | Notebooks, setup, roster, access | current |
| [FR-entries-collab](./features/FR-entries-collab.md) | Entries & collaborative editing | current |
| [FR-explorer](./features/FR-explorer.md) | Explorer, folders, search | current |
| [FR-schedule](./features/FR-schedule.md) | Schedule / calendar | current |
| [FR-compile](./features/FR-compile.md) | LaTeX preview & BusyTeX compile | current |
| [FR-zip](./features/FR-zip.md) | ZIP backup export/import | current |
| [FR-genai-audit](./features/FR-genai-audit.md) | GenAI & rubric audit | current |
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
| [NFR-compliance](./quality/NFR-compliance.md) | Compliance posture | partial |
