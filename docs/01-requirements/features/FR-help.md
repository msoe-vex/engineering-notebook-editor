# FR-help: Help & About

Status: current  

## Summary

In-app Help and About content linked from AppChrome.

## Actors and permissions

Signed-in users (same chrome).

## User-facing behavior

- `/help/[[...tab]]` — markdown help content
- `/about` — product about page
- Help and About in the AppChrome account menu (not separate header icons)

## Acceptance criteria

- [x] Help and About reachable from chrome without leaving auth shell
- [ ] Help tabs resolve content under `public/content/help` (or equivalent)

## Data and APIs

Static content; no Core schema.

## Non-goals

- Embedded support chat
