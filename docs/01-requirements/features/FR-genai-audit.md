# FR-genai-audit: GenAI & rubric audit

Status: current  
Related: [ADR-003](../../02-architecture/decisions/ADR-003-byok-keys-local.md), [FR-account](./FR-account.md), [NFR-privacy](../quality/NFR-privacy.md)

## Summary

Optional GenAI for titles/captions (BYOK or configured providers). Rubric audit via Agents service with notebook ACL; history listable in UI. Vertex requires `grants.platformAi` or service_admin.

## Actors and permissions

- GenAI: any user with keys/settings locally
- Audit: notebook access required; Vertex additionally grant-gated

## User-facing behavior

- Entry title GenerateButton; ImageNodeView GenAI when src resolved
- Overflow Audit + history of scorecards

## Acceptance criteria

- [ ] BYOK key passed only in request body / localStorage—not Firestore preferences
- [ ] Audit without notebook access → denied
- [ ] Past audits listable via `GET …/audits`

## Data and APIs

- Agents: `POST|GET /v1/orgs/:orgId/notebooks/:notebookId/audit(s)`
- Website GenAI routes under `/api/genai`

## Non-goals

- Storing API keys in Firestore; training on user notebooks without consent
