# NFR-performance: Performance

Status: partial  

## Requirement

- Explorer filters and schedule operate on already-loaded notebook metadata without blocking the editor (client-side).
- BusyTeX compile runs in-browser; UI should show progress steps.
- Asset reads use signed URLs / cache; avoid re-downloading when `assetCache` hit.

## Current implementation

Client filters; BusyTeX status callbacks; `workspaceState.assetCache` for session previews.

## Verification

- Manual: open notebook with 100+ entries — filter remains interactive
- Compile progress UI updates through steps

## Gaps

- No published p95 latency targets for Core list APIs
- Server search / pagination for very large notebooks — [backlog](../backlog.md)
