# Local development

API services hot-reload in Docker; the website runs on the host with Next HMR.

## Prerequisites

- **Node.js 20+** (nvm recommended) — website
- **Docker** — Firebase, GCS, Core, Collab, Agents

## Start

**Terminal 1 — backends (watch)**

```bash
cd infra
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build firebase gcs core collab agents
```

First boot can take a few minutes (Firebase emulator installs JDK + tools). Leave this running.

**Terminal 2 — website**

```bash
cd website
npm install
npm run dev
```

Open **http://localhost:3000** → redirects to `/cloud`.

Sign in with **Continue with dev token** → `service-admin`, or create an email/password user (Auth emulator).

Create an organization → notebook → **New entry**.

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
| Agents API | http://localhost:8000 |
| **Firebase Emulator UI** | **http://localhost:4000** |
| Auth emulator | localhost:9099 |
| Firestore emulator | localhost:8081 |
| fake-gcs | http://localhost:4443 |

## Firebase emulator

With the stack up, open **http://localhost:4000**.

| Tab | Use |
| --- | --- |
| **Authentication** | Users created via `/cloud` email sign-up (or the UI) |
| **Firestore** | Orgs, members, notebooks, entries, users, invites |

Auth/Firestore talk to the emulators automatically (`FIRESTORE_EMULATOR_HOST` / Auth emulator host in Compose; website uses `NEXT_PUBLIC_USE_FIREBASE_EMULATOR`).

Project id: `demo-engineering-notebook`. Data resets when you recreate the Firebase container.

## Reloading

| Edit | Result |
| --- | --- |
| `services/core\|agents\|collab/src/**` | Container restarts (`tsx watch`) |
| `website/**` | Next HMR |
| `packages/shared/**` | Rebuild shared, then rebuild API images |

```bash
cd packages/shared && npm run build
cd ../infra && docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build core agents collab
```

## Auth notes

- Compose sets `AUTH_FALLBACK=true`: bearer can be a plain uid (`service-admin`) or Firebase ID token.
- `service-admin` is the local Service Administrator (`SERVICE_ADMIN_UID`).

See [api-contracts.md](./api-contracts.md) for routes.
