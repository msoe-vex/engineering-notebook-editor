# Engineering Notebook Editor

Cloud-native engineering notebook: **Firebase Auth**, **Firestore + GCS** storage, and **Hocuspocus/Yjs** realtime collaboration on Google Cloud Run.

There is **one live storage path** (GCP). GitHub / local FS / S3 are **not** sync backends. Portable backup is **ZIP download/upload** (last-write-wins on import). Optional LWW push/pull adapters can be added later once cloud is hardened.

---

## Documentation map

Full index (by audience): **[docs/README.md](docs/README.md)** · Agent steerage: **[AGENTS.md](AGENTS.md)**

| Doc | Purpose |
| --- | --- |
| **[docs/04-guides/local-development.md](docs/04-guides/local-development.md)** | Local stack: Docker APIs + host website, Firebase emulator |
| [docs/00-product/vision.md](docs/00-product/vision.md) | Product vision & non-goals |
| [docs/01-requirements/](docs/01-requirements/) | Features (FR-\*) & quality (NFR-\*) |
| [docs/02-architecture/overview.md](docs/02-architecture/overview.md) | Service boundaries and data stores |
| [docs/03-reference/api-contracts.md](docs/03-reference/api-contracts.md) | REST / WSS routes |
| [docs/03-reference/schema.md](docs/03-reference/schema.md) | Firestore / GCS model |
| [website/README.md](website/README.md) | Frontend env and Cloud Run image notes |
| [website/LEGACY.md](website/LEGACY.md) | Legacy archive pointer |
| [services/core/README.md](services/core/README.md) | Core API |
| [services/collab/README.md](services/collab/README.md) | Realtime collab |
| [notebook/README.md](notebook/README.md) | LaTeX template submodule |
| [infra/cloudrun/deploy.sh](infra/cloudrun/deploy.sh) | Production deploy |
| [infra/docker-compose.yml](infra/docker-compose.yml) | Local full stack |
| [infra/docker-compose.dev.yml](infra/docker-compose.dev.yml) | Hot-reload overlay (`tsx watch` for APIs) |

---

## Repository layout

```
website/           # Next.js — cloud UI at /  (+ archive/legacy/ for old shell)
services/core/     # Auth, orgs, notebooks, entries, assets, audits, Vertex /ai/complete, BusyTeX
services/collab/   # Hocuspocus / Yjs
packages/shared/   # v5 types, nested paths, ZIP migrate
infra/             # compose, emulators, Cloud Run, BusyTeX upload
docs/              # product · FR/NFR · architecture · reference · guides · ops
loadtest/          # k6 smoke
notebook/          # LaTeX templates
```

---

## How to test locally

APIs in Docker (watch) + website on the host. Full steps: **[docs/04-guides/local-development.md](docs/04-guides/local-development.md)**.

```bash
# Terminal 1
cd infra
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build firebase gcs core collab

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
NEXT_PUBLIC_COLLAB_WS_URL=ws://localhost:1234
NEXT_PUBLIC_ASSETS_BASE_URL=http://localhost:8080
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDocOrLocalEmulatorKey00000000000
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-engineering-notebook.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-engineering-notebook
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true
NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
```

Or `cp website/.env.example website/.env.local`.

Backend highlights: `AUTH_FALLBACK=true`, `FIRESTORE_EMULATOR_HOST`, `STORAGE_BACKEND=memory`, `SERVICE_ADMIN_UID=service-admin`, `COLLAB_AUTH_DISABLED=true` (local smoke only). See [local-development.md](docs/04-guides/local-development.md).

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

No host TeX install required for in-browser compile.

```bash
cd website && npm run download:busytex && npm run bundle:template
# optional: harvest host .sty files into public/latex (needs XeLaTeX on PATH)
# BUNDLE_HOST_LATEX=1 npm run bundle:template
GCS_BUCKET=your-bucket ASSETS_APP_VERSION=latest npx tsx infra/scripts/upload-busytex-assets.ts
```

- `download:busytex` → WASM engine + TeX Live packages (`public/busytex`, gitignored)
- `bundle:template` → `notebook.sty`, fonts, template into `public/notebook-template`
- Local: `website/public/…`. Compose/prod: `NEXT_PUBLIC_ASSETS_BASE_URL` → Core `/static/busytex/*`.

---

## CI

[`.github/workflows/verify.yml`](.github/workflows/verify.yml) — shared build, website lint/test/build, service typechecks.

```bash
git config core.hooksPath .githooks   # optional
```
