# Cloud-Native Microservices Architecture

This repository is scaffolded for Cloud Run microservices using the Cursor plan service boundaries:

- `website/` — Next.js frontend container
- `services/core/` — Fastify core API (AuthPort, org/notebook APIs, admin metrics, static BusyTeX route space)
- `services/collab/` — Hocuspocus/Yjs WebSocket collaboration service
- `services/agents/` — Fastify rubric-audit agent service (BYOK + grant-gated platform AI)
- `packages/shared/` — shared role/schema contract types
- `infra/docker-compose.yml` — local multi-container orchestration
- `loadtest/` — load test scripts

## Local development

```bash
cd infra
docker compose up --build
```

Services:

- Website: http://localhost:3000
- Core API: http://localhost:8080
- Collab WS: ws://localhost:1234
- Agents API: http://localhost:8000
