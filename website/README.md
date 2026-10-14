# Website

Next.js UI for the engineering notebook. **Entry point is `/cloud`** (Firebase → orgs → notebooks → Hocuspocus editor). `/` redirects there.

Live storage is **GCP only** (Core/Firestore/GCS). ZIP export/import is backup (LWW). Old GitHub/local project UI is unreachable — see [LEGACY.md](./LEGACY.md).

**Local stack:** [docs/local-development.md](../docs/local-development.md) · **Root:** [../README.md](../README.md)

## Quick start

```bash
# Prefer full stack:
cd ../infra && docker compose up --build
# open http://localhost:3000

# Or frontend against already-running APIs:
npm install
npm run dev
```

## Environment

```bash
NEXT_PUBLIC_CORE_API_URL=http://localhost:8080
NEXT_PUBLIC_AGENTS_API_URL=http://localhost:8000
NEXT_PUBLIC_COLLAB_WS_URL=ws://localhost:1234
NEXT_PUBLIC_ASSETS_BASE_URL=http://localhost:8080
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-engineering-notebook
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true
NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
```

## Checks

```bash
npm run lint && npm test && npm run build
```

## Deploy

Cloud Run via [infra/cloudrun/deploy.sh](../infra/cloudrun/deploy.sh). Image build context is **repo root** (`website/Dockerfile`) so `@engineering-notebook/shared` is included.
