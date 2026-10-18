# Plan: Mobile-responsive shell

**Status:** active  
**Created:** 2026-10-17  
**Audience:** engineering + product  
**Related:** [backlog](../backlog.md), [NFR-responsive](../quality/NFR-responsive.md), [NFR-accessibility](../quality/NFR-accessibility.md), [cloud-ux-hardening](./cloud-ux-hardening.md) (Epic G chrome), FR-explorer / FR-entries-collab / FR-schedule / FR-compile / FR-notebooks / FR-orgs / FR-account / FR-help

Desktop cloud shell is usable; narrow viewports are not first-class. Legacy had explicit mobile paths (hide split, auto-collapse explorer). This plan makes **all signed-in surfaces** usable on phone and small tablet without a separate mobile app.

When an item ships, update the linked FR/NFR acceptance criteria and check it off here.

---

## Goals

1. Primary flows work on a ~375×667 CSS viewport: sign-in, org/notebook lists, open entry, edit body, calendar glance, compile kickoff, share, account/help.
2. One responsive shell — no parallel “mobile site”; breakpoints and layout modes only.
3. Touch-first targets (≥44×44px where primary), no horizontal page scroll, internal panes scroll intentionally.
4. Settle **notebook section nav** placement (Entries / Calendar / Compile / Contributors / Settings) as part of chrome, not an afterthought.

## Non-goals

- Native iOS/Android apps or PWA install campaign.
- Offline-first editing on flaky mobile networks (collab may degrade; document behavior).
- Pixel-perfect parity of every desktop density affordance (split LaTeX, wide explorer drag-reorder) when a simpler mobile mode is clearer.
- Redesigning brand/marketing About beyond “readable and scrollable.”

---

## Priority legend

| Sev | Meaning |
| --- | --- |
| **P0** | Broken / unusable on phone for a core path |
| **P1** | Usable but awkward; daily friction |
| **P2** | Polish, density, nice-to-have gestures |

---

## Product decision — notebook section tabs

**Question:** Should Entries / Calendar / Compile / Contributors / Settings live in the global AppChrome row (current after chrome consolidation)?

**Recommendation: no — not as the long-term home on desktop or mobile.**

| Placement | Pros | Cons |
| --- | --- | --- |
| **A. Inline in AppChrome** (current desktop) | One fewer horizontal band; feels “consolidated” | Competes with breadcrumbs + status + menus; wraps/hides early; mixes *global* chrome with *notebook* IA |
| **B. Slim secondary strip** under AppChrome (previous pattern, tightened) | Clear IA: global vs notebook; always visible on laptop; easy to scan | Uses ~36–40px vertical space |
| **C. Bottom tab bar** (mobile / narrow) | Thumb reach; standard app pattern; frees top for breadcrumbs + account | Desktop bottom tabs feel odd; needs icon+label set |
| **D. Explorer-adjacent / overflow only** | Minimal chrome | Compile / Calendar / Settings become undiscoverable |

**Decision to implement (this plan):**

1. **≥ `md`:** **B** — restore a **slim** notebook section strip under AppChrome (compact pills, single row, no extra padding stack). Keep Help/About/Admin in the account menu; keep Connected/Saving lean.
2. **&lt; `md`:** **C** — **bottom tab bar** for the five notebook sections when inside a notebook workspace. Top bar stays: logo, truncated breadcrumbs, account/overflow.
3. Do **not** leave primary section nav only in a “Sections” dropdown on phone (current narrow fallback) — that fails discoverability.

Amend [FR-notebooks](../features/FR-notebooks.md) acceptance when this lands.

---

## Breakpoints (working contract)

Align with Tailwind defaults unless a surface documents otherwise:

| Name | Width | Shell behavior |
| --- | --- | --- |
| **phone** | &lt; 768px (`md`) | Bottom notebook tabs; explorer as overlay/drawer; no split editor+preview; single-column org/account |
| **tablet** | 768–1023px | Optional side-by-side where useful; section strip (B); explorer collapsible |
| **desktop** | ≥ 1024px (`lg`) | Current dense layouts; resizable explorer; split view allowed |

Shared hook: prefer one `useViewportMode()` (or CSS-first with rare JS) — calendar already uses `matchMedia`; consolidate rather than invent per-page MQs.

---

## Epic overview

| Epic | Title | Sev | Primary docs |
| --- | --- | --- | --- |
| M0 | Audit & smoke matrix | P0 | NFR-responsive, [smoke-tests](../../04-guides/smoke-tests.md) |
| M1 | AppChrome + notebook section nav | P0 | FR-notebooks, FR-help, cloud-ux G2 |
| M2 | Explorer as mobile drawer | P0 | FR-explorer |
| M3 | Entry editor mobile mode | P0 | FR-entries-collab |
| M4 | Calendar / Compile / Settings / Contributors | P1 | FR-schedule, FR-compile, FR-notebooks |
| M5 | Org / home / account / help / admin | P1 | FR-orgs, FR-account, FR-help, FR-admin |
| M6 | Touch, safe areas, a11y pass | P2 | NFR-accessibility, NFR-responsive |

Suggested ship order: **M0 → M1 → M2 → M3 → M4 → M5 → M6**.

---

## Epic M0 — Audit & smoke matrix (P0)

### Problem

No written checklist of what “works on mobile” means; regressions will be invisible.

### Work

- [x] Add a **Mobile** section to [smoke-tests.md](../../04-guides/smoke-tests.md): DevTools iPhone SE / Pixel 5 widths, or real device.
- [ ] Capture baseline screenshots or short notes for: home, org, notebook entries, open entry, calendar, compile, members, setup, account, help.
- [ ] List known breakages (horizontal overflow, untappable controls, explorer stuck open, split view forced, etc.).

### Acceptance

- [x] Smoke doc lists mobile paths and pass/fail columns.
- [ ] Plan epics below map 1:1 to failures found (amend if needed).

---

## Epic M1 — AppChrome + notebook section nav (P0)

### Problem

Top-right chrome was dense; section tabs were folded into AppChrome. On narrow screens they collapse to a dropdown; on medium they fight breadcrumbs.

### Work

- [x] Implement product decision above: **slim strip ≥ md**, **bottom tab bar &lt; md** inside notebook workspace.
- [x] Bottom tabs: icon + short label; active state; `safe-area-inset-bottom` padding.
- [x] Truncate breadcrumbs on phone (Home + notebook); keep Home reachable.
- [x] Ensure account menu still reaches Help / About / Admin / Preferences.
- [x] Bottom tabs sit outside the scroll pane (shell flex column) so content is not covered.

### Acceptance

- [x] Phone: five notebook destinations reachable in one tap from bottom tabs.
- [x] Desktop: section nav visible without opening a menu; AppChrome row not wrapping into two lines at 1280px.
- [x] FR-notebooks / FR-help criteria updated.

---

## Epic M2 — Explorer as mobile drawer (P0)

### Problem

`PanelGroup` explorer + entry side-by-side does not fit phones. Legacy auto-collapsed the sidebar on navigate.

### Work

- [x] &lt; `md`: explorer is an **overlay drawer** (or full-screen list), not a persistent split pane.
- [x] Opening an entry closes the drawer; explicit control to reopen (list icon in entry chrome or bottom-tab “Entries” focusing list).
- [x] Preserve collapsed preference for tablet/desktop `Panel` layout.
- [ ] Touch-friendly row height; context menus position within viewport.

### Acceptance

- [x] On phone, user can browse entries then edit full-width without a squeezed dual pane.
- [x] Returning to Entries tab/list works without dead ends.

---

## Epic M3 — Entry editor mobile mode (P0)

### Problem

Entry header (title + date/phase/authors) + format toolbar + body; split LaTeX; horizontal PanelGroup — cramped or unscrolled (scroll fixed separately for desktop).

### Work

- [x] &lt; `md`: force view mode **editor | preview** only (no split); mirror legacy `isMobile && viewMode === "split"` behavior.
- [x] Stack or collapse entry meta (optional disclosure for date/phase/authors) so body gets viewport.
- [x] Format toolbar: horizontal scroll with sticky top; larger tap targets on narrow viewports.
- [x] Confirm body `overflow-y-auto` chain still works with bottom tab bar inset.
- [x] Entry header meta toggles via chevron only (no auto-collapse on scroll).
- [ ] Soft keyboard: avoid focused inputs jumping under chrome (visual viewport / `scrollIntoView` smoke).

### Acceptance

- [x] Phone: edit text, insert basic marks, toggle preview, save metadata without horizontal page scroll.
- [x] Split control hidden or no-ops to editor on phone.
- [x] Chevron toggles date/phase/authors without losing the title row.

---

## Epic M4 — Calendar / Compile / Contributors / Settings (P1)

### Problem

Calendar already has a mobile week mode; other notebook sections are desktop-first.

### Work

- [x] **Calendar:** week mode already on narrow; day overflow scrolls in cell (prior UX hardening).
- [x] **Compile:** stack controls; PDF preview usable; primary CTA always visible.
- [x] **Contributors / Settings:** single-column friendly; member row actions grouped; Settings already stacked.
- [x] Share dialog: usable on narrow width (search + lists scroll).

### Acceptance

- [x] Each section passes mobile smoke without horizontal overflow or unreachable primary actions.

---

## Epic M5 — Org / home / account / help / admin (P1)

### Problem

List pages and account shell may assume wide cards / side nav.

### Work

- [x] Home + org notebook lists: ListRow / single-column grid (already responsive).
- [x] Org people / teams / invites: stacked layouts via existing page shells.
- [x] AccountShell: side nav becomes horizontal tabs on phone; tighter padding.
- [x] Help: existing drawer + scroll panes; About remains full-page scroll.
- [ ] Admin: readable tables or card list; no requirement for complex admin workflows on phone beyond “view + basic actions.”

### Acceptance

- [x] Smoke matrix rows for these routes pass on phone width (manual — see smoke-tests Mobile).

---

## Epic M6 — Touch, safe areas, a11y (P2)

### Work

- [x] `env(safe-area-inset-*)` on notebook bottom tabs.
- [ ] Prefer `pointer: coarse` tweaks where hover-only UI exists.
- [x] Focus order with bottom tabs + drawer; `aria-current` on section tabs.
- [ ] Cross-check [NFR-accessibility](../quality/NFR-accessibility.md) gaps that mobile surfaces.

### Acceptance

- [x] Notched-device smoke (simulator): tabs and CTAs clear the home indicator.
- [ ] Keyboard still usable when bottom tabs present.

---

## Out of scope / later

- Pinch-zoom customization inside TipTap.
- Mobile-specific GenAI UX.
- App store wrappers.

---

## Doc updates when shipping

| Doc | Update |
| --- | --- |
| [NFR-responsive](../quality/NFR-responsive.md) | Status → partial/current; fill verification |
| [FR-notebooks](../features/FR-notebooks.md) | Section nav placement (strip + bottom tabs) |
| [FR-explorer](../features/FR-explorer.md) | Mobile drawer behavior |
| [FR-entries-collab](../features/FR-entries-collab.md) | No split on phone; meta collapse if shipped |
| [FR-schedule](../features/FR-schedule.md) | Confirm mobile week as required |
| [smoke-tests.md](../../04-guides/smoke-tests.md) | Mobile matrix |
| [backlog.md](../backlog.md) / requirements [README](../README.md) | Link this plan |

---

## Context / anchors

- AppChrome: `website/src/components/cloud/AppChrome.tsx`
- Notebook shell / explorer: `NotebookShell.tsx`, `NotebookEntryList.tsx`
- Entry page: `…/entries/[entryId]/page.tsx`, `CollaborativeEntryEditor.tsx`, `ViewToggle.tsx`
- Calendar mobile MQ: `CalendarView.tsx` (`useMobileCalendarLayout`)
- Legacy reference: `website/archive/legacy/components/App.tsx` (collapse sidebar on navigate; disable split on mobile)
