# ADR-005: GenAI tools + Vertex proxy live in Core (no separate Agents service)

Status: accepted  
Date: 2026-10

## Context

After [ADR-004](./ADR-004-agents-genai-gateway.md), the product GenAI **judge loop runs in the website**. The remaining server duties are ACL’d notebook reads (tools), audit scorecard CRUD, and a grant-gated Vertex inference proxy. That is the same auth, tenancy, Firestore, and GCS stack **Core already owns**. A fourth process (`services/agents`) adds deploy surface without a distinct scaling or trust boundary the class/product needs today.

## Decision

1. **Fold Agents capabilities into Core** (audits, AI tools helpers, platform inference). Match Core’s existing path style — **no `/v1/` prefix** (that was Agents-only; Core uses `/orgs/...`, `/users/me`, `/health`, `/internal/...`).
2. **`POST /ai/complete` is Vertex-only** (grant-gated; platform credentials stay on Core).  
   **BYOK and local never hit Core for inference** — the browser talks to the provider (or to website `/api/genai` only if CORS blocks a direct browser→provider call). Same orchestration path; different inference hop. Contract: [api-contracts.md](../../03-reference/api-contracts.md).
3. **Audits** on Core: `/orgs/:orgId/notebooks/:notebookId/audits`. Create a run early (`status: running`), **PATCH** progress/steps as the browser judge advances, final PATCH/POST with the scorecard (`status: completed` | `failed`). Clients that need live UI can poll `GET …/audits/:auditId` (or rely on local state); do not block on one long request.
4. **Next.js routes:** keep `/api/genai*` only as a BYOK CORS BFF if needed; delete `/api/agents/audit`.
5. **Target runtime:** website + Core + Collab only; retire `services/agents`.
6. **Website** orchestrates GenAI/judge loops; Core does not run the product judge loop.
7. Keep [ADR-004](./ADR-004-agents-genai-gateway.md) orchestration rules; server home is Core.

## Consequences

- One ACL implementation for entries and AI tools; audits sit next to other notebook subcollections.
- Vertex SA / longer timeouts can still be env-scoped on the Core Cloud Run service (or a later split if infer load demands it).
- Migration: point `NEXT_PUBLIC_*` / `cloudApi` from Agents base URL to Core; delete Agents when unused.
- Plan: [agents-genai-gateway.md](../../01-requirements/plans/agents-genai-gateway.md) (rename conceptually to Core GenAI; file keeps history).

## Alternatives considered

- **Keep Agents as a thin AI service** — rejected for now; tools/audits/infer are Core-shaped. Revisit only if Vertex infer needs separate scaling, blast radius, or a different IAM identity than Core.
- **Website talks to Firestore/GCS for tools** — rejected; ACL and signed reads stay on Core.
