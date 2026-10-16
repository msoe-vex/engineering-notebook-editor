# FR-account: Profile and Preferences

Status: current  
Related: [ADR-003](../../02-architecture/decisions/ADR-003-byok-keys-local.md)

## Summary

`/account` is a two-pane shell: **Profile** (identity) and **Preferences** (theme, default authors, GenAI). Non-secrets sync via `PATCH /users/me`; API keys stay local. Distinct from notebook **Settings**.

## Actors and permissions

Signed-in user (own profile only).

## User-facing behavior

- Account menu: Profile, Preferences, Sign out (Admin if `service_admin`)
- **Profile** — display name / email (session); Firebase link where needed
- **Preferences** (`/account/preferences`) — theme light/dark/system; default authors; GenAI enable, provider, model, base URL, API key (local)

## Acceptance criteria

- [ ] Second browser session hydrates theme/authors/provider without re-entering keys
- [ ] Preferences payload never includes API keys
- [ ] Local keys still work for GenAI after hydrate
- [ ] No nested page header under AppChrome (chrome owns title)

## Data and APIs

- `users/{uid}.preferences` — [schema](../../03-reference/schema.md)
- `PATCH /users/me`

## Non-goals

- Cross-user preference admin; org-wide GenAI policy UI (future)
