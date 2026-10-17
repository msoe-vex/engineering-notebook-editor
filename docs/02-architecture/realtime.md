# Realtime collaboration

Related: [FR-entries-collab](../01-requirements/features/FR-entries-collab.md), [api-contracts](../03-reference/api-contracts.md), [cloud UX plan Epic E](../01-requirements/plans/cloud-ux-hardening.md).

## Two channels

| Concern | Transport | Service | Store |
| --- | --- | --- | --- |
| Entry **body** (TipTap) | Hocuspocus / Yjs WSS | Collab | GCS (flush via Core) |
| Entry / notebook **metadata** | Core SSE (`GET …/notebooks/:id/events`) | Core | Firestore |

Website does **not** open Firestore listeners. Collab does **not** own metadata fanout.

## Document naming (body)

```
org:{orgId}:notebook:{notebookId}:entry:{entryId}
```

## Body flow

```mermaid
sequenceDiagram
  participant Browser
  participant Collab as Collab_Hocuspocus
  participant Core
  participant GCS
  Browser->>Collab: WSS + auth token
  Collab->>Collab: Authorize notebook access
  Browser->>Collab: Yjs updates
  Collab->>Core: POST /internal/collab/flush
  Core->>GCS: TipTap JSON and/or Yjs blob
```

## Metadata flow

```mermaid
sequenceDiagram
  participant Browser
  participant Core
  participant FS as Firestore
  Browser->>Core: GET .../events (SSE + Bearer)
  Browser->>Core: PATCH entry / notebook
  Core->>FS: write
  Core-->>Browser: SSE entry.upserted / notebook.updated / entries.changed
  Note over Browser: NotebookShell applies delta (or refresh on entries.changed)
```

Core authorizes the SSE subscription the same way as REST (`canAccessNotebook`). Events are notebook-scoped. Website uses `fetch` + stream parser (EventSource cannot set `Authorization`).

## Notes

- Debounced flush from Collab → Core
- TipTap JSON written when real JSON supplied; Yjs always may persist
- Website densifies metadata for calendar/settings via `workspaceState` (not legacy store); today refreshed by full fetch — push replaces that for multi-client freshness
- Local smoke may set `COLLAB_AUTH_DISABLED=true` — never in production
