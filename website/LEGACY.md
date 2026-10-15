# Legacy (unreachable) editor stack

The product path is **`/`** with App Router folders (`/orgs/…/notebooks/…/entries/…`): Firebase Auth, Firestore metadata, GCS blobs, Hocuspocus realtime.

**Do not use legacy shells as the design source.** Shared UI lives in `src/components/ui/` (Button, PageHeader, Dialog, etc.) and cloud chrome in `AppChrome` / `NotebookShell`.

The following still exist in the tree for reference / gradual deletion but are **not routed**:

- `src/components/App.tsx`, `pages/Home.tsx`, `WelcomePage.tsx`, `ProjectHeader.tsx`
- `src/lib/github/`, `src/lib/store/`, `src/lib/storage/` (local FS + GitHub sync)
- Classic TipTap workspace / GitHub pending commits

Some legacy components are **reused** inside cloud (ActivityBar, FileExplorer, TeamEditor, CalendarView, SettingsPage, Editor toolbar) but should adopt `components/ui` patterns over time.

`/cloud/*` and `/workspace/*` redirect to `/`. GitHub OAuth API (`/api/auth/github`) has been removed.

**Do not** reintroduce GitHub/S3/local FS as live sync backends. Future offline bridges should be LWW ZIP push/pull only, after cloud is hardened.

ZIP backup on cloud notebooks: Export ZIP / Import ZIP via the workspace overflow menu (`zipV5.ts`).
