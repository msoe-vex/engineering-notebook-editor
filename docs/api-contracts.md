# API Contracts (Initial)

## Core (`website`)

- `GET /api/admin/metrics` (planned): Admin-only telemetry aggregation endpoint.

## Collaboration (`server`)

- `WSS /` (Hocuspocus)
  - Auth token header: `Authorization: ******` (or disabled in local dev)
  - Payloads: Yjs update frames handled by Hocuspocus/Y-protocol.

## Judge (`judge`)

- `GET /health`
  - Response: `{ "status": "ok" }`

- `POST /judge/evaluate`
  - Request:
    ```json
    {
      "project_id": "project-123",
      "rubric": "REC Foundation Design Award",
      "entry_ids": ["entry-1", "entry-2"]
    }
    ```
  - Response:
    ```json
    {
      "projectId": "project-123",
      "rubric": "REC Foundation Design Award",
      "summary": "Stub rubric audit response. Connect this endpoint to your LLM provider for full scoring.",
      "scores": {
        "design_cycle_completeness": 0,
        "chronological_consistency": 0,
        "test_repeatability": 0
      },
      "advice": [
        {
          "entryId": "entry-1",
          "message": "Add evidence of iteration and measurable test outcomes."
        }
      ]
    }
    ```
