# FR-help: Help & About

Status: current  

## Summary

In-app Help and About content linked from AppChrome.

## Actors and permissions

Public (anonymous visitors and signed-in users; Help and About do not require sign-in).

## User-facing behavior

- `/help/[[...tab]]` — markdown help content (accessible without signing in)
- `/about` — product about page (accessible without signing in)
- AppChrome header provides direct links + "Sign in" button when unauthenticated, and includes Help, About, and Report Issue in the account menu when signed in.
- "Report Issue" button/link links to the project's GitHub issues page and is accessible from the sign-in screen, the home page footer, Help page sidebar, About page footer, and AppChrome.

## Acceptance criteria

- [x] Help and About reachable without signing in
- [x] Help and About reachable from chrome without leaving auth shell
- [x] Report Issue button available across headers, footers, and menus
- [ ] Help tabs resolve content under `public/content/help` (or equivalent)

## Data and APIs

Static content; no Core schema.

## Non-goals

- Embedded support chat
