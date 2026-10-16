# NFR-accessibility: Accessibility

Status: partial  

## Requirement

- Interactive controls have accessible names (icon buttons `aria-label`).
- Focus order remains usable in chrome, explorer, and dialogs.
- Target: improve toward WCAG 2.2 AA for primary flows (auth, open notebook, edit, compile).

## Current implementation

Shared `IconButton` / dialogs; AppChrome nav labels; not fully audited.

## Verification

- Keyboard: open schedule, move focus through entry list, invoke New entry
- Screen reader smoke on Help/Account (manual)

## Gaps

- Formal a11y audit and automated axe CI not yet required
