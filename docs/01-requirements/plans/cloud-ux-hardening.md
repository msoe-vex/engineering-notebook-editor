# Plan: Cloud UX hardening & legacy parity

**Status:** active  
**Created:** 2026-10-17  
**Audience:** engineering + product  
**Related:** [backlog](../backlog.md), [FR index](../README.md), legacy archive [`website/archive/legacy/`](../../../website/archive/legacy/)

Parity epics A–H shipped the cloud shell. This plan closes **regressions and polish gaps** found after dogfooding the live UI against legacy behavior, plus a few deliberate product upgrades (templates UX, share dialog).

When an item ships, update the linked FR acceptance criteria and check it off here. Prefer amending FR docs over duplicating requirements in this file long-term.

---

## Goals

1. Make image upload reliable and visibly fail when it cannot.
2. Restore editor workflows users miss from legacy (split LaTeX, phase icons, save feedback, toasts).
3. Tighten explorer / calendar / header density so the shell feels finished.
4. Keep ACL model (org / team / user allowlists) but present sharing more like a familiar share sheet.
5. Reduce jarring empty→populated loads with skeletons and consistent pending states.

## Non-goals

- Restoring GitHub / local FS / ZIP-as-sync (see [ADR-001](../../02-architecture/decisions/ADR-001-gcp-only-sync.md), [ADR-002](../../02-architecture/decisions/ADR-002-zip-lww-backup.md)).
- TipTap JSON in Firestore; offline-first CRDT without Collab.
- Drive-style link sharing with arbitrary emails outside the org (stay org-scoped).

---

## Priority legend

| Sev | Meaning |
| --- | --- |
| **P0** | Broken core path; fix first |
| **P1** | Clear regression or daily friction |
| **P2** | Polish / density / optional product upgrade |

---

## Epic overview

| Epic | Title | Sev | Primary FR / docs |
| --- | --- | --- | --- |
| A | Asset upload limits & feedback | P0 | [FR-entries-collab](../features/FR-entries-collab.md), [api-contracts](../../03-reference/api-contracts.md) |
| B | Toasts & action feedback | P1 | FR-entries-collab, AppChrome |
| C | Phase icons & colors everywhere | P1 | FR-explorer, FR-entries-collab, FR-schedule |
| D | Split LaTeX + live preview | P1 | [FR-compile](../features/FR-compile.md), FR-entries-collab |
| E | Metadata sync & saving indicator | P1 | FR-entries-collab, [realtime](../../02-architecture/realtime.md) |
| F | Validation refresh on notebook rules | P1 | FR-entries-collab, FR-notebooks |
| G | Editor chrome (toolbar z-index, header density) | P1–P2 | FR-entries-collab |
| H | Explorer: unify templates + New dropdown | P1 | [FR-explorer](../features/FR-explorer.md) *(amend)* |
| I | Calendar equal day height | P2 | [FR-schedule](../features/FR-schedule.md) |
| J | Loading skeletons | P2 | NFR-performance / shell |
| K | Share dialog (Google-style ACL UX) | P2→P1 | [FR-notebooks](../features/FR-notebooks.md), [tenancy-acl](../../02-architecture/tenancy-acl.md) |
| L | Explorer robustness pass | P1 | FR-explorer |

Suggested ship order: **A → B → G(toolbar) → C → E → F → D → H → L → I → J → K**.

---

## Epic A — Asset upload limits & feedback (P0)

### Problem

Core Fastify is constructed with defaults only (`services/core/src/index.ts`). Default `bodyLimit` is **1 MiB**. Browser uploads go through `PUT …/assets/:id/content` as a binary body, so larger images fail with `FST_ERR_CTP_BODY_TOO_LARGE` (413). The editor often only `console.warn`s and never inserts the image.

### Work

- [ ] Set an explicit Core `bodyLimit` (**64 MiB** global — covers raw image inserts, logos, and compiled PDF exports that share the same Fastify limit). Document in [env-vars](../../03-reference/env-vars.md) if configurable.
- [ ] Document max upload size in [api-contracts](../../03-reference/api-contracts.md) Assets section.
- [ ] Client: preflight check compressed byte size vs limit; refuse with toast before upload.
- [ ] Client: surface 413 / network failures via toast (Epic B); do not silently skip insert.
- [ ] Optional follow-up: signed GCS **write** URLs to avoid proxying large bodies through Core (ADR if chosen).

### Acceptance

- JPEG/PNG under the documented limit insert and reload correctly.
- Over-limit files show a clear error; no silent failure.
- Core logs no unexpected 413 for files within the configured limit.

### Legacy / code anchors

- Upload: `CollaborativeEntryEditor.tsx`, `website/src/lib/cloud/api.ts` (`createAsset`, `uploadAssetContent`)
- Core: `services/core/src/routes/orgs.ts` (binary parsers + asset routes)
- Compress: `website/src/lib/utils.ts`

---

## Epic B — Toasts & action feedback (P1)

### Problem

`<Toaster />` from `react-hot-toast` is mounted in `AppChrome`, but almost nothing calls `toast()`. Legacy `SHOW_NOTIFICATION` / `Notification.tsx` bridge lives only under archive. Editor emits (`GenerateButton`, `ImageNodeView`) go nowhere.

### Work

- [ ] Add a small cloud helper (`showNotification` or `toast.*` wrappers) wired from `SHOW_NOTIFICATION` **and** direct calls.
- [ ] Toast on: asset upload success/fail, metadata save fail, reorder fail, ZIP import/export outcomes, GenAI errors, copy-link, access save.
- [ ] Keep inline `Alert` for persistent validation; use toasts for transient outcomes.
- [ ] Match duration / position already set in AppChrome; restyle lightly if needed (no need to revive full legacy Notification UI).

### Acceptance

- Failed image upload always shows a toast.
- At least one success toast path exists for a common action (e.g. “Entry created”, “Access updated”).

---

## Epic C — Phase icons & colors everywhere (P1)

### Problem

Calendar already shows phase color + icon. Explorer uses a **color dot** + generic `FileText`. Entry header uses `PhaseChip` when set but a plain `<select>` of names for picking. Legacy used the phase Lucide icon as the row/file icon and a colored phase menu.

### Work

- [ ] Explorer rows: use phase icon + color as the entry glyph when a phase is set; keep a distinct glyph for templates (Epic H) and unphased entries.
- [ ] Entry header phase control: icon+color in closed state and in options (reuse `PhaseChip` / portal menu patterns from legacy `Editor.tsx`).
- [ ] Filters / chips: prefer icon+color over text-only where space allows.
- [ ] Audit other surfaces (compile list, search results if any) for the same helper (`getPhaseConfig`).

### Acceptance

- With starter phases configured, explorer and entry header show recognizable icons/colors without opening a menu.
- Calendar behavior unchanged (already correct).

---

## Epic D — Split LaTeX + live preview (P1)

### Problem

Cloud entry page toggles Edit **or** LaTeX full-bleed. LaTeX is generated on demand and does not update while typing. Legacy had `editor | split | preview` via `ViewToggle` + resizable panels, with `previewLatex` derived live from title/authors/phase/date/content.

### Work

- [ ] Reuse `ViewToggle` on the entry page: editor / split / latex.
- [ ] Split: resizable panels (`PanelGroup`); double-click divider resets.
- [ ] Live LaTeX source in split/latex modes: `useMemo` (or deferred) from current metadata + editor JSON / text — same generator as `generateCloudEntryLatex`.
- [ ] Debounce heavy work if needed; do not block typing.
- [ ] Amend [FR-compile](../features/FR-compile.md) acceptance: split + live source preview on entry page.

### Acceptance

- Typing in the editor updates the LaTeX pane within a short debounce without leaving split mode.
- Edit-only and latex-only modes still work.

---

## Epic E — Metadata sync & saving indicator (P1)

### Problem

Body collab is realtime (Yjs). Header/sidebar metadata go through `patchEntry` + full `refresh()`. Multi-client (and even multi-panel) updates feel stale. `savingMeta` disables controls but shows **no** “Saving… / Saved” affordance (legacy `ProjectHeader` did).

### Work

- [ ] Visible save state on entry header: Idle → Saving → Saved / Error (and optionally for notebook settings).
- [ ] Optimistic local update of title/authors/phase/date in workspace state **before** refresh completes so sidebar/header do not flash stale values.
- [ ] Prefer Firestore `onSnapshot` (or existing notebook listener) for entry **metadata** list so other clients’ patches appear without manual reload. Document boundary in [realtime.md](../../02-architecture/realtime.md): body = Collab; metadata = Firestore listeners.
- [ ] Avoid full-notebook refetch on every keystroke of title; debounce patches.

### Acceptance

- User sees Saving/Saved when changing date/phase/authors/title.
- Second browser session sees metadata changes without hard refresh (listener or equivalent).
- Sidebar entry title/phase updates promptly after local edit.

---

## Epic F — Validation refresh when rules change (P1)

### Problem

Open-entry quality re-runs on a 1.2s debounce when content or `metaFingerprint` changes. If the notebook previously had **no phases**, then phases are added in Settings, existing entries should become invalid until a phase is set — but closed entries may keep stale `isValid` / `validationErrors` until individually opened.

### Work

- [ ] On notebook phase list create/update/delete (and any other rule that affects `validateEntry`), enqueue a **notebook-scoped revalidation** pass (Core job or client batch `patchEntry` for affected entries).
- [ ] Same when required metadata rules change in a way that flips validity.
- [ ] Explorer incomplete indicators must reflect post-revalidation state after refresh/listener.
- [ ] Keep slow/debounced per-entry updates for content edits; do not block UI.

### Acceptance

- Add first phase to a notebook that had none → entries without phase show invalid (explorer + open entry) without manually editing each body.
- Remove all phases → phase-required errors clear on next revalidation pass.

---

## Epic G — Editor chrome (P1 toolbar, P2 header)

### G1 — Resource blocks covering toolbar (P1)

Selected resource node chrome uses high z-index (`z-100`); sticky format toolbar is `z-10`, so scrolling paints resources over the toolbar.

**Work**

- [ ] Fix stacking: either raise toolbar z-index above node chrome, or stop using elevated z-index on node shells inside the scrollport (prefer legacy layout: toolbar outside scroll region).
- [ ] Verify image / code / table / math selected states.

### G2 — Header density & authors width (P2)

Authors `flex-1 min-w-[14rem]` dominates the meta row; native date/phase fields look inconsistent; lots of vertical padding; no collapse.

**Work**

- [ ] Compact meta row: consistent control heights (`h-9`), shared label/field styling, authors capped (e.g. `max-w` / grid columns like legacy).
- [ ] Optional collapse control for meta row (legacy had this).
- [ ] Remove redundant phase chip + select if a single control can show both state and picker.

### Acceptance

- Sticky toolbar remains clickable when a resource is selected and scrolled under the header area.
- Authors no longer stretch to dominate the first viewport of the entry page on typical laptop widths.

---

## Epic H — Unify templates in explorer + New dropdown (P1)

### Product decision (amend FR-explorer)

**New behavior:** one tree for entries **and** templates (templates get a distinct icon / badge). Remove the separate Templates footer section. **New** control offers:

- Blank entry
- Each template (with phase icon when set)

Creating “from template” remains available from row context menu as today.

### Work

- [ ] Amend [FR-explorer](../features/FR-explorer.md): drop “Templates listed separately”; add unified list + New→template menu.
- [ ] Fold templates into the main list (filter toggle “Templates only” optional).
- [ ] Implement New dropdown (legacy `FileExplorer` New menu is the reference).
- [ ] Ensure calendar still excludes templates; compile behavior unchanged.

### Acceptance

- No separate Templates section required to find or use templates.
- New entry from template is discoverable from the primary New control.

---

## Epic I — Calendar equal day height (P2)

### Problem

CSS aims for equal rows (`grid-template-rows: repeat(6, minmax(0, 1fr))`), but mobile / `auto` / content fallbacks let days grow with event count.

### Work

- [ ] Enforce fixed day cell height in month and week views; overflow scrolls inside `.nb-cal-day-list`.
- [ ] Spacers / muted cells match the same height.
- [ ] Add acceptance line to [FR-schedule](../features/FR-schedule.md).

### Acceptance

- In a month with both empty days and days with many cards, all day cells share the same height; cards scroll inside the cell.

---

## Epic J — Loading skeletons (P2)

### Problem

Pages snap from empty chrome to full content. Spinners/`LoadingBlock` exist but most lists and the entry header lack placeholders.

### Work

- [ ] Skeleton rows for explorer, calendar month grid, org/notebook lists, entry header meta row.
- [ ] Keep `LoadingBlock` for full-route loads; prefer skeletons for in-shell data.
- [ ] Avoid layout shift: reserve header/toolbar height.

### Acceptance

- Opening a notebook and an entry shows structured placeholders for ≥ one paint before data, not a blank hole then pop-in.

---

## Epic K — Share dialog (Google-style ACL UX) (P2)

### Problem

Backend already supports org-open vs restricted + `access.userIds` / `access.teamIds` ([tenancy-acl](../../02-architecture/tenancy-acl.md)). Settings exposes checkboxes — functional but not share-sheet shaped.

### Work

- [ ] “Share” dialog from notebook shell / Settings: search people & teams in the org; set role/access; toggle “Entire org” vs restricted.
- [ ] List current principals with remove; show unresolved clarity (“Org member” vs team name).
- [ ] Do **not** invent link-ACL outside org membership; invites stay on org invites flow.
- [ ] Optional later: per-entry ACL (out of scope unless product asks — would need schema ADR).

### Acceptance

- Admin can grant a single user and a team from one dialog without hunting checkbox lists.
- Restricted notebook still hidden from non-allowlisted org members ([FR-notebooks](../features/FR-notebooks.md)).

---

## Epic L — Explorer robustness (P1)

### Work

- [ ] Harden DnD edge cases (nested folders, drag onto self, empty folders, templates-in-tree after Epic H).
- [ ] Confirm smoke: create folder → move → reload nested; explorer DnD does not change calendar `order`/`date`.
- [ ] Consider multi-select (shift/ctrl) as stretch — only if low cost.
- [ ] Clear empty/error states when API reorder fails (toast + revert optimistic update).

### Acceptance

- FR-explorer acceptance criteria can be checked off with smoke tests.

---

## Additional improvements (recommended)

| Item | Sev | Notes |
| --- | --- | --- |
| Presence avatars on entry (collab awareness) | P2 | Collab already has connections; UI shows Live/Offline only |
| Soft client image dimension/type validation before compress | P2 | Complements Epic A |
| Entry page keyboard shortcut for view mode | P2 | e.g. legacy-style toggle |
| Notebook list / org pages skeleton + empty states consistency | P2 | Part of Epic J |
| Mark FR statuses **partial** where acceptance still open | — | Docs hygiene when this plan starts |

---

## Docs updates checklist (when implementing)

| Doc | Update |
| --- | --- |
| [FR-entries-collab](../features/FR-entries-collab.md) | Save indicator, toasts on asset fail, toolbar stacking, header density; status → partial until done |
| [FR-compile](../features/FR-compile.md) | Split + live LaTeX preview |
| [FR-explorer](../features/FR-explorer.md) | Unified templates + New dropdown; phase icons as glyphs |
| [FR-schedule](../features/FR-schedule.md) | Equal day cell height |
| [FR-notebooks](../features/FR-notebooks.md) | Share dialog UX |
| [realtime.md](../../02-architecture/realtime.md) | Metadata via Firestore listeners vs body via Collab |
| [api-contracts.md](../../03-reference/api-contracts.md) | Asset body size limit |
| [backlog.md](../backlog.md) | Link this plan; trim duplicate polish bullets |

---

## Verification

- Local: image > 1 MiB uploads after Epic A; split LaTeX updates while typing; two browsers see metadata.
- Smoke: extend [smoke-tests](../../04-guides/smoke-tests.md) with upload limit, template New menu, calendar day height, share dialog allowlist.
- Regression: ZIP export/import and BusyTeX compile still pass.

---

## Tracking

Work this list top-down. Prefer small PRs per epic (A alone is fine as a hotfix). Check boxes in this file as epics land; then fold lasting acceptance criteria into the FR docs and leave this plan as historical or mark **Status: done**.
