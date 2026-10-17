# ADR-004: Browser-orchestrated GenAI

Status: accepted  
Date: 2026-10  
Superseded in part by: [ADR-005](./ADR-005-genai-in-core.md) (server home moves from Agents → Core)

## Context

GenAI needs three backends: **local** (Ollama / LM Studio), **BYOK**, and **platform Vertex**. Local models only exist on the user’s machine, so Cloud Run cannot drive them. The product should not maintain two different hosts for the rubric judge loop.

## Decision

1. **The website always runs GenAI orchestration** (titles, captions, multi-step rubric **judge loop**). Provider only changes where **inference** goes:
   - `local` → browser → user base URL
   - BYOK → browser → provider (or website `/api/genai` BFF if CORS requires it); keys stay ephemeral ([ADR-003](./ADR-003-byok-keys-local.md))
   - `vertex` → browser → Core **`POST /ai/complete`** only ([ADR-005](./ADR-005-genai-in-core.md))

2. **Server side is not the judge.** Core exposes notebook **tools** (entry reads), **audit** run persistence (including progress PATCHes), and **Vertex-only** `/ai/complete`.

3. **Rubric audit is tool-using and multi-request**, not one mega-prompt or one long HTTP call. Browser loop: model turn → tools → …; persist/poll audit progress on Core as needed.

4. **MCP is optional and not required.**

## Consequences

- Single judge implementation in the website.
- Closing the tab aborts an in-flight audit unless resume is added later (acceptable v1).
- Plan: [agents-genai-gateway.md](../../01-requirements/plans/agents-genai-gateway.md)

## Alternatives considered

- **Server runs Vertex/BYOK judge; browser only for local** — rejected; two orchestration paths.
- **Server runs all judges** — rejected; cannot reach user `localhost` from Cloud Run.
- **Browser calls Vertex with user Google identity** — deferred; use Core infer proxy.
- **Separate Agents microservice for tools/infer** — superseded by [ADR-005](./ADR-005-genai-in-core.md).
