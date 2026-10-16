# Architecture overview

**Live storage:** Firestore + GCS on GCP only. **Realtime:** Hocuspocus/Yjs.  
**Not used for sync:** GitHub, local FS, S3 (ZIP backup only; LWW — [ADR-001](./decisions/ADR-001-gcp-only-sync.md), [ADR-002](./decisions/ADR-002-zip-lww-backup.md)).

- Docs index: [../README.md](../README.md)
- Local testing: [../04-guides/local-development.md](../04-guides/local-development.md)
- API: [../03-reference/api-contracts.md](../03-reference/api-contracts.md)
- Schema: [../03-reference/schema.md](../03-reference/schema.md)
- Requirements: [../01-requirements/](../01-requirements/)
- ACL: [tenancy-acl.md](./tenancy-acl.md) · Realtime: [realtime.md](./realtime.md)

## Services

| Service | Role | Port |
| --- | --- | --- |
| [`website/`](../../website/README.md) | App UI at `/` (+ ZIP backup) | 3000 |
| [`services/core/`](../../services/core/README.md) | Auth, tenancy, metadata, assets, BusyTeX | 8080 |
| [`services/collab/`](../../services/collab/README.md) | Yjs rooms → flush to Core/GCS | 1234 |
| [`services/agents/`](../../services/agents/README.md) | Rubric audit BYOK / Vertex grant | 8000 |

```mermaid
flowchart TB
  Client["website /"]
  Client -->|REST| Core
  Client -->|WSS| Collab
  Client -->|REST| Agents
  Client -->|ZIP file| Zip["Export / import v5"]
  Core --> Auth["Firebase Auth"]
  Core --> FS["Firestore"]
  Core --> GCS["GCS"]
  Collab --> Core
  Agents --> FS
```

## Data

| Data | Store |
| --- | --- |
| Users, orgs, members, entry metadata | Firestore |
| TipTap JSON, Yjs, binaries, BusyTeX | GCS |
| Concurrent editing | Yjs over WSS |

## Production

[`infra/cloudrun/deploy.sh`](../../infra/cloudrun/deploy.sh) — see [deploy-cloudrun.md](../04-guides/deploy-cloudrun.md).
