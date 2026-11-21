# ADR-005: GenAI tools + Vertex proxy live in Core (no separate Agents service)

Status: accepted  
Date: 2026-10  
Superseded in part by: [ADR-007](./ADR-007-python-langgraph-judge.md) (notebook Judge worker; rubrics/judgments replace `/audits`)

## Context

After [ADR-004](./ADR-004-agents-genai-gateway.md), titles/captions stay browser-orchestrated. Server duties for GenAI are ACL’d notebook reads (tools for the Judge worker), grant-gated Vertex inference, and (historically) audit scorecard CRUD. That is the same auth, tenancy, Firestore, and GCS stack **Core already owns**. A fourth process (`services/agents`) added deploy surface without a distinct scaling or trust boundary.

## Decision

1. **Fold Agents capabilities into Core** (notebook tools helpers, platform inference). Match Core’s existing path style — **no `/v1/` prefix** (that was Agents-only; Core uses `/orgs/...`, `/users/me`, `/health`, `/internal/...`).
2. **`POST /ai/complete` is Vertex-only** for browser callers (grant-gated; platform credentials stay on Core).  
   **BYOK and local never hit Core for browser titles inference** — the browser talks to the provider (or to website `/api/genai` only if CORS blocks a direct browser→provider call). Judge worker uses `/internal/ai/*` (Vertex + BYOK dispatch). Contract: [api-contracts.md](../../03-reference/api-contracts.md).
3. **Rubric grades** live as `…/rubrics` and `…/judgments` (not `…/audits`). Browser audit PATCH progress is **removed**.
4. **Next.js routes:** keep `/api/genai*` only as a BYOK CORS BFF if needed; no `/api/agents/*`.
5. **Target runtime:** website + Core + Collab + job workers (compile, judge); `services/agents` deleted.
6. Keep [ADR-004](./ADR-004-agents-genai-gateway.md) for **titles/captions** orchestration; Judge is ADR-007.

## Consequences

- One ACL implementation for entries and AI tools; judgments sit next to other notebook subcollections.
- Vertex SA / longer timeouts can still be env-scoped on the Core Cloud Run service (or a later split if infer load demands it).
- Historical plan: [agents-genai-gateway.md](../../01-requirements/plans/agents-genai-gateway.md).

## Alternatives considered

- **Keep Agents as a thin AI service** — rejected for now; tools/infer are Core-shaped. Revisit only if Vertex infer needs separate scaling, blast radius, or a different IAM identity than Core.
- **Website talks to Firestore/GCS for tools** — rejected; ACL and signed reads stay on Core.
