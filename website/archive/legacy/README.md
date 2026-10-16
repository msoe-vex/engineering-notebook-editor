# Legacy archive (unreachable)

Historical local/GitHub editor UI and store kept for context only. **Do not import these modules from the live app.**

Excluded from TypeScript via `website/tsconfig.json` (`exclude: ["archive"]`).

## Live product

- Routes: `website/src/app/(app)/`
- Chrome / workspace: `website/src/components/cloud/`
- Thin cloud state: `website/src/lib/cloud/workspaceState.ts` (+ `workspaceBridge.ts`)
- Editor toolbar: `website/src/components/editor/NotebookFormatToolbar.tsx`
- Shared UI: `website/src/components/ui/`

## Contents

| Path | Replaced by |
| --- | --- |
| `components/App.tsx`, `Sidebar.tsx` | `AppChrome` + App Router |
| `components/pages/Home.tsx`, `WelcomePage.tsx` | `/` org list |
| `components/pages/TeamEditor.tsx` | Setup phases + Members roster |
| `components/pages/NotebookCompiler.tsx` | `CloudNotebookCompiler` |
| `components/editor/Editor.tsx` | Collab editor + `NotebookFormatToolbar` |
| `components/workspace/*`, `sidebar/*` | `NotebookEntryList` + schedule |
| `components/cloud/CloudNotebookSidebar.tsx` | Never mounted; superseded by `NotebookShell` |
| `lib/store/`, `lib/github/`, `lib/storage/`, `hooks/useWorkspace.ts` | `workspaceState` + cloud APIs |
| GitHub / ZIP decision dialogs, overlays | Cloud ZIP via overflow (`zipV5`) |
| `tests/transferImport.test.ts` | Legacy import helpers |

## Product rules

- Do not reintroduce GitHub / local FS as live sync
- Offline bridges: LWW ZIP only (`zipV5.ts`)
