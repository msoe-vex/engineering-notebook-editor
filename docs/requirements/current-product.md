# Current product

Authoritative description of the **live** cloud notebook (App Router). Historical local/GitHub UI and workspace store live in [`website/archive/legacy/`](../../website/archive/legacy/) for context only — see [`website/LEGACY.md`](../../website/LEGACY.md). Live densified metadata uses `workspaceState` (not the archived `@/lib/store`).

Related: [schema.md](../schema.md), [api-contracts.md](../api-contracts.md), [improvement-backlog.md](./improvement-backlog.md).

## Information architecture

```
/                         Organizations (create / open)
/orgs/:orgId              Notebooks + People / Teams tabs
/orgs/:orgId/notebooks/:notebookId
  ├── entries/:entryId    Collaborative TipTap editor
  ├── schedule            Calendar (date + same-day order)
  ├── compile             BusyTeX → PDF export
  ├── setup               Branding, access, phases, logo
  └── members             Credits roster (not org ACL)
/account                  Theme, GenAI prefs (BYOK keys local only)
/help · /about            Help content + about
/admin                    Platform admin (service_admin)
```

Chrome: single `AppChrome` header; notebook workspace uses `NotebookShell` + `NotebookEntryList` (folders, DnD `explorerOrder`, search filters).

## Auth & tenancy

- Firebase Auth (emulator locally); Core validates Bearer tokens
- Orgs with members/roles; optional restricted notebook access (users / teams)
- Invites: `expiresAt` (default 14d); accept checks expiry + email match when both present
- Org **teams** = ACL groups; notebook **members** = credits roster

## Editing & data

- Entry **metadata** in Firestore; TipTap JSON + Yjs + assets in GCS
- Collab: Hocuspocus (`org:…:notebook:…:entry:…`); flush to Core
- Images: upload returns `asset.id` into TipTap; `assetIds` / `usedBy` maintained
- Validation warnings on flush; resources/references extracted when present
- Ordering axes:
  - Explorer: `folderId` + `explorerOrder`
  - Calendar/compile: `date` + `order` (per-day tiebreaker)

## Compile & backup

- Per-entry LaTeX preview; notebook BusyTeX compile uploads `exports/latest.pdf`, sets `lastCompiled`
- ZIP v5 export/import round-trips entries, folders, phases, members, and asset bytes (ID remap on import)
- **Not** a sync backend: LWW on import only

## Account, GenAI, audit

- Non-secret prefs sync via `PATCH /users/me` (theme, authors, GenAI provider/models — **never API keys**)
- Entry title GenAI + image node GenAI when enabled
- Rubric audit (BYOK or grant-gated Vertex) with notebook ACL + history UI

## Non-goals (do not reintroduce as primary sync)

- GitHub commit/pull as live sync
- Local File System Access as live sync
- Storing BYOK keys in Firestore
- Embedding TipTap bodies in Firestore docs
