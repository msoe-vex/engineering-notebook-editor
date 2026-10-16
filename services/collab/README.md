# Collaboration service

Hocuspocus + Yjs WebSocket service for real-time notebook entry editing.

Document names: `org:{orgId}:notebook:{notebookId}:entry:{entryId}`.  
Debounced flush → Core `POST /internal/collab/flush`.

- Contracts: [docs/03-reference/api-contracts.md](../../docs/03-reference/api-contracts.md)
- Local testing: [docs/04-guides/local-development.md](../../docs/04-guides/local-development.md)
- Realtime: [docs/02-architecture/realtime.md](../../docs/02-architecture/realtime.md)

```bash
npm install && npm run dev
```

Port **1234**. Set `COLLAB_AUTH_DISABLED=true` only for local smoke (Compose does this).
