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

- [x] Set an explicit Core `bodyLimit` (**64 MiB** global — covers raw image inserts, logos, and compiled PDF exports that share the same Fastify limit). Document in [env-vars](../../03-reference/env-vars.md) if configurable.
- [x] Document max upload size in [api-contracts](../../03-reference/api-contracts.md) Assets section.
- [x] Client: preflight check compressed byte size vs limit; refuse with toast before upload.
- [x] Client: surface 413 / network failures via toast (Epic B); do not silently skip insert.
- [x] Stream binary `PUT` through Core → GCS (`putObjectStream`) instead of buffering the full body; keep modular Core/`StoragePort` boundary (no browser→GCS).
- [ ] Optional later: extract a dedicated upload microservice if Core upload I/O becomes a scale bottleneck.

### Acceptance

- [x] JPEG/PNG under the documented limit insert and reload correctly. *(toolbar path now compresses like drag/drop)*
- [x] Over-limit files show a clear error; no silent failure.
- [ ] Core logs no unexpected 413 for files within the configured limit. *(verify after Core restart)*

### Legacy / code anchors

- Upload: `CollaborativeEntryEditor.tsx`, `website/src/lib/cloud/api.ts` (`createAsset`, `uploadAssetContent`)
- Core: `services/core/src/routes/orgs.ts` (binary parsers + asset routes)
- Compress: `website/src/lib/utils.ts`

---

## Epic B — Toasts & action feedback (P1)

### Problem

`<Toaster />` from `react-hot-toast` is mounted in `AppChrome`, but almost nothing calls `toast()`. Legacy `SHOW_NOTIFICATION` / `Notification.tsx` bridge lives only under archive. Editor emits (`GenerateButton`, `ImageNodeView`) go nowhere.

### Work

- [x] Add a small cloud helper (`showNotification` or `toast.*` wrappers) wired from `SHOW_NOTIFICATION` **and** direct calls.
- [x] Toast on: asset upload fail (entry images, logo, contributor photo); GenAI via existing `SHOW_NOTIFICATION` emits.
- [x] Toast on: metadata save fail, reorder fail, ZIP import/export, Settings save, Share dialog.
- [x] Keep inline `Alert` for persistent validation; use toasts for transient outcomes.
- [x] Match duration / position already set in AppChrome; restyled Notification card restored under `components/overlays/`.

### Acceptance

- [x] Failed image upload always shows a toast.
- [x] At least one success toast path exists for a common action (logo / photo upload / ZIP / Share).

---

## Epic C — Phase icons & colors everywhere (P1)

### Problem

Calendar already shows phase color + icon. Explorer uses a **color dot** + generic `FileText`. Entry header uses `PhaseChip` when set but a plain `<select>` of names for picking. Legacy used the phase Lucide icon as the row/file icon and a colored phase menu.

### Work

- [x] Explorer rows: use phase icon + color as the entry glyph when a phase is set; keep a distinct glyph for templates (Epic H) and unphased entries.
- [x] Entry header phase control: icon+color in closed state and in options (`PhasePicker`).
- [x] Filters / chips: phase filter still uses `PhaseChip`.
- [ ] Audit other surfaces (compile list, search results if any) for the same helper (`getPhaseConfig`).

### Acceptance

- [x] With starter phases configured, explorer and entry header show recognizable icons/colors without opening a menu.
- [x] Calendar behavior unchanged (already correct).

---

## Epic D — Split LaTeX + live preview (P1)

### Problem

Cloud entry page toggles Edit **or** LaTeX full-bleed. LaTeX is generated on demand and does not update while typing. Legacy had `editor | split | preview` via `ViewToggle` + resizable panels, with `previewLatex` derived live from title/authors/phase/date/content.

### Work

- [x] Reuse `ViewToggle` on the entry page: editor / split / latex.
- [x] Split: resizable panels (`PanelGroup`); collapse/expand by mode.
- [x] Live LaTeX source in split/latex modes from current metadata + editor JSON via `onDocChange`.
- [ ] Debounce heavy work if needed; do not block typing.
- [ ] Amend [FR-compile](../features/FR-compile.md) acceptance: split + live source preview on entry page.

### Acceptance

- [x] Typing in the editor updates the LaTeX pane without leaving split mode.
- [x] Edit-only and latex-only modes still work.

---

## Epic E — Metadata sync & saving indicator (P1)

### Problem

Body collab is realtime (Yjs). Header/sidebar metadata go through `patchEntry` + full `refresh()`. Multi-client (and even multi-panel) updates feel stale. `savingMeta` disables controls but shows **no** “Saving… / Saved” affordance (legacy `ProjectHeader` did).

### Work

- [x] Visible save state on entry header: Idle → Saving → Saved / Error (and optionally for notebook settings).
- [x] Optimistic local update of title/authors/phase/date in workspace state **before** refresh completes so sidebar/header do not flash stale values.
- [x] **Metadata realtime via Core SSE** — `GET …/events`; Core publishes on entry/notebook/folder/reorder writes. **Not** browser→Firestore. **Not** Hocuspocus. See [realtime.md](../../02-architecture/realtime.md).
- [x] Debounce title patches (~550 ms) while typing; flush on blur.

### Acceptance

- [x] User sees Saving/Saved when changing date/phase/authors/title.
- [x] Second browser session sees metadata changes without hard refresh (Core SSE).
- [x] Sidebar entry title/phase updates promptly after local edit.

### Decision

Website stays off Firestore. Collab stays CRDT-only. Metadata fanout is a Core concern (ACL + tenancy already live there).

---

## Epic F — Validation refresh when rules change (P1)

### Problem

Open-entry quality re-runs on a 1.2s debounce when content or `metaFingerprint` changes. If the notebook previously had **no phases**, then phases are added in Settings, existing entries should become invalid until a phase is set — but closed entries may keep stale `isValid` / `validationErrors` until individually opened.

### Work

- [x] On notebook `phases` PATCH, Core runs metadata-only revalidation for all entries (`validateEntryMetadataFields` + merge); fans out `entries.changed` / updated fields via SSE.
- [x] Same path covers add/remove/rename of phase set (any `phases` write).
- [x] Explorer incomplete indicators update via SSE `entry.upserted` after revalidation (or `entries.changed` → refresh).
- [x] Per-entry content quality pass remains client-debounced; Core only touches metadata-field errors.

### Acceptance

- [x] Add first phase to a notebook that had none → entries without phase show invalid after Core revalidation + SSE.
- [x] Remove all phases → phase-required errors clear on next revalidation pass.

---

## Epic G — Editor chrome (P1 toolbar, P2 header)

### G1 — Resource blocks covering toolbar (P1)

Selected resource node chrome uses high z-index (`z-100`); sticky format toolbar is `z-10`, so scrolling paints resources over the toolbar.

**Work**

- [x] Fix stacking: selected resource nodes lowered to `z-20`; sticky format toolbar raised to `z-30`.
- [ ] Verify image / code / table / math selected states.

### G2 — Header density & authors width (P2)

Authors `flex-1 min-w-[14rem]` dominates the meta row; native date/phase fields look inconsistent; lots of vertical padding; no collapse.

**Work**

- [ ] Compact meta row: consistent control heights (`h-9`), shared label/field styling, authors capped (e.g. `max-w` / grid columns like legacy).
- [ ] Optional collapse control for meta row (legacy had this).
- [x] Remove redundant phase chip + select if a single control can show both state and picker (`PhasePicker`).

### Acceptance

- [x] Sticky toolbar remains clickable when a resource is selected and scrolled under the header area.
- [x] Authors no longer stretch to dominate the first viewport of the entry page on typical laptop widths (grid layout).

---

## Epic H — Unify templates in explorer + New dropdown (P1)

### Product decision (amend FR-explorer)

**New behavior:** one tree for entries **and** templates (templates get a distinct icon / badge). Remove the separate Templates footer section. **New** control offers:

- Blank entry
- Each template (with phase icon when set)

Creating “from template” remains available from row context menu as today.

### Work

- [x] Amend [FR-explorer](../features/FR-explorer.md): drop “Templates listed separately”; add unified list + New→template menu.
- [x] Fold templates into the main list.
- [x] Implement New dropdown (blank entry, blank template, from each template).
- [x] Ensure calendar still excludes templates; compile behavior unchanged.

### Acceptance

- [x] No separate Templates section required to find or use templates.
- [x] New entry from template is discoverable from the primary New control.

---

## Epic I — Calendar equal day height (P2)

### Problem

CSS aims for equal rows (`grid-template-rows: repeat(6, minmax(0, 1fr))`), but mobile / `auto` / content fallbacks let days grow with event count.

### Work

- [x] Enforce equal day cell height in month (desktop + mobile); week days fixed height on mobile; overflow scrolls inside `.nb-cal-day-list`.
- [x] Muted cells use the same grid track heights.
- [x] Acceptance line added to [FR-schedule](../features/FR-schedule.md).

### Acceptance

- [x] In a month with both empty days and days with many cards, all day cells share the same height; cards scroll inside the cell.

---

## Epic J — Loading skeletons (P2)

### Problem

Pages snap from empty chrome to full content. Spinners/`LoadingBlock` exist but most lists and the entry header lack placeholders.

### Work

- [x] `Skeleton` / `SkeletonLines` UI primitives; notebook shell loading uses explorer+main placeholders.
- [x] Keep `LoadingBlock` label alongside skeletons for route loads.
- [ ] Optional follow-up: calendar grid / org list skeletons when those pages fetch slowly.

### Acceptance

- [x] Opening a notebook shows structured placeholders before data, not a blank hole then pop-in.

---

## Epic K — Share dialog (Google-style ACL UX) (P2)

### Problem

Backend already supports org-open vs restricted + `access.userIds` / `access.teamIds` ([tenancy-acl](../../02-architecture/tenancy-acl.md)). Settings exposes checkboxes — functional but not share-sheet shaped.

### Work

- [x] “Share…” from notebook overflow menu → `ShareNotebookDialog` (search people & teams; entire org vs restricted).
- [x] List current principals with remove chips.
- [x] Do **not** invent link-ACL outside org membership; invites stay on org invites flow.
- [ ] Optional later: per-entry ACL (out of scope unless product asks — would need schema ADR).

### Acceptance

- [x] Admin can grant a single user and a team from one dialog without hunting Settings checkboxes only.
- [ ] Restricted notebook still hidden from non-allowlisted org members ([FR-notebooks](../features/FR-notebooks.md)) — smoke verify.

---

## Epic L — Explorer robustness (P1)

### Work

- [x] Templates participate in the unified tree / folder moves (Epic H).
- [ ] Confirm smoke: create folder → move → reload nested; explorer DnD does not change calendar `order`/`date`.
- [ ] Consider multi-select (shift/ctrl) as stretch — only if low cost.
- [x] Reorder / move API failures: toast + `refresh()` to revert optimistic UI.

### Acceptance

- [ ] FR-explorer acceptance criteria can be checked off with smoke tests.

---

## Additional improvements (recommended)

| Item | Sev | Notes |
| --- | --- | --- |
| Presence avatars on entry (collab awareness) | P2 | **Done** — Hocuspocus awareness initials |
| Soft client image dimension/type validation before compress | P2 | Complements Epic A |
| Entry page keyboard shortcut for view mode | P2 | e.g. legacy-style toggle |
| Notebook list / org pages skeleton + empty states consistency | P2 | **Done** — home + org notebooks |
| Explorer multi-select (Ctrl/Shift) + bulk move/delete | P1 | **Done** |
| Mark FR statuses **partial** where acceptance still open | — | Done for entries/explorer/schedule/compile/notebooks |

---

## Docs updates checklist (when implementing)

| Doc | Update |
| --- | --- |
| [FR-entries-collab](../features/FR-entries-collab.md) | Save indicator, toasts on asset fail, toolbar stacking, header density; status → partial until done |
| [FR-compile](../features/FR-compile.md) | Split + live LaTeX preview |
| [FR-explorer](../features/FR-explorer.md) | Unified templates + New dropdown; phase icons as glyphs |
| [FR-schedule](../features/FR-schedule.md) | Equal day cell height |
| [FR-notebooks](../features/FR-notebooks.md) | Share dialog UX |
| [realtime.md](../../02-architecture/realtime.md) | Body via Collab; metadata via Core SSE (not browser Firestore) |
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
