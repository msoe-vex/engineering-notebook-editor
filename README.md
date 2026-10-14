# Engineering Notebook Editor

Cloud-native engineering notebook: **Firebase Auth**, **Firestore + GCS** storage, and **Hocuspocus/Yjs** realtime collaboration on Google Cloud Run.

There is **one live storage path** (GCP). GitHub / local FS / S3 are **not** sync backends. Portable backup is **ZIP download/upload** (last-write-wins on import). Optional LWW push/pull adapters can be added later once cloud is hardened.

---

## Documentation map

| Doc | Purpose |
| --- | --- |
| **[docs/local-development.md](docs/local-development.md)** | How to test locally (Compose, smoke checklist, curl) |
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

---

## Repository layout

```
website/           # Next.js — / and /cloud → cloud UI
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

### Full stack (recommended)

```bash
cd infra
docker compose up --build
```

1. Open **http://localhost:3000** (redirects to `/cloud`)
2. **Continue with dev token** → `service-admin`
3. Create **Organization** → **Notebook** → **New entry**
4. Optional: **Export ZIP** / **Import ZIP**, **Admin**, rubric audit

| Port | Service |
| --- | --- |
| 3000 | Website |
| 8080 | Core |
| 1234 | Collab WSS |
| 8000 | Agents |
| 4000 | Firebase Emulator UI |
| 4443 | fake-gcs |

Details, curl, and bare-metal service runs: **[docs/local-development.md](docs/local-development.md)**.

```bash
k6 run loadtest/k6-smoke.js   # with stack up
```

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
NEXT_PUBLIC_FIREBASE_API_KEY=demo-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-engineering-notebook.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-engineering-notebook
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true
NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
```

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
