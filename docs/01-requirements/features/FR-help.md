# FR-help: Help & About

Status: current  

## Summary

In-app Help and About content linked from AppChrome, plus a skippable first-run product tour.

## Actors and permissions

Public (anonymous visitors and signed-in users; Help and About do not require sign-in). Product tour runs for signed-in users only.

## User-facing behavior

- `/help/[[...tab]]` — markdown help content (accessible without signing in)
- Cloud-oriented tabs: Getting Started, Orgs & access, Editor, Compile & PDF, Design phases, Generative AI, Judge, Backup & ZIP, Account & security, Tips, Resources
- Legacy `/help/local`, `/help/github`, `/help/modes` redirect to current topics
- `/about` — product about page aligned with cloud collaboration (not local-only claims)
- AppChrome header provides direct links + "Sign in" when unauthenticated; Help, About, and Report Issue in the account menu when signed in
- First-run **product tour** (skippable; localStorage); **Replay tutorial** from Help sidebar / Getting Started
- "Report Issue" links to the project's GitHub issues from sign-in, home footer, Help sidebar, About footer, and AppChrome

## Acceptance criteria

- [x] Help and About reachable without signing in
- [x] Help and About reachable from chrome without leaving auth shell
- [x] Report Issue button available across headers, footers, and menus
- [x] Help tabs resolve content under `public/content/help` (cloud product copy)
- [x] Legacy local/github/modes routes redirect to current help topics
- [x] First-run tour is skippable; replayable from Help

## Data and APIs

Static markdown under `website/public/content/help`; tour state in `localStorage` (`ene:onboarding:v1`).

## Non-goals

- Embedded support chat
- Heavy third-party tour libraries
