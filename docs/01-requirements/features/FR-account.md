# FR-account: Account preferences

Status: current  
Related: [ADR-003](../../02-architecture/decisions/ADR-003-byok-keys-local.md)

## Summary

`/account` manages theme, default authors, and GenAI provider/model settings. Non-secrets sync via `PATCH /users/me`; API keys stay local.

## Actors and permissions

Signed-in user (own profile only).

## User-facing behavior

- Theme light/dark/system
- Default authors chips
- GenAI enable, provider, model catalog, base URL, API key (local)

## Acceptance criteria

- [ ] Second browser session hydrates theme/authors/provider without re-entering keys
- [ ] Preferences payload never includes API keys
- [ ] Local keys still work for GenAI after hydrate

## Data and APIs

- `users/{uid}.preferences` — [schema](../../03-reference/schema.md)
- `PATCH /users/me`

## Non-goals

- Cross-user preference admin; org-wide GenAI policy UI (future)
