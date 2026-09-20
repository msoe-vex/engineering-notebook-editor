# Microservices Architecture

This repository now supports a Cloud Run-style microservice topology:

- `website/` (Core Gateway + Next.js frontend)
- `server/` (Hocuspocus/Yjs collaboration service)
- `judge/` (FastAPI rubric judge service)
- `packages/shared/` (shared cross-service types)

## Local development

```bash
docker compose up --build
```

Services:

- Core: http://localhost:3000
- Collab WS: ws://localhost:1234
- Judge API: http://localhost:8000
