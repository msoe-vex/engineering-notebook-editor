# NFR-security: Security & tenancy

Status: current  
Related: [tenancy-acl](../../02-architecture/tenancy-acl.md), [FR-auth](../features/FR-auth.md), [FR-orgs](../features/FR-orgs.md)

## Requirement

- Clients never access metadata/object stores with user credentials; Admin/server SDKs only inside Core/Collab **adapters** (`firestore.rules` deny for Firestore).
- Every Core mutating route authenticates and authorizes org/notebook access (restricted mode respected).
- Collab WSS authenticates unless explicitly disabled for local smoke (`COLLAB_AUTH_DISABLED`).
- Invites expire and optionally bind to a **verified** email (primary or secondary — [FR-auth](../features/FR-auth.md)).

## Current implementation

Identity bearer → Core `AuthPort` (Firebase adapter); Firestore paths for metadata; invite `expiresAt` + email match. Ports expansion: [ADR-009](../../02-architecture/decisions/ADR-009-platform-ports.md).

## Verification

- Attempt restricted notebook without grant → omitted from list / 403
- Accept expired invite → 400
- Firestore client SDK write from browser → denied by rules

## Gaps

- Finer per-entry ACLs not required yet
- In-memory rate limits are per Core instance (Cloud Run multi-instance is best-effort)

## Hardening (current)

- Internal routes require `INTERNAL_SERVICE_SECRET` (fail closed; see [security-route-checklist](../../05-ops/security-route-checklist.md))
- Zod validation on invites, secondary email, entry create/patch
- Rate limits on auth session, invites, secondary-email send
- Security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cache-Control: no-store`
- 5xx responses do not echo internal exception messages
