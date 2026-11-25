# FR-auth: Authentication & session

Status: partial  
Related: [api-contracts](../../03-reference/api-contracts.md), [NFR-security](../quality/NFR-security.md), [FR-notifications](./FR-notifications.md), [platform-ports plan](../plans/platform-ports.md), [ADR-009](../../02-architecture/decisions/ADR-009-platform-ports.md)

## Summary

Users authenticate via an **identity adapter** (Firebase Auth today, including the emulator locally). Core (and Collab) accept a Bearer ID token verified through **`AuthPort` / IdentityPort** — not by scattering vendor SDK calls in routes. Product roles and grants live in app metadata (`users/{uid}`), not IdP custom claims.

**Shipped:** email/password sign-up & sign-in, email verification gate, session/bootstrap APIs, local `AUTH_FALLBACK`, password-reset + Google/GitHub client hooks (when providers configured).  
**Planned:** multi-email (verified secondaries), Collab shared IdentityPort verify, account link/unlink polish.

## Actors and permissions

| Actor | Capability |
| --- | --- |
| Anonymous | Sign-in / sign-up / password-reset request / social start |
| Signed-in, unverified primary email | Verify / resend only (workspace gated) |
| Signed-in, verified | Bootstrap profile, session, link providers, manage secondary emails |
| Core / Collab | Verify bearer → `uid`, emails, verification flags |

## User-facing behavior

- Website auth chrome: email & password; **dev token** (local); **forgot password** → reset email → set new password (planned)
- Email verification enforced for primary email; `EmailVerificationScreen` with status, working resend (client sessionStorage cooldown + Core `/user/me/verification/resend-gate`), local bypass in development only
- **Social sign-in** (planned): at least GitHub and Google; LinkedIn if OIDC is practical — buttons on auth chrome
- **Account linking** (planned): from Account settings, link/unlink providers; clear error if provider identity belongs to another user
- **Multi-email** (planned): one **primary** (IdP); **secondary** emails on the user profile, each verified before they count for invite email-matching
- Email-restricted invites require a verified email (primary or secondary) matching the invite
- Emulator / local: `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true`; `AUTH_FALLBACK` for plain uid bearer

## Acceptance criteria

### Current

- [x] Unauthenticated API calls to protected Core routes return 401
- [x] Valid Bearer token identifies `uid`, optional email, and `emailVerified`
- [x] Users with unverified primary emails see the verification gate before workspace
- [x] Email-restricted invite acceptance rejects unverified accounts with 403 `email_not_verified`
- [x] Local compose: plain uid bearer works when `AUTH_FALLBACK=true`; dev bypass for emulator testing

### Planned

- [x] Forgot-password + reset confirmation works in prod and emulator (or documented IdP-only path)
- [x] User can sign in with a configured social provider and get the same `users/{uid}` bootstrap path
- [x] Signed-in user can link and unlink an additional provider without losing notebook ACL
- [x] User can add a secondary email, receive a verification message, and use it for invite matching once verified
- [x] Core and Collab share one identity verify implementation (no divergent Firebase Admin forks)
- [x] Website identity SDK usage stays in a thin client adapter (swappable with the IdP)

## Data and APIs

- `users/{uid}` — profile, prefs, grants; planned: `secondaryEmails[]` / verification state, `linkedProviders[]` — [schema](../../03-reference/schema.md)
- `GET /auth/session`, `POST /users/me/bootstrap`, `GET|PATCH /users/me`
- Planned: endpoints or IdP redirects for link/unlink and secondary-email verify confirm

## Non-goals

- Building a custom password vault / replacing the IdP wholesale in v1  
- Dual IdPs in one deployment  
- Using LinkedIn (or any provider) if the provider Terms or OIDC setup is impractical — document skip rather than block the FR
