# Core security route checklist

Related: [NFR-security](../01-requirements/quality/NFR-security.md), [env-vars](../03-reference/env-vars.md), [tenancy-acl](../02-architecture/tenancy-acl.md).

## Public (no user bearer)

| Route | Auth |
| --- | --- |
| `GET /health` | none |
| `GET /auth/session` | bearer (rate-limited per IP) |
| Public org/notebook routes (`registerPublicRoutes`) | slug / public key rules |
| Static asset routes | as registered |

## Authenticated (Firebase / Better Auth bearer)

Scoped under `requireAuth`: user, org, judge user, AI complete, admin.

## Internal (`X-Internal-Secret`)

Fail closed unless `NODE_ENV=development|test` **and** `ALLOW_INSECURE_INTERNAL=1`.

| Surface | Notes |
| --- | --- |
| `/internal/jobs/*` | worker progress/complete/fail |
| `/internal/compile/*` | snapshot / export / progress |
| `/internal/metadata/*` | MetadataStore proxy |
| `/internal/judge/*` | rubric + score callbacks |
| `/internal/ai/*` | Vertex / BYOK complete |
| `/internal/collab/*` | authorize, yjs, flush, **connections** |

## Rate limits (in-memory per instance)

| Key | Window | Max |
| --- | --- | --- |
| Auth session per IP | 60s | 60 |
| Invite create per uid | 60s | 10 |
| Secondary-email send per uid | 60s | 3 |
| Primary email resend per uid | 60s | 1 |

## Manual smoke

1. Without secret (and without `ALLOW_INSECURE_INTERNAL`): `POST /internal/collab/connections` → 403 `internal_secret_required` or `internal_secret_invalid`.
2. With wrong secret → 403.
3. Restricted notebook as non-allowlisted member → 403 / omitted from list.
4. Alumni write → 403 `alumni_readonly`.
5. Public slug read OK when org visibility public.
