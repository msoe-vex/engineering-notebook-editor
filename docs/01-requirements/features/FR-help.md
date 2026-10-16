# FR-help: Help & About

Status: current  

## Summary

In-app Help and About content linked from AppChrome.

## Actors and permissions

Signed-in users (same chrome).

## User-facing behavior

- `/help/[[...tab]]` — markdown help content
- `/about` — product about page
- Nav icons in AppChrome

## Acceptance criteria

- [ ] Help and About reachable from chrome without leaving auth shell
- [ ] Help tabs resolve content under `public/content/help` (or equivalent)

## Data and APIs

Static content; no Core schema.

## Non-goals

- Embedded support chat
