# FR-auth: Authentication & session

Status: current  
Related: [api-contracts](../../03-reference/api-contracts.md), [NFR-security](../quality/NFR-security.md)

## Summary

Users sign in with Firebase Auth (emulator locally). Core APIs accept a Bearer Firebase ID token (or local uid when `AUTH_FALLBACK` is enabled).

## Actors and permissions

| Actor | Capability |
| --- | --- |
| Anonymous | Sign-in / sign-up only |
| Signed-in user | Bootstrap profile (`POST /users/me/bootstrap`), session (`GET /auth/session`) |

## User-facing behavior

- Website `/` requires auth chrome; Continue with Google / email / **dev token** (local)
- Emulator: `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true`

## Acceptance criteria

- [ ] Unauthenticated API calls to protected Core routes return 401
- [ ] Valid Bearer token identifies `uid` and optional email for invite checks
- [ ] Local compose: plain uid bearer works when `AUTH_FALLBACK=true`

## Data and APIs

- `users/{uid}` — [schema](../../03-reference/schema.md)
- `GET /auth/session`, `POST /users/me/bootstrap`, `GET|PATCH /users/me`

## Non-goals

- Custom password vault; social providers beyond configured Firebase
