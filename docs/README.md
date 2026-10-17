# Documentation

Cloud engineering notebook: Firebase Auth, Firestore + GCS, Hocuspocus/Yjs on Cloud Run.  
**One live storage path (GCP).** ZIP is backup (LWW), not sync. Legacy UI: [`website/archive/legacy/`](../website/archive/legacy/).

## Start here by audience

| I am… | Read first |
| --- | --- |
| **Product / PM** | [00-product/vision.md](./00-product/vision.md) → [journeys.md](./00-product/journeys.md) → [01-requirements/](./01-requirements/) |
| **New engineer** | [04-guides/onboarding-engineer.md](./04-guides/onboarding-engineer.md) → [local-development.md](./04-guides/local-development.md) → [02-architecture/overview.md](./02-architecture/overview.md) |
| **On-call / ops** | [05-ops/monitoring.md](./05-ops/monitoring.md) → [05-ops/runbooks/](./05-ops/runbooks/) |

## Map

| Area | Purpose |
| --- | --- |
| [00-product/](./00-product/) | Vision, personas, journeys, glossary |
| [01-requirements/](./01-requirements/) | Features (FR-\*) and quality (NFR-\*), backlog, [active plans](./01-requirements/plans/cloud-ux-hardening.md) |
| [02-architecture/](./02-architecture/) | Services, ACL, realtime, ADRs |
| [03-reference/](./03-reference/) | API contracts, schema, env vars |
| [04-guides/](./04-guides/) | Local dev, deploy, smoke tests, onboarding |
| [05-ops/](./05-ops/) | Monitoring and incident runbooks |

**How to update docs:** [CONTRIBUTING-DOCS.md](./CONTRIBUTING-DOCS.md) · **Agents:** [../AGENTS.md](../AGENTS.md)

## Rule

One fact, one place. Product docs say *what/why*; architecture says *where*; reference says *contracts*; guides say *steps*. Cross-link—do not duplicate.
