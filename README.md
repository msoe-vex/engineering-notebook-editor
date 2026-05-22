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

To ensure the web editor can compile PDFs efficiently without hitting GitHub LFS limits, we host the LaTeX engine and template dependencies as GitHub Release assets.

### 1. Prepare Assets

Run the following from the `website/` directory:

- `npm run download:busytex`: Downloads the engine WASM and TeX Live `.data` files into `website/public/busytex/`.
- `npm run bundle:latex`: Gathers the template `.sty`, `.cls`, and font dependencies into `website/public/latex/`.

### 2. Upload to Release

1. Create a new release on GitHub (e.g., `v0.1.0`).
2. Upload **all** files from `website/public/busytex/` to the release assets area.
3. You can then delete the local copies from `website/public/busytex/` if you want to keep your workspace clean.
   > [!NOTE]
   > Keeping `website/public/busytex/` locally enables **100% offline-ready local development**!

### 3. How it Works (Development vs. Production)

- **Local Development**: The app automatically detects development mode and serves the WASM engine and TeX Live package entirely from your local `website/public/busytex/` folder.
- **Production / Deployment**: Next.js automatically proxies all `/busytex/...` routes via an edge function to the official GitHub Release `GITHUB_RELEASE_URL` (configured in `website/src/lib/busytex.ts`), meaning you never have to commit huge WASM/data assets to git!
