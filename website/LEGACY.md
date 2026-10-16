# Legacy editor stack

The product path is **`/`** with App Router folders (`/orgs/…/notebooks/…/entries/…`): Firebase Auth, Firestore metadata, GCS blobs, Hocuspocus realtime.

**Do not use the legacy shell as the design source.** Shared UI lives in `src/components/ui/` and cloud chrome in `AppChrome` / `NotebookShell`.

## Archive

Unreachable local/GitHub UI **and** the old workspace singleton (`lib/store`, `lib/github`, `lib/storage`, `useWorkspace`, classic `Editor.tsx`) live under [`archive/legacy/`](./archive/legacy/) (outside `src/`, excluded from `tsc`). See that README for the file map.

Live cloud state: [`src/lib/cloud/workspaceState.ts`](./src/lib/cloud/workspaceState.ts).

## Still in `src/` (shared with cloud)

- `CalendarView`, `SettingsPage`, `HelpPage`, `AboutPage` (wired to App Router)
- Confirmation / TextPrompt dialogs
- `RichTextArea`, `NotebookFormatToolbar`, TipTap node views
- Notebook/latex/genai helpers (used by cloud compile and editor)

## Product rules

- `/cloud/*` and `/workspace/*` redirect to `/`
- GitHub OAuth API (`/api/auth/github`) has been removed
- **Do not** reintroduce GitHub / S3 / local FS as live sync backends
- Future offline bridges: LWW ZIP push/pull only (`zipV5.ts` via workspace overflow)
