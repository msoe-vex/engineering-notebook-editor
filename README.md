# Engineering Notebook Editor

Cloud-native engineering notebook: **Firebase Auth**, **Firestore + GCS** storage, and **Hocuspocus/Yjs** realtime collaboration on Google Cloud Run.

There is **one live storage path** (GCP). GitHub / local FS / S3 are **not** sync backends. Portable backup is **ZIP download/upload** (last-write-wins on import). Optional LWW push/pull adapters can be added later once cloud is hardened.

---

## Documentation map

| Doc | Purpose |
| --- | --- |
| **[docs/local-development.md](docs/local-development.md)** | Local stack: Docker APIs + host website, Firebase emulator |
| [docs/microservices-architecture.md](docs/microservices-architecture.md) | Service boundaries and data stores |
| [docs/api-contracts.md](docs/api-contracts.md) | REST / WSS routes and Firestore paths |
| [website/README.md](website/README.md) | Frontend env and Cloud Run image notes |
| [website/LEGACY.md](website/LEGACY.md) | Unreachable old Home/GitHub/local editor code |
| [services/core/README.md](services/core/README.md) | Core API |
| [services/collab/README.md](services/collab/README.md) | Realtime collab |
| [services/agents/README.md](services/agents/README.md) | Rubric audits |
| [notebook/README.md](notebook/README.md) | LaTeX template submodule |
| [infra/cloudrun/deploy.sh](infra/cloudrun/deploy.sh) | Production deploy |
| [infra/docker-compose.yml](infra/docker-compose.yml) | Local full stack |
| [infra/docker-compose.dev.yml](infra/docker-compose.dev.yml) | Hot-reload overlay (`tsx watch` for APIs) |

---

## Repository layout

```
website/           # Next.js — cloud UI at /
services/core/     # Auth, orgs, notebooks, entries, assets, admin, BusyTeX
services/collab/   # Hocuspocus / Yjs
services/agents/   # Rubric audits (BYOK + grant-gated Vertex)
packages/shared/   # v5 types, nested paths, ZIP migrate
infra/             # compose, emulators, Cloud Run, BusyTeX upload
docs/              # architecture + local testing + API
loadtest/          # k6 smoke
notebook/          # LaTeX templates
```

---

## How to test locally

APIs in Docker (watch) + website on the host. Full steps: **[docs/local-development.md](docs/local-development.md)**.

```bash
# Terminal 1
cd infra
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build firebase gcs core collab agents

# Terminal 2
cd website && npm install && npm run dev
```

1. Open **http://localhost:3000**
2. Dev token `service-admin` (or email via Auth emulator)
3. Create org → notebook → entry
4. Firebase Emulator UI: **http://localhost:4000**

| Port | Service |
| --- | --- |
| 3000 | Website (host) |
| 8080 | Core |
| 1234 | Collab WSS |
| 8000 | Agents |
| 4000 | Firebase Emulator UI |
| 4443 | fake-gcs |

### Website unit checks

```bash
cd website
npm install
npm run lint && npm test && npm run build
```

---

## Product model

| Concern | Choice |
| --- | --- |
| Auth | Firebase (emulator or prod); local **dev token** = bearer uid |
| Metadata | Firestore `organizations/{orgId}/notebooks/...` |
| Bodies / assets | GCS |
| Live edits | Hocuspocus room `org:{orgId}:notebook:{notebookId}:entry:{entryId}` |
| Backup | ZIP v5 export/import (LWW) |
| Not in scope | GitHub/S3/local FS as live sync |

---

## Environment variables

Compose sets these for containers. For a local `website` against Compose APIs, use `website/.env.local`:

```bash
NEXT_PUBLIC_CORE_API_URL=http://localhost:8080
NEXT_PUBLIC_AGENTS_API_URL=http://localhost:8000
NEXT_PUBLIC_COLLAB_WS_URL=ws://localhost:1234
NEXT_PUBLIC_ASSETS_BASE_URL=http://localhost:8080
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDocOrLocalEmulatorKey00000000000
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-engineering-notebook.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-engineering-notebook
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true
NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
```

Or `cp website/.env.example website/.env.local`.

Backend highlights: `AUTH_FALLBACK=true`, `FIRESTORE_EMULATOR_HOST`, `STORAGE_BACKEND=memory`, `SERVICE_ADMIN_UID=service-admin`, `COLLAB_AUTH_DISABLED=true` (local smoke only). See [local-development.md](docs/local-development.md).

---

## Cloud Run

```bash
export PROJECT_ID=your-gcp-project
export GCS_BUCKET=${PROJECT_ID}-notebook
bash infra/cloudrun/deploy.sh
```

Set `AUTH_FALLBACK=false` and `SERVICE_ADMIN_UID=<firebase-uid>` in production.

---

## BusyTeX assets

```bash
cd website && npm run download:busytex && npm run bundle:template
GCS_BUCKET=your-bucket ASSETS_APP_VERSION=latest npx tsx infra/scripts/upload-busytex-assets.ts
```

Local: `website/public/…`. Compose/prod: `NEXT_PUBLIC_ASSETS_BASE_URL` → Core `/static/busytex/*`.

---

## CI

[`.github/workflows/verify.yml`](.github/workflows/verify.yml) — shared build, website lint/test/build, service typechecks.

```bash
git config core.hooksPath .githooks   # optional
```
