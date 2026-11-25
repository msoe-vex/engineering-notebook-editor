# FR-notifications: Transactional email & notifications

Status: partial  

Related: [FR-auth](./FR-auth.md), [platform-ports plan](../plans/platform-ports.md), [ADR-009](../../02-architecture/decisions/ADR-009-platform-ports.md)

## Summary

Core sends **application** notifications (email first) through a **`NotificationPort`**. Adapters wrap a provider (Resend, SES, SMTP, or local log/Mailhog). Identity-provider emails (Firebase verify/reset) may remain IdP-owned until we deliberately move templates onto this port.

## Actors and permissions

| Actor | Capability |
| --- | --- |
| System / Core | Send transactional messages for auth-adjacent and product events |
| End user | Receives mail; cannot spoof sender via API |
| Local/CI | Messages go to log or catcher — no production provider required |

## User-facing behavior

- Org **invite** email (optional branded) when an invite is created with an email address  
- **Secondary email** verification messages (see [FR-auth](./FR-auth.md))  
- **Comment @mention** (`comment_mention`) when a member is mentioned on an entry comment  
- Optional: compile/judge **job completed** email when the user opts in (Account preferences — later)  
- Password reset / primary email verification may stay on the IdP in v1; if product owns them, they use this port with one template source

## Acceptance criteria

- [x] `NotificationPort` exists in Core; vendor SDK only inside an adapter
- [x] Local Compose uses a non-sending or catcher adapter
- [x] At least one product template ships (invite **or** secondary-email verify)
- [x] Comment mention notifications go through `NotificationPort` (console adapter until email provider is configured)
- [x] Failures are logged; user-facing flows degrade gracefully (invite still created if mail fails, with UI warning)
- [x] Secrets (API keys) only via env — [env-vars](../../03-reference/env-vars.md)

### Remaining

- [x] Resend (or other prod) adapter behind `NOTIFICATION_PROVIDER`
- [x] Secondary-email verification template
- [x] HTML + text resolution via template registry (`org_invite`, `secondary_email_verify`, `comment_mention`, `primary_email_verify`)
- [x] `NotificationPort` injected from Core bootstrap (not route-module singletons)

## Data and APIs

- No user-facing REST required for v1 (server-triggered)
- Optional later: admin “resend invite email”

## Non-goals

- Marketing newsletters; SMS/push in v1  
- Replacing the IdP as the source of account credentials
