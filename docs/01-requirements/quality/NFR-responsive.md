# NFR-responsive: Responsive & mobile usability

Status: partial  
Related: [plan: mobile-responsive](../plans/mobile-responsive.md), [NFR-accessibility](./NFR-accessibility.md), FR-notebooks, FR-explorer, FR-entries-collab, FR-schedule

## Requirement

- Primary signed-in flows are usable on a phone-width viewport (~375px CSS) without horizontal page scrolling.
- Touch targets for primary actions are large enough for coarse pointers (aim ≥44×44px CSS).
- Fixed chrome (top bar, notebook bottom tabs on narrow) respects `safe-area-inset-*` and does not permanently cover focused content.
- Layout modes follow the breakpoint contract in the [mobile plan](../plans/mobile-responsive.md) (phone / tablet / desktop).

## Current implementation

- `useNarrowViewport()` (`max-width: 767px`) shared hook.
- Notebook section nav: slim strip ≥ `md`; bottom tab bar &lt; `md` with `safe-area-inset-bottom`.
- Explorer: full-screen list or overlay drawer on phone; resizable `PanelGroup` on larger viewports.
- Entry editor: no split on phone; meta toggles via chevron; body `overflow-y-auto`.
- Format toolbar: horizontal pan; larger tap targets below `md`.
- Calendar week mode on narrow (existing `matchMedia`).
- Compile / Share / Account shells tuned for narrow widths.

## Verification

- Manual smoke matrix in [smoke-tests.md](../../04-guides/smoke-tests.md) (Mobile section).
- Spot-check iOS Safari and Chrome Android (or DevTools device mode) for home → notebook → entry → calendar → compile.

## Gaps

Soft-keyboard chrome, admin table density, coarse-pointer DnD polish — see [plans/mobile-responsive.md](../plans/mobile-responsive.md) M3/M5/M6 leftovers. Backlog: [backlog.md](../backlog.md).
