# NFR-reliability: Reliability & data integrity

Status: current  
Related: [FR-notebooks](../features/FR-notebooks.md), [FR-entries-collab](../features/FR-entries-collab.md), [FR-zip](../features/FR-zip.md)

## Requirement

- Notebook/org delete removes Firestore children **and** related GCS objects (TipTap, Yjs, assets, exports, audits).
- Image insert uses server-returned asset id; `assetIds` / `usedBy` stay consistent.
- Collab flush eventually persists Yjs; website mirrors TipTap JSON after sync. Clients tolerate brief TipTap lag behind Yjs.
- ZIP import is LWW and remaps assets without corrupting unrelated notebooks.

## Current implementation

Cascade delete in Core; asset ID fix in collab editor; `workspaceState` densify; zipV5 remapping.

## Verification

- Smoke: insert image → reload; delete notebook → GCS objects gone
- Smoke: ZIP round-trip — [smoke-tests](../../04-guides/smoke-tests.md)

## Gaps

- Explicit RPO/RTO SLOs for production not yet published
- Collab flush lag observability — [monitoring](../../05-ops/monitoring.md)
