# Website

Next.js app: classic Home (local folder / temporary / GitHub OAuth + ZIP) and cloud tenancy at **`/cloud`**.

**Full local stack instructions:** [docs/local-development.md](../docs/local-development.md)  
**Root overview:** [../README.md](../README.md)

## Quick start

```bash
npm install
npm run download:busytex    # optional — PDF compile
npm run bundle:template     # optional — template + latex packages
npm run dev
```

- Classic editor: http://localhost:3000  
- Cloud UI needs Core: `cd ../infra && docker compose up --build`, then http://localhost:3000/cloud

## Environment variables

```bash
# Cloud (set automatically in docker-compose website service)
NEXT_PUBLIC_CORE_API_URL=http://localhost:8080
NEXT_PUBLIC_AGENTS_API_URL=http://localhost:8000
NEXT_PUBLIC_COLLAB_WS_URL=ws://localhost:1234
NEXT_PUBLIC_ASSETS_BASE_URL=http://localhost:8080
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-engineering-notebook
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true
NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=localhost:9099

# Optional — GitHub alternative on Home
NEXT_PUBLIC_GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

BusyTeX: `public/busytex` + `public/latex` locally, or Core/GCS when `NEXT_PUBLIC_ASSETS_BASE_URL` is set.

## Checks before merge

```bash
npm run lint
npm test
npm run build
```

## Deployment

Primary host is **Google Cloud Run** — [infra/cloudrun/deploy.sh](../infra/cloudrun/deploy.sh).  
Docker build context is the **repo root** (`website/Dockerfile`) so `@engineering-notebook/shared` is included.
