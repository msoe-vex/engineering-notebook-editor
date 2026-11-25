# Environment variables

## Website (`website/.env.local`)

See [`website/.env.example`](../../website/.env.example).

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CORE_API_URL` | Core REST base (orgs, entries, `/ai/complete`, rubrics/judgments) |
| `NEXT_PUBLIC_COLLAB_WS_URL` | Hocuspocus WebSocket |
| `NEXT_PUBLIC_ASSETS_BASE_URL` | Static / legacy BusyTeX proxy base (often Core) |
| `NEXT_PUBLIC_ALLOW_BUSYTEX_COMPILE` | `1` / `true` → optional browser compile escape hatch (default off) |
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
| `JOB_DISPATCH` | `pubsub` | `pubsub` \| `none` — Core job wake ([ADR-008](../02-architecture/decisions/ADR-008-job-dispatch-evolution.md)) |
| `PUBSUB_EMULATOR_HOST` | `pubsub:8085` local | Emulator host; omit in GCP |
| `GOOGLE_CLOUD_PROJECT` / `GCP_PROJECT_ID` | `demo-engineering-notebook` local | Pub/Sub + Vertex project |
| `PUBSUB_TOPIC_COMPILE` / `PUBSUB_TOPIC_JUDGE` | `notebook-jobs-compile` / `notebook-jobs-judge` | Topic overrides |
| `PUBSUB_SUBSCRIPTION_COMPILE` / `PUBSUB_SUBSCRIPTION_JUDGE` | `…-worker` | Worker pull subscriptions |
| `NOTIFICATION_PROVIDER` | `console` | `console` \| `none` \| `resend` |
| `RESEND_API_KEY` / `RESEND_FROM` | — | Required when provider=`resend` |
| `PUBLIC_APP_URL` | `http://localhost:3000` | Links in invite / secondary-email verify emails |
| `INTERNAL_SERVICE_SECRET` | compose `local-dev-secret` | **Required** for Core ↔ worker / collab. Fail closed when unset (403) unless local `ALLOW_INSECURE_INTERNAL=1`. Fatal if unset when `NODE_ENV=production`. |
| `ALLOW_INSECURE_INTERNAL` | unset | `1` only for local smoke without a secret — never in prod |
| `CORS_ORIGIN` | unset → allow all in non-prod | Comma-separated browser origins; production without it denies browser CORS |
| `REQUIRE_INTERNAL_SECRET` | — | Legacy alias intent covered by fail-closed + `ALLOW_INSECURE_INTERNAL` |

Deploy wiring: [deploy-cloudrun.md](../04-guides/deploy-cloudrun.md).
