# FR-genai-audit: GenAI & rubric audit

Status: current  

Related: [ADR-003](../../02-architecture/decisions/ADR-003-byok-keys-local.md), [ADR-004](../../02-architecture/decisions/ADR-004-agents-genai-gateway.md), [ADR-005](../../02-architecture/decisions/ADR-005-genai-in-core.md), [plan](../plans/agents-genai-gateway.md), [FR-account](./FR-account.md), [NFR-privacy](../quality/NFR-privacy.md)

## Summary

Optional GenAI for titles/captions and **rubric judging** is orchestrated by the **website** (local, BYOK, or Vertex). **Core** supplies ACL’d notebook tools, stores scorecards, and proxies Vertex inference (`grants.platformAi` or service_admin). See [ADR-004](../../02-architecture/decisions/ADR-004-agents-genai-gateway.md), [ADR-005](../../02-architecture/decisions/ADR-005-genai-in-core.md).

## Actors and permissions

- GenAI: any user with keys/settings locally
- Audit: notebook access required; Vertex additionally grant-gated

## User-facing behavior

- Entry title GenerateButton; ImageNodeView GenAI when src resolved
- Overflow Audit + history of scorecards

## Acceptance criteria

- [x] Website routes `local` | `byok` | `vertex` for titles and judge; one browser orchestration path
- [x] BYOK inference does not use Core; Vertex uses Core `/ai/complete` only (grant-gated)
- [x] Vertex only when grant allows (Core enforces); BYOK/local reuse GenAI settings
- [x] Audit is multi-request: start run, progress PATCH, final scorecard
- [x] Rubric audit is multi-step: website judge + Core entry tools
- [x] Tool calls and audit writes respect notebook ACL; Core does not run the product judge loop
- [x] No separate Agents service required (retired from compose/deploy)
- [x] BYOK key passed only in request body / localStorage—not Firestore preferences
- [x] Audit without notebook access → denied
- [x] Past audits listable via `GET …/audits`

## Data and APIs

Canonical contracts: [api-contracts.md](../../03-reference/api-contracts.md).

- Core: Vertex `POST /ai/complete`; `…/audits` POST/PATCH/GET; entry reads for tools
- Website: judge loop; `/api/genai*` for BYOK CORS only

## Non-goals

- Storing API keys in Firestore; training on user notebooks without consent
