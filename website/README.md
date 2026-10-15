# Website

Next.js UI for the engineering notebook. **Entry point is `/`** (Firebase → orgs → notebooks → entries). Folder routes under `app/(app)/`. Old `/cloud/*` URLs redirect to `/`.

Live storage is **GCP only** (Core/Firestore/GCS). ZIP export/import is backup (LWW). Old GitHub/local project UI is unreachable — see [LEGACY.md](./LEGACY.md).

**Local stack:** [docs/local-development.md](../docs/local-development.md) · **Root:** [../README.md](../README.md)

## Quick start

```bash
# Terminal 1 — APIs + emulators (watch)
cd ../infra && docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build firebase gcs core collab agents

# Terminal 2 — this package
npm install && npm run dev
```

Open http://localhost:3000 · Firebase Emulator UI http://localhost:4000  
Full guide: [docs/local-development.md](../docs/local-development.md).

## Environment

```bash
cp .env.example .env.local
```

See `.env.example` for all `NEXT_PUBLIC_*` keys. Emulator Auth requires `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true`.

## Checks

```bash
npm run lint && npm test && npm run build
```

## Deploy

Cloud Run via [infra/cloudrun/deploy.sh](../infra/cloudrun/deploy.sh). Image build context is **repo root** (`website/Dockerfile`) so `@engineering-notebook/shared` is included.
