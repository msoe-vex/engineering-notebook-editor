# Collaboration service

Hocuspocus + Yjs WebSocket service for real-time notebook entry editing.

Document names: `org:{orgId}:notebook:{notebookId}:entry:{entryId}`.  
Debounced flush → Core `POST /internal/collab/flush`.

- Contracts: [docs/api-contracts.md](../../docs/api-contracts.md)
- Local testing: [docs/local-development.md](../../docs/local-development.md)

```bash
npm install && npm run dev
```

Port **1234**. Set `COLLAB_AUTH_DISABLED=true` only for local smoke (Compose does this).
