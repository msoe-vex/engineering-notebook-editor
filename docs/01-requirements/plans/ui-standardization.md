# Plan: UI standardization & simplification

Status: done  


Related: [cloud-ux-hardening](./cloud-ux-hardening.md), [mobile-responsive](./mobile-responsive.md), [FR-notebooks](../features/FR-notebooks.md), [FR-compile](../features/FR-compile.md), [FR-public-notebook](../features/FR-public-notebook.md)

## Goals

1. **One interaction kit** — buttons, inputs, selects, toggles, chips, menus, dialogs come from `website/src/components/ui` (or thin wrappers), not ad-hoc Tailwind.
2. **Entries explorer as the visual reference** — density, collapse, list rows, icon buttons, and chrome for Compile / Judge sidebars match Entries.
3. **Quieter copy** — strip developer/explanation prose; keep short action labels and errors only.
4. **Consistent media UX** — one pattern for add / replace / remove images (org + notebook + CMS + People).
5. **Confirmations** — replace `window.confirm` with `ConfirmationDialog` / workspace `showConfirm`.
6. **Org tabs with icons** — same language as notebook section nav.

Non-goals: redesign the design tokens / brand; pixel-clone every page; big animation pass.

## North star (Entries)

Borrow from `NotebookEntryList` + notebook shell explorer:

| Pattern | Entries today | Apply to |
| --- | --- | --- |
| Collapsible left rail | `Panel` + collapse control (`PanelLeft` / `PanelLeftClose`) | Compile versions, Judge rubrics/grades |
| Dense list rows | hover, selected, trailing icon actions | Compile versions, Judge lists, org catalog rows |
| Icon + text primary actions | `Button` / `IconButton` from UI kit | Settings headers, CMS, Share |
| Quiet helper text | mostly absent | Compile share, Settings public, CMS |

## Inventory (current gaps)

**Exists in `components/ui`:** `Button`, `IconButton`, `TextField`, `Dialog`, `DropdownMenu`, `ContextMenu`, `TabNav`, `Badge`/`RoleChip`, `Alert`, `Card`/`ListRow`, `EmptyState`, …

**Missing / inconsistently reinvented:**

| Need | Today | Target |
| --- | --- | --- |
| `Select` / `NativeSelect` | raw `<select className="rounded-nb-lg…">` in Settings, People, Setup | `Select` in UI kit |
| `Checkbox` / `Switch` | raw `<input type="checkbox">` in Settings sections, catalog, comments | `Checkbox` + `Switch` |
| `Chip` / dismissible pill | ad-hoc rounded-full spans | extend `Badge` or add `Chip` |
| `TextArea` | raw `<textarea>` in comments / CMS | `TextArea` |
| `FormSection` | ad-hoc `<section>` + h2/h3 | `FormSection` (title, optional description, children) |
| `SettingsTabs` or section anchors | long single-scroll Settings | tabs or sticky section nav |
| `ImageField` | Camera + hidden file input duplicated (org logo, notebook logo, People, catalog) | shared `ImageField` |
| `NotebookSideRail` | Compile/Judge fixed `aside`; Entries uses resizable Panel | shared collapsible rail |

**Confirmations still on `window.confirm`:** notebook Setup leave-guard; Compile delete version; audit for others.

## Copy cleanup (do early / continuously)

Remove or rewrite user-facing “how it works” copy, e.g.:

- Compile: short labels for versions / share links (**Latest**, **Copy**, **Revoke**, **New share link**) — no architecture narration
- Settings public blocks: long URL explanations → one line max or none when controls are clear
- Org Settings section intros that restate the tab name

Rule: **label the control; don’t narrate the architecture.** Keep warnings that prevent data loss.

## Epic A — UI kit completion

1. Add primitives to `website/src/components/ui` (+ export from `index.ts`):
   - `Select`, `Checkbox`, `Switch`, `TextArea`, `Chip`
   - `FormSection` / `FormRow`
   - `ImageField` (preview, Upload/Replace, optional Remove; accepts `onUpload(file)`, busy, disabled)
2. Document usage in a short `website/src/components/ui/README.md` (variants, when to use Dialog vs ConfirmationDialog).
3. Codemod / sweep high-traffic surfaces to use kit only (Settings, People, Teams, Setup, Compile, Catalog, Comments).

**Exit:** no new raw `<select>` / checkbox / camera-upload blocks outside the kit; grep clean for common ad-hoc class clusters on those controls.

## Epic B — Side rails (Entries / Compile / Judge)

Extract `NotebookSideRail`:

- Collapsible (persist preference per notebook + surface, e.g. `localStorage`)
- Optional resize (Entries keeps resize; Compile/Judge can start fixed width then opt into same Panel API)
- Header slot + scrollable body + footer actions slot
- Match Entries list row / icon button styling

Wire:

1. Entries — wrap existing explorer (behavior preserved)
2. Compile — versions list + share actions in rail footer
3. Judge — rubrics/grades list in same chrome

**Exit:** all three collapse the same way; visual parity with Entries list density.

## Epic C — Settings IA

**Org Settings** and **Notebook Setup** are long single columns.

1. Split into tabs or sticky subnav (pick one pattern for both):
   - Org: **General** (name) · **Public site** (slug, visibility, logo, announcement, about, CTA, sections) · **Social** · **Danger**
   - Notebook: **General** · **Access** · **Share link** · **Archive / Delete**
2. Each block uses `FormSection`; primary save stays obvious (sticky save bar if dirty — optional stretch).
3. Prefer Compile for “which PDF is shared”; Setup share tab is Off/On + copy link only.

**Exit:** Settings scannable without scrolling past unrelated danger zones; copy minimal.

## Epic D — Images everywhere

`ImageField` covers:

| Surface | Asset API |
| --- | --- |
| Org logo | `createOrgAsset` |
| Notebook logo | `createAsset` |
| People photo | org asset + `patchMember` |
| Catalog item image | org asset + catalog upsert |
| Editor/entry images | existing editor flow (don’t break TipTap); align *button/preview* chrome only if cheap |

Same labels: **Upload** / **Replace** / **Remove**; same preview size tokens; same error toasts.

## Epic E — Confirmations & destructive actions

1. Replace remaining `window.confirm` with `ConfirmationDialog` (or shell `showConfirm` when inside notebook).
2. Destructive catalog/compile/judge actions always go through the dialog (confirm text for org delete already OK).
3. Leave-guards: custom dialog, not browser confirm, where feasible.

## Epic F — Org tab icons

Extend `TabNav` `TabItem` with optional `icon?: ReactNode` (Lucide, size 14–16).

Suggested mapping:

| Tab | Icon |
| --- | --- |
| Notebooks | `BookOpen` |
| Teams | `UsersRound` |
| People | `Users` |
| Donors | `Handshake` / `Heart` |
| Projects | `Rocket` / `Wrench` |
| Events | `Calendar` |
| Settings | `Settings` |

Match notebook bottom/strip icon weight (outline, not filled).

## Epic G — Type rename: drop `V5` suffix (recommended)

### Recommendation

**Yes — remove `V5` from day-to-day type names.** Keep the **numeric schema version**.

| Keep | Change |
| --- | --- |
| `NOTEBOOK_SCHEMA_VERSION = 5` on stored docs / ZIP | `NotebookSummaryV5` → `NotebookSummary` |
| `migrateNotebookV4ToV5`, `EntryMetadataV4` in `migrate.ts` | `EntryMetadataV5` → `EntryMetadata` |
| Docs “schema v5” as the current revision label | `NotebookExportV5` → `NotebookExport` |

**Why this is best practice:** version suffixes on types freeze every call site when you bump to v6. The version belongs on the **document** (`schemaVersion: 5`), not in every TypeScript name. Migration helpers stay versioned because they are historical.

**How:**

1. In `@engineering-notebook/shared`, introduce aliases then rename:
   ```ts
   export type NotebookSummary = NotebookSummaryV5; // then delete V5 name
   ```
2. Update Core + website imports; collapse duplicate `NotebookSummary` in `website/src/lib/cloud/api.ts` toward shared types where practical.
3. No Firestore migration — field names unchanged.

**Do not** bump to schema v6 just for the rename.

## Implementation order

| Slice | Effort | Delivers |
| --- | --- | --- |
| 0. Copy pass (Compile, Settings, share) | S | Quieter UI immediately |
| 1. Epic A kit + sweep Settings/People | M | Standard controls |
| 2. Epic F org tab icons | S | Quick win |
| 3. Epic D `ImageField` | M | Consistent media |
| 4. Epic E confirmations | S | No native confirms |
| 5. Epic B side rails | L | Entries/Compile/Judge parity |
| 6. Epic C Settings tabs | M | Scannable settings |
| 7. Epic G V5 rename | M | Cleaner types (can parallelize late) |

Prefer **vertical slices** (kit → adopt on one page → next page) over a big-bang rewrite.

## Acceptance checklist

- [x] UI kit covers Select, Checkbox/Switch, TextArea, Chip, FormSection, ImageField
- [x] Org + notebook Settings use sections/tabs; danger zone isolated
- [x] Entries, Compile, Judge share collapsible side-rail behavior/look
- [x] Image add/replace/remove looks the same on logo, People, CMS
- [x] No `window.confirm` in product flows
- [x] Org `TabNav` shows icons
- [x] Dev/architecture helper sentences removed from user chrome
- [x] Shared types drop `V5` suffix; `schemaVersion` remains `5` (v4 import still lifts embedded `team` inside `migrate.ts` only)

## Out of scope

- Public marketing site visual redesign
- New design-token palette
- Renaming Firestore collections or bumping schema version
