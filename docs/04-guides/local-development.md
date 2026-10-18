# Local development

API services hot-reload in Docker; the website runs on the host with Next HMR.

## Prerequisites

- **Node.js 20+** (nvm recommended) — website + IDE IntelliSense
- **Docker** — Firebase, GCS, Core, Collab, Agents

### IDE / IntelliSense

Install host deps once (services are Docker-only at runtime, but `node_modules` are needed for TypeScript in the editor):

```bash
# from repo root — workspaces (shared + core/collab) + website
npm run install:all
```

Then in Cursor/VS Code: use the workspace TypeScript version if prompted (`js/ts.tsdk.path` → root `node_modules/typescript`).

If `npm install` hits `EACCES` under `services/*/node_modules`, those dirs were created as root by Docker:

```bash
docker run --rm -v "$PWD":/repo -w /repo alpine chown -R "$(id -u):$(id -g)" services/*/node_modules
```

## Start

**Terminal 1 — backends (watch)**

```bash
cd infra
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build firebase gcs core collab compile judge
```

First boot can take a few minutes (Firebase image build installs JDK + firebase-tools once; **compile** pulls TeX Live once). Leave this running. If the firebase container exits with `ENOTEMPTY` / `Permission denied` on `/usr/local/bin/firebase`, rebuild that service: `docker compose build --no-cache firebase && docker compose up -d firebase`.

**Terminal 2 — website**

```bash
cd website
npm install
npm run dev
```

Open **http://localhost:3000**.

Sign in with **Continue with dev token** → `service-admin`, or create an email/password user (Auth emulator).

Create an organization → notebook → **New entry** (opens `/orgs/…/notebooks/…/entries/…`).

### Server compile (Compose `compile`)

Include `compile` in the backend `up` (above) — required for Compile page parity with prod. Flow: `POST …/compile` → durable job + `JobDispatchPort` → worker (`:8090`) → SSE `job.*`.

One-shot still works: `COMPILE_MODE=job docker compose run --rm -e ORG_ID=… -e NOTEBOOK_ID=… compile`.

Optional emergency only (not for large notebooks): set `NEXT_PUBLIC_ALLOW_BUSYTEX_COMPILE=1` in `website/.env.local`.

### Judge (Compose `judge`)

Include `judge` in the backend `up` (Python LangGraph image — [ADR-007](../02-architecture/decisions/ADR-007-python-langgraph-judge.md)). Open **Judge** in the notebook nav; use **BYOK** (Settings keys) or **Vertex** (platform grant). No local/Ollama path.

See [`services/judge/README.md`](../../services/judge/README.md).

See [`services/compile/README.md`](../../services/compile/README.md) and [ADR-006](../02-architecture/decisions/ADR-006-compile-job.md).

| Route | Screen |
| --- | --- |
| `/` | Organizations home |
| `/orgs/[orgId]` | Organization notebooks |
| `/orgs/[orgId]/members` | Organization members (ACL) |
| `/orgs/[orgId]/invites` | Organization invites |
| `/orgs/[orgId]/notebooks/[notebookId]` | Workspace (redirects to first entry) |
| `/orgs/[orgId]/notebooks/[notebookId]/entries/[entryId]` | Entry editor |
| `/orgs/[orgId]/notebooks/[notebookId]/team/[tab]` | Notebook team (identity / roster / phases) |
| `/orgs/[orgId]/notebooks/[notebookId]/calendar` | Calendar |
| `/account` | User account (theme, GenAI BYOK, default authors) |
| `/admin` | Service Administrator |

If port 3000 is busy, stop the Compose website container (`docker compose stop website`) or use the port Next prints (e.g. 3001).

### Website env

Copy once (or rely on code defaults in development):

```bash
cd website
cp .env.example .env.local
```

`NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` points Auth at **localhost:9099**. Without it, email sign-in hits production Firebase and fails with `auth/api-key-not-valid`.

## Endpoints

| Service | URL |
| --- | --- |
| Website | http://localhost:3000 |
| Core API | http://localhost:8080 |
| Collab WebSocket | ws://localhost:1234 |
| Firebase Emulator UI | http://localhost:4000 |
| Auth emulator | localhost:9099 |
| Firestore emulator | localhost:8081 |
| fake-gcs | http://localhost:4443 (host). Core uses `GCS_EMULATOR_ENDPOINT=http://gcs:4443` plus compose `-public-host`/`-external-url` for that Docker DNS name. Do not set `STORAGE_EMULATOR_HOST` — the Node client then omits `/storage/v1` on reads. |

## Firebase emulator

With the stack up, open **http://localhost:4000**.

| Tab | Use |
| --- | --- |
| **Authentication** | Users created via email sign-up on the site (or the UI) |
| **Firestore** | Orgs, members, notebooks, entries, users, invites |

Auth/Firestore talk to the emulators automatically (`FIRESTORE_EMULATOR_HOST` / Auth emulator host in Compose; website uses `NEXT_PUBLIC_USE_FIREBASE_EMULATOR`).

Project id: `demo-engineering-notebook`.

Compose named volumes persist Auth/Firestore (`firebase_emulator_data`) and object blobs (`gcs_data`). Core writes Yjs/assets to fake-gcs (not in-process memory). `docker compose down -v` wipes that data.

## Reloading

| Edit | Result |
| --- | --- |
| `services/core\|collab/src/**` | Container restarts (`tsx watch`) |
| `website/**` | Next HMR |
| `packages/shared/**` | Rebuild shared, then rebuild API images |

```bash
cd packages/shared && npm run build
cd ../infra && docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build core collab
```

## Auth notes

- Compose sets `AUTH_FALLBACK=true`: bearer can be a plain uid (`service-admin`) or Firebase ID token.
- `service-admin` is the local Service Administrator (`SERVICE_ADMIN_UID`).

See [api-contracts.md](../03-reference/api-contracts.md) for routes.
