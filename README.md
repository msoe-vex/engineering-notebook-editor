# Engineering Notebook Editor

This repository contains the engineering notebook platform codebase, organized into Cloud Run-oriented microservices:

- `website/`: Next.js frontend container (editor, notebook UI, and client sync)
  - For more details, see the [README in the `website/` folder](website/README.md)
- `services/core/`: Fastify core API (auth adapter, org/notebook management, admin metrics, asset routes)
- `services/collab/`: Hocuspocus / Yjs real-time WebSocket collaboration service
- `services/agents/`: Fastify AI agent service (rubric-audit workflows, BYOK + grant-gated platform AI routing; standard replacement for legacy `judge/` implementations)
  - For more details, see [`services/agents/README.md`](services/agents/README.md)
- `packages/shared/`: shared cross-service types and schemas
- `infra/`: local compose and deployment scaffolding
- `loadtest/`: k6 load test scripts
- `notebook/`: LaTeX source templates and generated notebook output
  - For more details, see the [README in the `notebook/` folder](notebook/README.md)

---

## Local Development & Testing

### Frontend (`website/`)

To develop or test the frontend website standalone:

```bash
cd website
npm install
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000) by default.

**Testing & Verification in `website/`**:
```bash
npm test        # Runs unit & schema tests (Vitest)
npm run lint    # ESLint check
npm run build   # Build check
```

### Backend Services (`services/*`)

Each backend microservice can be run individually or together:

- **Core API** (`services/core`): `npm install && npm run dev` (Port 8080)
- **Collab Service** (`services/collab`): `npm install && npm run dev` (Port 1234)
- **Agents Service** (`services/agents`): `npm install && npm run dev` (Port 8000)

### Multi-service Orchestration (Docker Compose)

To run the complete stack (`website`, `core`, `collab`, `agents`) locally in Docker:

```bash
cd infra
docker compose up --build
```

Endpoints when running via Docker Compose:
- **Website UI**: http://localhost:3000
- **Core API**: http://localhost:8080
- **Collab WebSocket**: ws://localhost:1234
- **Agents API**: http://localhost:8000

To run load tests against local services:
```bash
k6 run loadtest/k6-smoke.js
```

See:
- [`docs/microservices-architecture.md`](docs/microservices-architecture.md)
- [`docs/api-contracts.md`](docs/api-contracts.md)

---

## Firebase & Firebase Emulator Setup

`services/core` uses a pluggable authentication adapter (`AuthPort`) implemented in `services/core/src/auth/firebaseAuthAdapter.ts`.

### Should You Use the Firebase Emulator?

- **Local Development / Offline Testing**:
  - **Yes, recommended** if you are modifying auth flows, verifying custom tokens, or testing security rules without connecting to live Firebase infrastructure.
  - Start the Firebase Local Emulator Suite:
    ```bash
    firebase emulators:start --only auth
    ```
  - Point your local services to the emulator by setting the `FIREBASE_AUTH_EMULATOR_HOST` environment variable:
    ```bash
    export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
    ```
- **Local Development with Mock Auth**:
  - If you do not need full Firebase Auth token verification, `firebaseAuthAdapter.ts` operates in fallback mode locally, accepting bearer session tokens directly without requiring a running emulator.
- **Production / Cloud Run**:
  - In deployed environments, do not use the emulator. Configure `FIREBASE_PROJECT_ID` and attach a service account key or Google Application Default Credentials (ADC) to `services/core`.

---

## Cloud Run Deployment

Primary hosting for the backend and frontend is Google Cloud Run with one container per service (`website`, `services/core`, `services/collab`, `services/agents`).

### Deployment Steps

1. **Build and push container images** using Google Cloud Build or Docker:
   ```bash
   # Example using Google Cloud Build
   gcloud builds submit services/core --tag gcr.io/$PROJECT_ID/core-service
   gcloud builds submit services/collab --tag gcr.io/$PROJECT_ID/collab-service
   gcloud builds submit services/agents --tag gcr.io/$PROJECT_ID/agents-service
   gcloud builds submit website --tag gcr.io/$PROJECT_ID/website-service
   ```

2. **Deploy each container to Cloud Run**:
   ```bash
   # Core service
   gcloud run deploy core-service \
     --image gcr.io/$PROJECT_ID/core-service \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars FIREBASE_PROJECT_ID=$PROJECT_ID

   # Agents service
   gcloud run deploy agents-service \
     --image gcr.io/$PROJECT_ID/agents-service \
     --region us-central1 \
     --allow-unauthenticated

   # Collab service (requires WebSocket / HTTP 1.1 support)
   gcloud run deploy collab-service \
     --image gcr.io/$PROJECT_ID/collab-service \
     --region us-central1 \
     --allow-unauthenticated \
     --use-http2

   # Website service
   gcloud run deploy website-service \
     --image gcr.io/$PROJECT_ID/website-service \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars NEXT_PUBLIC_CORE_API_URL=https://core-service-url,NEXT_PUBLIC_AGENTS_API_URL=https://agents-service-url
   ```

3. **Configure Service Endpoints & Env Vars**:
   - Ensure `NEXT_PUBLIC_CORE_API_URL` and `NEXT_PUBLIC_AGENTS_API_URL` are configured on the website container to point to the deployed Cloud Run service URLs.
   - For WebSocket persistence in `services/collab`, enable HTTP/2 or WebSocket sessions in Cloud Run settings.

### Git Hooks (Recommended)

To automatically run lint, tests, and build before every `git push` (matching the CI workflow), enable the repository's `.githooks` directory:

```bash
git config core.hooksPath .githooks
```

## Environment Variables

Create `website/.env.local` with the GitHub OAuth values used by the app:

```bash
NEXT_PUBLIC_GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
```

- `NEXT_PUBLIC_GITHUB_CLIENT_ID` is exposed to the browser because the sign-in flow needs the client id.
- `GITHUB_CLIENT_SECRET` must stay server-side and is used by the token exchange route.

## GitHub App Setup

Create a GitHub OAuth App or GitHub App for the editor and point it at the deployed app URL.

- Homepage URL: your public app URL, such as `https://your-domain.com`
- Callback / redirect URL: the public URL that finishes the GitHub sign-in flow for this app. Use the same URL for the redirect URL as the homepage URL.
- Update the GitHub app settings any time the deployed domain changes

If you are using Vercel previews, make sure the same env vars are configured for Preview and Production deployments.

## Deployment

Primary target hosting is Google Cloud Run with one container per service (`website`, `services/core`, `services/collab`, `services/agents`).

For local parity, use `infra/docker-compose.yml`.

For notebook/PDF work, see `notebook/README.md`.

## Release Workflow (For Web Editor)

To ensure the web editor can compile PDFs efficiently without bloating the Git repository, bundle notebook template files and publish BusyTeX/LaTeX static assets to cloud storage.

### 1. Prepare Assets

Run the following from the `website/` directory:

- `npm run download:busytex`
  - Downloads the engine WASM and TeX Live `.data` files into `website/public/busytex/`.
- `npm run bundle:template`
  - Bundles the complete notebook template (`notebook/main.tex`, `notebook/notebook.sty`, `notebook/fonts/`, and `notebook/data/`) into `website/public/notebook-template/`.
  - Scans and gathers external LaTeX package dependencies into `website/public/latex/` with `manifest.json`.

### 2. Upload BusyTeX Assets to Cloud Storage

1. Build or download BusyTeX + LaTeX package assets locally.
2. Upload files to your versioned cloud bucket path (for example `static/busytex/{appVersion}` and `static/latex-template/{appVersion}`).
3. Configure website/core env vars to serve or redirect static asset requests from those cloud paths.

### 3. How it Works (Development vs. Production)

- **Template Files**: The app serves `main.tex`, `notebook.sty`, typography fonts, and initial template entries directly from `website/public/notebook-template/`.
- **LaTeX Engine & Packages**:
  - **Local Development**: In dev mode, the app can serve WASM engine and TeX packages from local `website/public/`.
  - **Production / Deployment**: In cloud deployments, static assets should be served from cloud object storage through core-owned route space.
