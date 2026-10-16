# Glossary

| Term | Meaning |
| --- | --- |
| **Organization** | Tenancy root; owns notebooks, org members, org teams |
| **Org member** | ACL identity (`owner` \| `admin` \| `member`) under an org |
| **Org team** | Named ACL group of org members (not notebook branding) |
| **Notebook** | Design notebook summary: folders, phases, access mode, branding |
| **Notebook members (roster)** | Credits list (name/role/photo); may lack app accounts |
| **Entry** | One design entry; **metadata** in Firestore; TipTap/Yjs in GCS |
| **Folder** | Tree node in `notebook.folders`; entries have `folderId` |
| **explorerOrder** | Sibling order in the file explorer within a folder |
| **order** | Same-day tiebreaker for calendar / compile sequence (with `date`) |
| **Phase** | Project phase id on an entry; defined on notebook `phases` map |
| **Asset** | Binary (image) metadata in Firestore; bytes in GCS |
| **Invite** | Pending org membership (`expiresAt`, email, role) |
| **Collab document** | Hocuspocus name `org:{orgId}:notebook:{notebookId}:entry:{entryId}` |
| **BYOK** | Bring-your-own-key GenAI; key stays in browser localStorage |
| **LWW** | Last-write-wins ZIP import (backup, not sync) |
| **service_admin** | Platform role for `/admin` and elevated ops |
