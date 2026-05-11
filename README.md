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

## LaTeX Engine & Assets

The in-browser PDF compilation is powered by **BusyTeX** (a WebAssembly build of XeTeX).

### Asset Origin
The assets in `website/public/busytex` are sourced from the [TeXlyre/texlyre-busytex](https://github.com/TeXlyre/texlyre-busytex) project. They consist of:
- **`busytex.wasm / .js`**: The core LaTeX engine compiled to WASM.
- **`texlive-*.js / .data`**: Virtual filesystem bundles containing the standard TeX Live distribution.

These files were originally downloaded via the `texlyre-busytex` toolchain and are committed to the repository to ensure reliable local serving. Downloaded from [https://github.com/TeXlyre/texlyre-busytex/releases](https://github.com/TeXlyre/texlyre-busytex/releases).

### Hosting Large Assets (GitHub Releases)
To bypass Vercel Hobby plan limits and GitHub LFS bandwidth restrictions, the largest assets (like `texlive-recommended.js`) are hosted as **GitHub Release Assets** and served via an **Edge Proxy**.

**To update or move these assets:**
1.  **Download the assets locally**:
    ```bash
    cd website
    npx texlyre-busytex download-assets ./public/busytex
    ```
2.  **Create a New Release**:
    Go to your repository on GitHub -> **Releases** -> **Draft a new release**. Tag it (e.g., `v0.1.0`).
3.  **Upload Assets**:
    Drag and drop **both** `texlive-recommended.js` and `texlive-recommended.data` from `website/public/busytex/` into the release's binary assets area. Both files are required; the `.js` file acts as the loader and metadata, while the `.data` file contains the actual TeX Live assets.
4.  **Update the Proxy URL**:
    In `website/src/lib/busytex.ts`, update the `GITHUB_PACKAGE_URL` constant to point to your new release:
    ```typescript
    const GITHUB_PACKAGE_URL = 'https://github.com/your-org/your-repo/releases/download/v0.1.0/texlive-recommended.js';
    ```
    The app will automatically use the `/api/busytex-proxy` to fetch these assets with the correct CORS headers.

## Updating LaTeX Dependencies

If you add new LaTeX packages to the notebook templates, you must update the bundled assets in the website's public directory so the browser-based compiler can find them.

### Using `notebook/bundle.bat`
This script automates the process of gathering dependencies from your local TeX distribution and copying them to the website.

**Prerequisites:**
- A local LaTeX distribution (e.g., MiKTeX or TeX Live) installed and in your PATH.
- PowerShell (available by default on Windows).

**Usage:**
1. Open a terminal in the `notebook/` directory.
2. Run the bundling script:
   ```bash
   ./bundle.bat
   ```
3. The script will:
   - Compile `main.tex` once to record all file access.
   - Locate every `.sty`, `.cls`, and font dependency on your system.
   - Copy the required files to `website/public/latex/`.
   - Update `website/public/latex/manifest.json`.
4. Commit the updated files in `website/public/latex/` to your repository.

