# ADR-004: Browser-orchestrated GenAI (titles / captions)

Status: accepted (partially superseded)  
Date: 2026-10  
Superseded in part by: [ADR-005](./ADR-005-genai-in-core.md) (Vertex proxy → Core), [ADR-007](./ADR-007-python-langgraph-judge.md) (**notebook Judge is a server job**, not a browser loop)

## Context

GenAI for **titles and captions** needs three backends: **local** (Ollama / LM Studio), **BYOK**, and **platform Vertex**. Local models only exist on the user’s machine, so Cloud Run cannot drive them. Early drafts also put the rubric judge loop in the browser; that path was replaced by ADR-007.

## Decision

1. **The website runs GenAI orchestration for titles and captions.** Provider only changes where **inference** goes:
   - `local` → browser → user base URL
   - BYOK → browser → provider (or website `/api/genai` BFF if CORS requires it); keys stay ephemeral ([ADR-003](./ADR-003-byok-keys-local.md))
   - `vertex` → browser → Core **`POST /ai/complete`** only ([ADR-005](./ADR-005-genai-in-core.md))

2. **Notebook Judge is not browser-orchestrated.** Scoring and rubric normalize run as job type `judge` in `services/judge` ([ADR-007](./ADR-007-python-langgraph-judge.md)). Core stores **rubrics** and **judgments**, not an `/audits` progress collection.

3. **MCP is optional and not required.**

## Consequences

- One titles/captions path in the website; Judge lives in the Python worker.
- Closing the tab does not abort an in-flight Judge job (job + SSE).
- Historical plan file: [agents-genai-gateway.md](../../01-requirements/plans/agents-genai-gateway.md) (completed; Judge moved to ADR-007).

## Alternatives considered

- **Server runs Vertex/BYOK titles; browser only for local** — rejected for titles; two orchestration paths.
- **Browser rubric judge loop** — superseded by ADR-007 (no need for local/Ollama on Judge).
- **Browser calls Vertex with user Google identity** — deferred; use Core infer proxy.
- **Separate Agents microservice for tools/infer** — superseded by [ADR-005](./ADR-005-genai-in-core.md).
