# FR-genai-judge: GenAI titles & notebook Judge

Status: current  

Related: [ADR-003](../../02-architecture/decisions/ADR-003-byok-keys-local.md), [ADR-004](../../02-architecture/decisions/ADR-004-agents-genai-gateway.md) (titles/captions orchestration), [ADR-005](../../02-architecture/decisions/ADR-005-genai-in-core.md) (Vertex in Core), [ADR-007](../../02-architecture/decisions/ADR-007-python-langgraph-judge.md) (server Judge), [FR-account](./FR-account.md), [NFR-privacy](../quality/NFR-privacy.md)

Formerly tracked as `FR-genai-audit` (browser “audit” loop retired; naming standardized on **Judge**).

## Summary

Optional GenAI for **titles/captions** remains website-orchestrated (BYOK / Vertex). **Notebook Judge** (competition rubrics) is a **Python LangGraph server job** (`type: judge` → `services/judge`, [ADR-007](../../02-architecture/decisions/ADR-007-python-langgraph-judge.md)) with two phases: **normalize** (upload/extract or edit a criteria × levels matrix) and **score** (tool-backed evidence + judgment; citations use `[[entry:<uuid>]]` markers — UI shows entry titles, never raw UUIDs). Many rubrics and past grades per notebook. Judge LLM: **BYOK** (Settings) or **Vertex** (platform grant). Local/Ollama is not supported for Judge.

## Actors and permissions

- GenAI titles/captions: any user with keys/settings locally
- Judge tab: notebook access; LLM configured via BYOK or Vertex grant
- Vertex `/ai/complete`: grant-gated

## User-facing behavior

- Entry title GenerateButton; ImageNodeView GenAI when src resolved
- **Judge** notebook tab: rubric library (upload/extract PDF or custom matrix) separate from Run judge; past grades list with score matrix highlighting + feedback

## Acceptance criteria

- [x] Website routes `local` | `byok` | `vertex` for titles (not required for Judge tab)
- [x] Judge: normalize (`phase=normalize`) and score (`phase=score`) are separate; many rubrics per notebook; editable `RubricMatrix`
- [x] Standard matrix display: Criteria × Level columns (points) × Total; results highlight awarded cells
- [x] Judge uses Python LangGraph worker + SSE `job.*`
- [x] Score phase tools: `list_entries`, `search_entries`, `read_entry` via Core snapshot/storage
- [x] Judge LLM is BYOK or Vertex only (no local/Ollama)
- [x] Worker pulls notebook via Core internal APIs
- [x] Past grades listable via `GET …/judgments`
- [x] Rubric extract / judge / compile loading toasts survive navigating away from the Judge or Compile tab (notebook-level SSE + session pending jobs)

## Data and APIs

Canonical contracts: [api-contracts.md](../../03-reference/api-contracts.md).

- Titles/captions: website orchestration + `/ai/complete` (Vertex) or BYOK BFF
- Judge: `…/rubrics`, `POST …/judge`, `…/judgments`, internal `/internal/judge/*`

## Non-goals

- Storing API keys in Firestore; training on user notebooks without consent
- Browser-orchestrated rubric scoring (“audits” collection) — removed
- Public exposure of judgments / rubrics on `/public/o/…`
