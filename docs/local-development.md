# Local development & testing

**Product path:** GCP-only live storage (Firestore + GCS) and Hocuspocus realtime.  
`/` redirects to `/cloud`. ZIP export/import is backup only (last-write-wins).

## Prerequisites

| Tool | Used for |
| --- | --- |
| Node.js 20+ | website / services outside Docker |
| Docker Desktop | full stack via Compose |
| (optional) k6 | smoke load test |

---

## Full stack (recommended)

```bash
cd infra
docker compose up --build
```

First boot can take several minutes (Firebase emulator image installs JDK + tools).

### Endpoints

| Service | URL |
| --- | --- |
| Website (→ `/cloud`) | http://localhost:3000 |
| Core API | http://localhost:8080 |
| Collab WebSocket | ws://localhost:1234 |
| Agents API | http://localhost:8000 |
| Firebase Emulator UI | http://localhost:4000 |
| fake-gcs | http://localhost:4443 |

### Smoke checklist

1. Open http://localhost:3000 → lands on `/cloud`
2. **Continue with dev token** → `service-admin` (or any uid)
3. Create organization → notebook → **New entry** → type in the editor
4. **Export ZIP** / **Import ZIP** (optional)
5. As `service-admin`, open **Admin** → metrics / grants

### API smoke

```bash
curl http://localhost:8080/health
curl http://localhost:8000/health
curl -H "Authorization: Bearer service-admin" http://localhost:8080/auth/session
curl -H "Authorization: Bearer service-admin" -H "Content-Type: application/json" \
  -d "{}" -X POST http://localhost:8080/users/me/bootstrap
curl -H "Authorization: Bearer service-admin" -H "Content-Type: application/json" \
  -d "{\"name\":\"Demo Org\"}" -X POST http://localhost:8080/orgs
```

### Load test

```bash
k6 run loadtest/k6-smoke.js
```

---

## Website checks only

```bash
cd website
npm install
npm run lint
npm test
npm run build
```

BusyTeX compile assets (optional): `npm run download:busytex && npm run bundle:template`.

---

## Services without Docker

You need the Firestore emulator for org/notebook CRUD.

```bash
# infra/: firebase emulators:start --project demo-engineering-notebook --only auth,firestore
# packages/shared: npm install && npm run build
# services/core with FIRESTORE_EMULATOR_HOST, AUTH_FALLBACK=true, STORAGE_BACKEND=memory
# services/collab with COLLAB_AUTH_DISABLED=true, CORE_API_URL=http://127.0.0.1:8080
# services/agents with AUTH_FALLBACK=true, VERTEX_STUB=true
# website with NEXT_PUBLIC_* pointing at localhost ports
```

On Windows PowerShell use `$env:NAME="value"`. Full env table: root [README.md](../README.md).

Without `FIRESTORE_EMULATOR_HOST`, Core `/health` works but org writes will not.

---

## Auth modes

| Mode | How |
| --- | --- |
| Dev bearer | Compose `AUTH_FALLBACK=true` → `Authorization: Bearer <uid>` or `/cloud` “dev token” |
| Firebase emulator | Email/password on `/cloud` when emulator env is set |
| Production | Real Firebase ID tokens; `AUTH_FALLBACK=false` |

`service-admin` / `SERVICE_ADMIN_UID` → Service Administrator.

---

## Data model

```
organizations/{orgId}/members/{uid}
organizations/{orgId}/notebooks/{notebookId}
organizations/{orgId}/notebooks/{notebookId}/entries/{entryId}
organizations/{orgId}/notebooks/{notebookId}/assets/{assetId}
organizations/{orgId}/notebooks/{notebookId}/audits/{auditId}
users/{uid}   invites/{inviteId}
```

Collab: `org:{orgId}:notebook:{notebookId}:entry:{entryId}`

See [api-contracts.md](./api-contracts.md).
