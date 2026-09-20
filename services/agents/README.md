# Agents Service (`services/agents/`)

Fastify microservice for AI agents and rubric-audit workflows with BYOK (Bring Your Own Key) and grant-gated platform AI routing.

*Note: `services/agents/` replaces legacy single-purpose `judge/` folders or services with a generic, multi-agent architecture.*

## Endpoints

- `GET /health` - Service health check
- `POST /v1/notebooks/:notebookId/audit` - Submit notebook for AI agent rubric evaluation

## Local Development & Running

To run the agents service locally standalone:

```bash
npm install
npm run dev
```

The service will start on port `8000` (or `PORT` env var).

To test health:
```bash
curl http://localhost:8000/health
```

To test notebook evaluation audit:
```bash
curl -X POST http://localhost:8000/v1/notebooks/test-123/audit \
  -H "Content-Type: application/json" \
  -d '{"provider": "byok", "rubric": "REC Foundation Design Award"}'
```

For full multi-service testing, run via Docker Compose from repository root:
```bash
cd infra
docker compose up --build
```

## Cloud Run Deployment

Deploy as an isolated Google Cloud Run container service:

```bash
gcloud builds submit . --tag gcr.io/$PROJECT_ID/agents-service
gcloud run deploy agents-service \
  --image gcr.io/$PROJECT_ID/agents-service \
  --region us-central1 \
  --allow-unauthenticated
```
