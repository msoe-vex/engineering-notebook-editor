# Environment variables

## Website (`website/.env.local`)

See [`website/.env.example`](../../website/.env.example).

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CORE_API_URL` | Core REST base |
| `NEXT_PUBLIC_AGENTS_API_URL` | Agents REST base |
| `NEXT_PUBLIC_COLLAB_WS_URL` | Hocuspocus WebSocket |
| `NEXT_PUBLIC_ASSETS_BASE_URL` | BusyTeX/static proxy base (often Core) |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase web config |
| `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` | `true` → Auth emulator |
| `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` | e.g. `localhost:9099` |

## Core / Collab / Agents (Compose & Cloud Run)

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
| `VERTEX_STUB` | local stub | Agents Vertex |

Deploy wiring: [deploy-cloudrun.md](../04-guides/deploy-cloudrun.md).
