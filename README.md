# Engineering Notebook Editor

This repository contains the engineering notebook platform codebase, organized into Cloud Run-oriented services:

- `website/`: the Next.js frontend container
  - For more details, see the [README in the `website/` folder](website/README.md)
- `services/core/`: Fastify core API (auth adapter, org/notebook APIs, admin metrics, asset routes)
- `services/collab/`: Hocuspocus/Yjs real-time collaboration service
- `services/agents/`: Fastify rubric agent service (BYOK + grant-gated platform AI routing)
- `packages/shared/`: shared cross-service types
- `infra/`: local compose and deployment scaffolding
- `loadtest/`: k6 load test scripts
- `notebook/`: the LaTeX source and generated notebook output
  - For more details, see the [README in the `notebook/` folder](notebook/README.md)

## Quick Start

For frontend work, use the `website` app:

```bash
cd website
npm install
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000) by default.

### Multi-service Local Development

To run website + core + collaboration + agents together:

```bash
cd infra
docker compose up --build
```

See:

- [`docs/microservices-architecture.md`](docs/microservices-architecture.md)
- [`docs/api-contracts.md`](docs/api-contracts.md)

Before merging changes into `main`, run both checks from `website/`:

```bash
npm run lint
npm run build
```

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
