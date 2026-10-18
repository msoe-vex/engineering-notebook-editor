# FR-genai-audit: GenAI & rubric audit

Status: current  

Related: [ADR-003](../../02-architecture/decisions/ADR-003-byok-keys-local.md), [ADR-004](../../02-architecture/decisions/ADR-004-agents-genai-gateway.md), [ADR-005](../../02-architecture/decisions/ADR-005-genai-in-core.md), [plan](../plans/agents-genai-gateway.md), [FR-account](./FR-account.md), [NFR-privacy](../quality/NFR-privacy.md)

## Summary

Optional GenAI for titles/captions remains website-orchestrated (BYOK / Vertex). **Notebook Judge** (competition rubrics) is a **Python LangGraph server job** (`type: judge` → `services/judge`, [ADR-007](../../02-architecture/decisions/ADR-007-python-langgraph-judge.md)) with two phases: **normalize** (upload/extract or edit a criteria × levels matrix) and **score** (tool-backed evidence gather + judgment with highlighted matrix; entry UUIDs in feedback become UI links). Many rubrics and past grades per notebook. Judge LLM: **BYOK** (Settings) or **Vertex** (platform grant). Local/Ollama is not supported for Judge. Legacy overflow “Run audit” may remain until fully replaced by the Judge tab.

## Actors and permissions

- GenAI titles/captions: any user with keys/settings locally
- Judge tab: notebook access; LLM configured on the judge worker
- Legacy Vertex `/ai/complete`: grant-gated

## User-facing behavior

- Entry title GenerateButton; ImageNodeView GenAI when src resolved
- **Judge** notebook tab: rubric library (upload/extract PDF or custom matrix in a dialog) separate from Run judge; past runs list with score matrix highlighting + feedback
- Overflow Audit history (legacy scorecards) may still list older runs

## Acceptance criteria

- [x] Website routes `local` | `byok` | `vertex` for titles (not required for Judge tab)
- [x] Judge: normalize (`phase=normalize`) and score (`phase=score`) are separate; many rubrics per notebook; editable `RubricMatrix`
- [x] Standard matrix display: Criteria × Level columns (points) × Total; results highlight awarded cells
- [x] Judge uses Python LangGraph worker + SSE `job.*` (BusyTeX/local-model judge not used)
- [x] Score phase tools: `list_entries`, `search_entries`, `read_entry` via Core snapshot/storage
- [x] Judge LLM is BYOK or Vertex only (no local/Ollama)
- [x] Tool/ACL: worker pulls notebook via Core internal APIs
- [x] Past grades listable via `GET …/judgments` with UI history list
- [x] Past audits listable via `GET …/audits` (legacy)

## Data and APIs

Canonical contracts: [api-contracts.md](../../03-reference/api-contracts.md).

- Core: Vertex `POST /ai/complete`; `…/audits` POST/PATCH/GET; entry reads for tools
- Website: judge loop; `/api/genai*` for BYOK CORS only

## Non-goals

- Storing API keys in Firestore; training on user notebooks without consent
