# Engineer onboarding

## Day 0

1. Read [vision](../00-product/vision.md) and [journeys](../00-product/journeys.md)
2. Skim [architecture overview](../02-architecture/overview.md), [diagrams](../02-architecture/diagrams.md), and [tenancy-acl](../02-architecture/tenancy-acl.md)
3. Run [local-development](./local-development.md) until you can create an entry

## Day 1

1. Trace one FR end-to-end (suggest [FR-entries-collab](../01-requirements/features/FR-entries-collab.md) — sequence in [diagrams](../02-architecture/diagrams.md))
2. Open [api-contracts](../03-reference/api-contracts.md) and [schema](../03-reference/schema.md)
3. Note ADRs under [decisions/](../02-architecture/decisions/) (esp. 001–003, 006 jobs, 007 judge)

## Conventions

- Product behavior → update FR acceptance criteria ([CONTRIBUTING-DOCS](../CONTRIBUTING-DOCS.md))
- Live UI: `website/src/app/(app)/` + `components/cloud/`
- Do not import `website/archive/legacy/`

## Backlog

[01-requirements/backlog.md](../01-requirements/backlog.md)
