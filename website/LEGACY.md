# Legacy (unreachable) editor stack

The product path is **`/cloud` only**: Firebase Auth, Firestore metadata, GCS blobs, Hocuspocus realtime.

The following still exist in the tree for reference / gradual deletion but are **not routed**:

- `src/components/App.tsx`, `pages/Home.tsx`, workspace chrome
- `src/lib/github/`, `src/lib/store/`, `src/lib/storage/` (local FS + GitHub sync)
- Classic TipTap workspace / GitHub pending commits

`/` and `/workspace/*` redirect to `/cloud`. GitHub OAuth API (`/api/auth/github`) has been removed.

**Do not** reintroduce GitHub/S3/local FS as live sync backends. Future offline bridges should be LWW ZIP push/pull only, after cloud is hardened.

ZIP backup on cloud notebooks: Export ZIP / Import ZIP on the notebook workspace page (`zipV5.ts`).
