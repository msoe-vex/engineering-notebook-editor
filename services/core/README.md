# Core API

Fastify service: Firebase `AuthPort`, nested org/notebook tenancy, admin metrics, GCS-backed assets, BusyTeX static routes.

- Contracts: [docs/api-contracts.md](../../docs/api-contracts.md)
- Local testing: [docs/local-development.md](../../docs/local-development.md)
- Architecture: [docs/microservices-architecture.md](../../docs/microservices-architecture.md)

## Run (with emulators)

Prefer Compose from `infra/`. Bare metal:

```bash
cd ../../packages/shared && npm install && npm run build
cd ../../services/core
# set FIRESTORE_EMULATOR_HOST, AUTH_FALLBACK=true, STORAGE_BACKEND=memory — see local-development.md
npm install && npm run dev
```

Port **8080**. Health: `GET /health`.
