# Website

This folder contains the Next.js editor and notebook sync application.

## Local Development

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Required Environment Variables

Create a `.env.local` file in this folder:

```bash
NEXT_PUBLIC_GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
```

- `NEXT_PUBLIC_GITHUB_CLIENT_ID` is read by the browser-side login flow.
- `GITHUB_CLIENT_SECRET` is used by the server-side OAuth exchange route.

If you deploy to Vercel, set the same variables in the Vercel project settings for both Preview and Production.

## GitHub App Setup

When creating the GitHub OAuth/GitHub App for this project:

- Homepage URL: your public deployed app URL, such as `https://your-domain.com`
- Callback / redirect URL: the public URL that returns the user to the app after GitHub authorization
- Keep the GitHub app URLs in sync with your deployed domain and any preview URLs you intentionally test against

If the deployed domain changes, update the GitHub app settings at the same time.

## Before Merging

Run these checks before opening or merging a PR into `main`:

```bash
npm run lint
npm run build
```

## Vercel Deployment

Recommended deployment setup:

1. Import the GitHub repository into Vercel.
2. Set the project root directory to `website`.
3. Add `NEXT_PUBLIC_GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in the Vercel environment variables.
4. Enable automatic deploys from the connected GitHub branch.
5. Add a custom domain in Vercel and point DNS to the provided Vercel targets.

Preview deployments are useful for testing changes before they land on `main`.
