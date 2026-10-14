# Engineering Notebook Editor

Cloud-native engineering notebook platform: Next.js UI, Core API, real-time collab, and AI rubric agents — deployable to Google Cloud Run, testable locally with Docker Compose.

**Primary product path:** Firebase auth → Organizations → Notebooks → collaborative editor (`/cloud`).  
**Alternative path:** classic Home UI with local folder, temporary workspace, or GitHub OAuth + ZIP (no Core required).

---

## Documentation map

| Doc | What it’s for |
| --- | --- |
| **[docs/local-development.md](docs/local-development.md)** | **How to test locally** (Compose, website-only, services without Docker, smoke checklist) |
| [docs/microservices-architecture.md](docs/microservices-architecture.md) | Service boundaries, data stores, tenancy |
| [docs/api-contracts.md](docs/api-contracts.md) | REST / WSS routes and Firestore path layout |
| [website/README.md](website/README.md) | Frontend env vars, BusyTeX, Cloud Run image notes |
| [services/core/README.md](services/core/README.md) | Core API |
| [services/collab/README.md](services/collab/README.md) | Hocuspocus / Yjs collab |
| [services/agents/README.md](services/agents/README.md) | Rubric audit / BYOK / Vertex |
| [notebook/README.md](notebook/README.md) | LaTeX template submodule |
| [infra/cloudrun/deploy.sh](infra/cloudrun/deploy.sh) | Production Cloud Run deploy |
| [infra/docker-compose.yml](infra/docker-compose.yml) | Local full stack |

---

## Repository layout

```
engineering-notebook-editor/
  website/                 # Next.js — Home (local/GitHub) + /cloud
  services/core/           # Auth, orgs, notebooks, entries, assets, admin, BusyTeX routes
  services/collab/         # Hocuspocus / Yjs WebSocket
  services/agents/         # Rubric audits (BYOK + grant-gated Vertex)
  packages/shared/         # v5 types, nested path helpers, ZIP migrate
  infra/                   # docker-compose, Firebase emulator config, Cloud Run, upload scripts
  loadtest/                # k6 smoke
  notebook/                # LaTeX template sources
  docs/                    # Architecture + local testing + API contracts
```

---

## How to test locally (quick start)

### Recommended: full stack with Docker

```bash
cd infra
docker compose up --build
```

Then:

1. Open **http://localhost:3000/cloud**
2. Sign in with **Continue with dev token** → `service-admin`
3. Create an **Organization** → **Notebook** → **New entry** and type in the editor
4. Optional: open **Admin** (service admin only) for users / grants / metrics

| Port | Service |
| --- | --- |
| 3000 | Website (`/` classic editor, `/cloud` orgs) |
| 8080 | Core API |
| 1234 | Collab WebSocket |
| 8000 | Agents |
| 4000 | Firebase Emulator UI |
| 4443 | fake-gcs |

**Step-by-step smoke tests, curl examples, and non-Docker setups:** see **[docs/local-development.md](docs/local-development.md)**.

### Website only (no backends)

```bash
cd website
npm install
npm run download:busytex      # for PDF compile
npm run bundle:template
npm run dev
```

- Classic editor: http://localhost:3000  
- `/cloud` needs Core (use Compose above)

```bash
npm run lint && npm test && npm run build
```

### Load test

```bash
# with Compose stack running
k6 run loadtest/k6-smoke.js
```

---

## Modes at a glance

| Mode | Auth | Persistence | Start |
| --- | --- | --- | --- |
| **Cloud (primary)** | Firebase or compose **dev token** | Firestore + GCS via Core/Collab | `infra/docker compose up` → `/cloud` |
| **Local / temporary** | None | Browser FS / memory + ZIP | `website` `npm run dev` |
| **GitHub (alternative)** | GitHub OAuth | Repo files + ZIP | `website` + `.env.local` OAuth vars |

GitHub OAuth remains supported as a secondary workflow; new multi-user collaboration belongs on `/cloud`.

---

## Environment variables

### Website (`website/.env.local`)

```bash
# Cloud (Compose already injects these in Docker)
NEXT_PUBLIC_CORE_API_URL=http://localhost:8080
NEXT_PUBLIC_AGENTS_API_URL=http://localhost:8000
NEXT_PUBLIC_COLLAB_WS_URL=ws://localhost:1234
NEXT_PUBLIC_ASSETS_BASE_URL=http://localhost:8080
NEXT_PUBLIC_FIREBASE_API_KEY=demo-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-engineering-notebook.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-engineering-notebook
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true
NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=localhost:9099

# Optional — GitHub alternative on Home
NEXT_PUBLIC_GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

### Backend (Compose sets these; for bare-metal see [local-development.md](docs/local-development.md))

| Variable | Purpose |
| --- | --- |
| `FIREBASE_PROJECT_ID` | Firebase / GCP project |
| `FIRESTORE_EMULATOR_HOST` | e.g. `firebase:8081` or `127.0.0.1:8081` |
| `FIREBASE_AUTH_EMULATOR_HOST` | e.g. `firebase:9099` |
| `AUTH_FALLBACK` | `true` locally → bearer token = uid |
| `STORAGE_BACKEND` | `memory` in Compose Core; omit for real GCS |
| `GCS_BUCKET` / `STORAGE_EMULATOR_HOST` | Object storage |
| `SERVICE_ADMIN_UID` | Bootstrap Service Administrator (`service-admin` in Compose) |
| `INTERNAL_SERVICE_SECRET` | Core ↔ Collab flush auth |
| `COLLAB_AUTH_DISABLED` | `true` only for local smoke |
| `VERTEX_STUB` | `true` locally for Agents without Vertex credentials |

---

## Data model (nested)

```
users/{uid}
organizations/{orgId}
organizations/{orgId}/members/{uid}
organizations/{orgId}/notebooks/{notebookId}          # folders, team, phases
organizations/{orgId}/notebooks/{notebookId}/entries/{entryId}   # metadata + GCS pointers
organizations/{orgId}/notebooks/{notebookId}/assets/{assetId}
organizations/{orgId}/notebooks/{notebookId}/audits/{auditId}
invites/{inviteId}
```

TipTap bodies and Yjs blobs live in **GCS** (not Firestore). Collab room names include `orgId` — see [api-contracts.md](docs/api-contracts.md).

---

## Auth (local vs production)

- **Compose / local:** `AUTH_FALLBACK=true` accepts `Authorization: Bearer <uid>` (and `/cloud` “dev token”). Firebase Auth emulator is also available for email/password.
- **Production:** real Firebase ID tokens; set `AUTH_FALLBACK=false` and use ADC / service accounts on Cloud Run.

Adapter: `services/core/src/auth/firebaseAuthAdapter.ts` (`AuthPort`).

---

## Cloud Run deployment

```bash
export PROJECT_ID=your-gcp-project
export GCS_BUCKET=${PROJECT_ID}-notebook
bash infra/cloudrun/deploy.sh
```

Builds all four images from repo root ([`infra/cloudrun/cloudbuild.yaml`](infra/cloudrun/cloudbuild.yaml)) so `packages/shared` is included, then deploys Core, Collab (HTTP/2 + session affinity), Agents, and Website with env wiring.

Seed the first admin with `SERVICE_ADMIN_UID=<firebase-uid>`.

---

## BusyTeX / LaTeX assets

```bash
cd website
npm run download:busytex
npm run bundle:template

# upload to GCS for production
GCS_BUCKET=your-bucket ASSETS_APP_VERSION=latest npx tsx infra/scripts/upload-busytex-assets.ts
```

- **Local website-only:** files under `website/public/busytex` and `public/latex`
- **Compose / prod:** `NEXT_PUBLIC_ASSETS_BASE_URL` → Core `/static/busytex/*` and `/static/latex/*`

Compile stays **in-browser** (BusyTeX WASM); only hosting of binaries moved off GitHub Releases.

---

## CI & git hooks

- PRs: [`.github/workflows/verify.yml`](.github/workflows/verify.yml) — shared package, website lint/test/build, service typechecks
- Optional local hooks (lint/test/build before push):

```bash
git config core.hooksPath .githooks
```

---

## GitHub OAuth app (alternative Home flow only)

If you use the Home → GitHub Repository path:

- Homepage / callback URL: your deployed site origin (same URL for both is fine)
- Env: `NEXT_PUBLIC_GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` on the website service

Cloud collaboration does **not** require GitHub.
