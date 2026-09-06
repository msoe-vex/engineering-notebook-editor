# Engineering Notebook Editor

This repository contains two related parts of the VEX engineering notebook system:

- `website/`: the Next.js editor and sync UI
  - For more details, see the [README in the `website/` folder](website/README.md)
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

The `website/` app is designed to deploy on Vercel:

- Import the GitHub repository into Vercel
- Set the root directory to `website`
- Let Vercel build automatically on pushes to the connected branch
- Add `NEXT_PUBLIC_GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in the Vercel project environment settings
- Add a custom domain in Vercel and point DNS to the Vercel deployment

For notebook/PDF work, see `notebook/README.md`.

## Release Workflow (For Web Editor)

To ensure the web editor can compile PDFs efficiently without bloating the Git repository or hitting GitHub LFS limits, we bundle the notebook template directly into `website/public/notebook-template/` and host external LaTeX engine/packages as GitHub Release assets.

### 1. Prepare Assets

Run the following from the `website/` directory:

- `npm run download:busytex`
  - Downloads the engine WASM and TeX Live `.data` files into `website/public/busytex/`.
- `npm run bundle:template`
  - Bundles the complete notebook template (`notebook/main.tex`, `notebook/notebook.sty`, `notebook/fonts/`, and `notebook/data/`) into `website/public/notebook-template/`.
  - Scans and gathers external LaTeX package dependencies into `website/public/latex/` with `manifest.json`.

### 2. Upload to Release (LaTeX Engine & Packages Only)

1. Create or edit a release tag on GitHub (e.g., `v0.1.0`).
2. Upload **all** files from `website/public/busytex/` and `website/public/latex/` to the release assets.
3. You can then delete the local copies from `website/public/busytex/` and `website/public/latex/` to keep your git repo clean and lightweight (while `website/public/notebook-template/` remains the bundled template for the app).
   > [!NOTE]
   > Keeping `website/public/busytex/` and `website/public/latex/` locally enables **100% offline-ready local development**!

### 3. How it Works (Development vs. Production)

- **Template Files**: The app serves `main.tex`, `notebook.sty`, typography fonts, and initial template entries directly from `website/public/notebook-template/`.
- **LaTeX Engine & Packages**:
  - **Local Development**: In dev mode, the app serves the WASM engine and TeX Live packages directly from your local `website/public/` directory if present.
  - **Production / Deployment**: In production, Next.js automatically rewrites/proxies `/busytex/...` and `/latex/...` routes via an edge function to the official GitHub Release `GITHUB_RELEASE_URL` (configured in `website/src/lib/busytex.ts`), meaning you never have to commit large WASM binaries or hundreds of LaTeX package files to Git!
