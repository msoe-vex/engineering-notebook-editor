# Engineering Notebook Editor

This repository contains two related parts of the VEX engineering notebook system:

- `website/`: the Next.js editor and sync UI
- `notebook/`: the LaTeX source and generated notebook output

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
