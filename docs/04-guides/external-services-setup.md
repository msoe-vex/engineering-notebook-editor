# External Services & OAuth Setup Guide

This guide covers setting up the external GCP services and Social Login OAuth applications required to run **Engineering Notebook** locally and in production.

> **Need help?** If you run into any issues or need access to existing developer apps, reach out to **Andrew Needham** at `aneedham0577@gmail.com`.

---

## 1. Social Login OAuth Apps

Authentication is handled by **Better Auth** on the Next.js `website` service. Every OAuth provider uses the same callback URL pattern:

- **Local development:** `http://localhost:3000/api/auth/callback/<provider>`
- **Production:** `https://<your-domain>/api/auth/callback/<provider>`

### Google (GCP OAuth 2.0)
1. Open **Google Cloud Console → APIs & Services → Credentials**.
2. Create an **OAuth 2.0 Client ID** (Application type: **Web application**).
3. Add **Authorized JavaScript origins**:
   - `http://localhost:3000`
   - `https://<your-domain>`
4. Add **Authorized redirect URIs**:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://<your-domain>/api/auth/callback/google`
5. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `website/.env.local` (or Secret Manager).

### GitHub
1. Open **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Set **Homepage URL** to `http://localhost:3000` (or `https://<your-domain>`).
3. Set **Authorization callback URL** to:
   - `http://localhost:3000/api/auth/callback/github` (create a separate OAuth App for production with `https://<your-domain>/api/auth/callback/github`).
4. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.

### Discord
1. Open **Discord Developer Portal → Applications → OAuth2**.
2. Add **Redirects**:
   - `http://localhost:3000/api/auth/callback/discord`
   - `https://<your-domain>/api/auth/callback/discord`
3. Set `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`.

### LinkedIn
1. Open **LinkedIn Developer Portal → My Apps → Auth**.
2. Under **Products**, ensure **Sign In with LinkedIn using OpenID Connect** is added.
3. Add **Authorized redirect URLs for your app**:
   - `http://localhost:3000/api/auth/callback/linkedin`
   - `https://<your-domain>/api/auth/callback/linkedin`
4. Set `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`.

---

## 2. Google Cloud Platform (GCP) Services

To keep idle hosting costs at **\$0/month**, deploy all 5 services to **Cloud Run** with `min-instances: 0`:

| Service | Source | Role |
| :--- | :--- | :--- |
| `website` | `website/Dockerfile` | Next.js UI + Better Auth |
| `core` | `services/core/Dockerfile` | Fastify API, RBAC, Metadata/Storage authority |
| `collab` | `services/collab/Dockerfile` | Hocuspocus Yjs WebSocket server |
| `compile` | `services/compile/Dockerfile` | LaTeX / BusyTeX PDF compiler worker |
| `judge` | `services/judge/Dockerfile` | Python / LangGraph rubric & grading worker |

### Required GCP Resources
1. **Artifact Registry:** Docker repository for the 5 service images.
2. **Firestore (Native mode):** Primary metadata store (`user`, `session`, `account`, `verification`, `org`, `notebook`, `entry`, etc.).
3. **Cloud Storage (GCS):** Private bucket for TipTap JSON, Yjs snapshots, assets, compiled PDFs, and rubric sources.
4. **Pub/Sub:** Topics and push/pull subscriptions for `compile` and `judge` async jobs.
5. **Secret Manager:** Store `BETTER_AUTH_SECRET`, `INTERNAL_SERVICE_SECRET`, and OAuth client secrets.

---

## 3. Terraform & CI/CD Recommendation

**Yes, use Terraform + GitHub Actions:**
- **Terraform:** Provision and version-control your GCP project resources (Cloud Run services with `min-instances = 0`, Firestore, GCS bucket + IAM, Pub/Sub topics/subscriptions, Artifact Registry, and Secret Manager).
- **GitHub Actions:** On push to `main`, build and push Docker images to Artifact Registry using Workload Identity Federation (keyless auth), then deploy the updated images to Cloud Run.

---

## 4. Environments, Secrets & Variables

We use **GitHub Environments (`dev` and `prod`)** as the single source of truth for deployed environments, and `website/.env.local` (gitignored) for local development:

- **`dev` branch → `dev` GitHub Environment** (deploys to your dev GCP project)
- **`main` branch → `prod` GitHub Environment** (deploys to your prod GCP project)

| What | Local Dev | `dev` / `prod` (GitHub Environments) |
| :--- | :--- | :--- |
| **App Secrets** (`BETTER_AUTH_SECRET`, `INTERNAL_SERVICE_SECRET`, `*_CLIENT_SECRET`) | `website/.env.local` | **GitHub Environment Secrets** → synced to **GCP Secret Manager** |
| **CI/CD Auth Secrets** (`GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`) | N/A | **GitHub Environment Secrets** |
| **Non-Secret Config** (`GCP_PROJECT_ID`, `GCP_REGION`, `APP_URL`, `*_CLIENT_ID`) | `website/.env.local` | **GitHub Environment Variables** (passed to Terraform by `deploy.yml`) |
