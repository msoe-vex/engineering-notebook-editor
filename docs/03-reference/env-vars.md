# Environment variables

## Website (`website/.env.local`)

See [`website/.env.example`](../../website/.env.example).

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CORE_API_URL` | Core REST base (orgs, entries, `/ai/complete`, audits) |
| `NEXT_PUBLIC_COLLAB_WS_URL` | Hocuspocus WebSocket |
| `NEXT_PUBLIC_ASSETS_BASE_URL` | BusyTeX/static proxy base (often Core) |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase web config |
| `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` | `true` → Auth emulator |
| `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` | e.g. `localhost:9099` |

## Core / Collab (Compose & Cloud Run)

| Variable | Typical local | Notes |
| --- | --- | --- |
| `AUTH_FALLBACK` | `true` | Plain uid bearer for smoke; **false** in prod |
| `FIRESTORE_EMULATOR_HOST` | set in Compose | Emulator |
| `STORAGE_BACKEND` | `memory` or GCS | Local vs real bucket |
| `GCS_BUCKET` | project bucket | Production |
| `SERVICE_ADMIN_UID` | `service-admin` | Local platform admin |
| `COLLAB_AUTH_DISABLED` | `true` local only | **false** in prod |
| `CORE_API_URL` | Collab → Core | Flush / connections |
| `INVITE_TTL_DAYS` | `14` | Invite expiry default |
| `BODY_LIMIT_BYTES` | `67108864` (64 MiB) | Core Fastify max request body (assets + PDF exports). Defaults to `MAX_UPLOAD_BYTES` in shared. |
| `VERTEX_STUB` | `true` local | When `true`, Core `POST /ai/complete` returns 503 (fail closed) |
| `VERTEX_ACCESS_TOKEN` | optional | Vertex bearer; else ADC via `google-auth-library` |
| `VERTEX_LOCATION` / `VERTEX_MODEL` | `us-central1` / `gemini-2.0-flash-001` | Vertex target |
| `GCP_PROJECT_ID` | prod project | Vertex project (falls back to `FIREBASE_PROJECT_ID`) |

Deploy wiring: [deploy-cloudrun.md](../04-guides/deploy-cloudrun.md).
