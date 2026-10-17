# Core API

Fastify service: Firebase `AuthPort`, nested org/notebook tenancy, admin metrics, GCS-backed assets, BusyTeX, rubric **audits**, Vertex-only `POST /ai/complete`.

- Contracts: [docs/03-reference/api-contracts.md](../../docs/03-reference/api-contracts.md)
- Local testing: [docs/04-guides/local-development.md](../../docs/04-guides/local-development.md)
- Architecture: [docs/02-architecture/overview.md](../../docs/02-architecture/overview.md)

## Run (with emulators)

Prefer Compose from `infra/`. Bare metal:

```bash
cd ../../packages/shared && npm install && npm run build
cd ../../services/core
# set FIRESTORE_EMULATOR_HOST, AUTH_FALLBACK=true, STORAGE_BACKEND=memory — see local-development.md
npm install && npm run dev
```

Port **8080**. Health: `GET /health`.
