# Judge worker (Python / LangGraph)

Server-side rubric normalize + LangGraph scoring (`job type: judge`). See [ADR-007](../../docs/02-architecture/decisions/ADR-007-python-langgraph-judge.md).

- **Runtime:** Python 3.12 + FastAPI + LangGraph (Node judge retired).
- **Phases:** `normalize` (PDF/text → matrix) and `score` (tool-backed evidence + score).
- **Tools (score):** `list_entries`, `search_entries`, `read_entry` over Core snapshot / TipTap pulls.
- **LLM:** via Core only — BYOK (`/internal/ai/byok`) or Vertex (`/internal/ai/complete`).
- Feedback cites entry UUIDs inline; UI turns them into links.

## Contract (unchanged)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/health` | `{ status, service, runtime, busy, queued }` |
| `POST` | `/jobs` | `{ jobId, type: "judge", orgId, notebookId, payload }` → `202` |

## Env

| Variable | Required | Notes |
| --- | --- | --- |
| `CORE_API_URL` | yes | e.g. `http://core:8080` |
| `INTERNAL_SERVICE_SECRET` | yes (compose) | Match Core |
| `PORT` | no | default `8091` |

## Local

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build firebase gcs core collab compile judge
```

Core: `JUDGE_SERVICE_URL=http://judge:8091`.

## Score graph

`gather_evidence` → `score_categories` → `summarize` (LangGraph). Evidence gathering calls search/read tools per criterion before batched scoring.

See [FR-genai-audit](../../docs/01-requirements/features/FR-genai-audit.md) and [ADR-006](../../docs/02-architecture/decisions/ADR-006-compile-job.md).
