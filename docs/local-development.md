# Local development & testing

Two ways to run the stack. **Docker Compose is the recommended path** for cloud features (orgs, notebooks, collab, agents). Website-only is fine for the classic editor / ZIP / GitHub OAuth flow.

## Prerequisites

| Tool | Used for |
| --- | --- |
| Node.js 20+ | website + services when not using Docker |
| Docker Desktop | full stack via Compose |
| (optional) k6 | smoke load test |
| (optional) Firebase CLI | emulators outside Compose |

---

## Option A — Full stack (recommended)

Starts website, Core, Collab, Agents, Firebase Auth + Firestore emulators, and fake-gcs.

```bash
cd infra
docker compose up --build
```

First boot can take several minutes (Firebase image installs OpenJDK + `firebase-tools`).

### Endpoints

| Service | URL |
| --- | --- |
| Website | http://localhost:3000 |
| Cloud UI | http://localhost:3000/cloud |
| Core API | http://localhost:8080 |
| Collab WebSocket | ws://localhost:1234 |
| Agents API | http://localhost:8000 |
| Firebase Emulator UI | http://localhost:4000 |
| Auth emulator | localhost:9099 |
| Firestore emulator | localhost:8081 |
| fake-gcs | http://localhost:4443 |

### Cloud UI smoke checklist

1. Open http://localhost:3000/cloud
2. **Continue with dev token** → enter `service-admin` (Service Administrator) or any uid (e.g. `alice`)
3. **Create organization** → open it
4. **Create notebook** → open workspace
5. **New entry** → type in the collaborative editor (status should move past `connecting`)
6. Optional: **Run rubric audit** (BYOK heuristic runs without a real API key)
7. As `service-admin`, open **Admin** → users / metrics / toggle `platformAi`

### API smoke (curl / PowerShell)

```bash
# Health
curl http://localhost:8080/health
curl http://localhost:8000/health

# Dev auth: bearer token is the uid (AUTH_FALLBACK=true in compose)
curl -H "Authorization: Bearer service-admin" http://localhost:8080/auth/session
curl -H "Authorization: Bearer service-admin" -H "Content-Type: application/json" \
  -d "{}" -X POST http://localhost:8080/users/me/bootstrap
curl -H "Authorization: Bearer service-admin" -H "Content-Type: application/json" \
  -d "{\"name\":\"Demo Org\"}" -X POST http://localhost:8080/orgs
```

### Load test

With the stack up:

```bash
k6 run loadtest/k6-smoke.js
```

---

## Option B — Website only (classic editor)

No Core/Collab/Agents. Home page supports local folder, temporary workspace, and optional GitHub OAuth.

```bash
cd website
npm install
npm run download:busytex    # needed for PDF compile
npm run bundle:template     # needed for template + latex packages
npm run dev
```

Open http://localhost:3000.

### Website checks

```bash
cd website
npm run lint
npm test
npm run build
```

### GitHub OAuth (optional alternative)

Create `website/.env.local`:

```bash
NEXT_PUBLIC_GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

See [website/README.md](../website/README.md). This path is **secondary** to `/cloud`; cloud auth is Firebase (or the compose dev token).

---

## Option C — Services without Docker

Useful when iterating on one API. You still need Firestore (emulator) for org/notebook CRUD.

```bash
# terminal 1 — from infra/
firebase emulators:start --project demo-engineering-notebook --only auth,firestore

# terminal 2 — shared types
cd packages/shared && npm install && npm run build

# terminal 3 — core
cd services/core
export FIREBASE_PROJECT_ID=demo-engineering-notebook
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8081
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
export AUTH_FALLBACK=true
export STORAGE_BACKEND=memory
export SERVICE_ADMIN_UID=service-admin
npm install && npm run dev

# terminal 4 — collab
cd services/collab
export COLLAB_AUTH_DISABLED=true
export CORE_API_URL=http://127.0.0.1:8080
export AUTH_FALLBACK=true
npm install && npm run dev

# terminal 5 — agents
cd services/agents
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8081
export AUTH_FALLBACK=true
export VERTEX_STUB=true
npm install && npm run dev

# terminal 6 — website pointing at local APIs
cd website
export NEXT_PUBLIC_CORE_API_URL=http://localhost:8080
export NEXT_PUBLIC_AGENTS_API_URL=http://localhost:8000
export NEXT_PUBLIC_COLLAB_WS_URL=ws://localhost:1234
export NEXT_PUBLIC_ASSETS_BASE_URL=http://localhost:8080
npm run dev
```

On Windows PowerShell, use `$env:NAME="value"` instead of `export`.

Without `FIRESTORE_EMULATOR_HOST`, Core still serves `/health` and auth fallback, but org/notebook writes will fail or hang talking to real GCP.

---

## Auth modes (local)

| Mode | When | How |
| --- | --- | --- |
| Dev bearer token | Compose / `AUTH_FALLBACK=true` | `Authorization: Bearer <uid>` or `/cloud` “dev token” |
| Firebase emulator | Compose Auth emulator or Option C | Email/password on `/cloud` with `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` |
| Production Firebase | Cloud Run | Real ID tokens; `AUTH_FALLBACK=false` |

`service-admin` (or `SERVICE_ADMIN_UID`) bootstraps **Service Administrator** for the Admin UI.

---

## BusyTeX / LaTeX assets

| Environment | Source |
| --- | --- |
| Website-only | `website/public/busytex` + `public/latex` after download/bundle scripts |
| Compose / cloud | `NEXT_PUBLIC_ASSETS_BASE_URL` → Core `/static/busytex/*` and `/static/latex/*` (GCS or memory store) |

Upload to a real bucket: see root README “Release workflow” and `infra/scripts/upload-busytex-assets.ts`.

---

## Nested data model (quick)

```
organizations/{orgId}/members/{uid}
organizations/{orgId}/notebooks/{notebookId}
organizations/{orgId}/notebooks/{notebookId}/entries/{entryId}   # metadata only
organizations/{orgId}/notebooks/{notebookId}/assets/{assetId}
organizations/{orgId}/notebooks/{notebookId}/audits/{auditId}
users/{uid}    invites/{inviteId}
```

Collab rooms: `org:{orgId}:notebook:{notebookId}:entry:{entryId}`

More detail: [api-contracts.md](./api-contracts.md), [microservices-architecture.md](./microservices-architecture.md).
