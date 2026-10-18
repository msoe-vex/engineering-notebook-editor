# ADR-007: Python LangGraph judge worker

Status: accepted  
Date: 2026-10

Sequence diagrams: [normalize](../diagrams.md#sequence-judge--normalize-rubric) · [score](../diagrams.md#sequence-judge--score-notebook-langgraph).

## Context

The notebook Judge job (`type: judge`) needs real tool use: list/search/read entries while scoring a rubric, not only a one-shot prompt stuffed with entry samples. The Python ecosystem (LangGraph, pymupdf, search helpers) fits that better than extending the Node worker. Compile (XeLaTeX orchestration) and Collab (Hocuspocus/Yjs) should stay on Node/TypeScript.

## Decision

1. **`services/judge` is a Python worker** (LangGraph + tools) that preserves the existing job HTTP contract:
   - `GET /health`
   - `POST /jobs` `{ jobId, type: "judge", orgId, notebookId, payload }` → `202`
   - Same Core internal APIs (`/internal/judge/*`, `/internal/compile/snapshot`, `/internal/storage/object`, `/internal/ai/byok|complete`)
2. **Phases unchanged:** `payload.phase` = `normalize` | `score` (Core enqueue paths unchanged).
3. **LLM still via Core** — BYOK keys remain dispatch-only; Vertex via `/internal/ai/complete`. The worker does not call provider APIs with stored keys.
4. **LangGraph tools (score phase):** at least `list_entries`, `search_entries`, `read_entry` over the notebook snapshot / TipTap pulls.
5. **Compile stays Node; Collab stays Node** — no language change.
6. **Shared TypeScript types** remain the contract source for rubric/judgment JSON shapes; Python validates loosely and posts the same fields Core already expects.

## Consequences

- Compose/Cloud Run build `services/judge` with a Python base image; healthcheck uses Python/`curl`, not Node.
- Local and prod `JUDGE_SERVICE_URL` keep pointing at the same port (8091).
- Node-based judge implementation is retired (superseded by this worker).
- Future agent quality work (better retrieval, multi-step critique) lands in the Python graph without Core API changes.

## Alternatives considered

- **LangGraph.js in the existing Node worker** — viable, but weaker PDF/search ecosystem; rejected for the agentic path.
- **New `services/judge-py` beside Node judge** — rejected; one worker URL per job type, avoid dual maintenance.
- **Rewrite compile/collab in Python** — rejected; no benefit for TeX orchestration or Yjs/Hocuspocus.
