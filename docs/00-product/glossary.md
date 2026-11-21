# Glossary

| Term | Meaning |
| --- | --- |
| **Organization** | Tenancy root; owns notebooks, org members, org teams |
| **Org dashboard** | Signed-in management UI: notebooks, People, Teams, settings |
| **Public org page** | Optional public/hidden profile (projects, sponsors, events, media) for outsiders — not the dashboard |
| **Org member** | ACL identity (`owner` \| `admin` \| `member`) under an org |
| **Active / Alumni** | Org member status: active participates; alumni are historical / non-writing (planned) |
| **Org team** | Named ACL group of org members (not notebook branding) |
| **Public notebook link** | Explicit publish of a read-only notebook URL (planned) |
| **Notebook** | Design notebook summary: folders, phases, access mode, branding |
| **Contributors** | Notebook credits list (name/role/photo); may lack app accounts. Distinct from org **People** / ACL members. |
| **Notebook Settings** | Notebook-scoped branding, phases, access (route `/setup`). Distinct from Account **Preferences**. |
| **Calendar** | Date-ordered entry view (route `/schedule`); same-day sequence uses `order`. |
| **Entry** | One design entry; **metadata** in the app metadata store (Firestore adapter today); TipTap/Yjs in object storage (GCS adapter today) |
| **Port / adapter** | Interface Core depends on (`MetadataStore`, `StoragePort`, Identity, `NotificationPort`, …); vendor SDKs live only in adapters |
| **Primary / secondary email** | Primary from IdP; secondaries on user profile, verified before invite matching (planned) |
| **Trash** | Soft-deleted entries (`deletedAt` set); restore or permanent purge |
| **Folder** | Tree node in `notebook.folders`; entries have `folderId` |
| **explorerOrder** | Sibling order in the file explorer within a folder |
| **order** | Same-day tiebreaker for calendar / compile sequence (with `date`) |
| **Phase** | Project phase id on an entry; defined on notebook `phases` map |
| **Asset** | Binary (image) metadata in Firestore; bytes in GCS |
| **Invite** | Pending org membership (`expiresAt`, email, role) |
| **Collab document** | Hocuspocus name `org:{orgId}:notebook:{notebookId}:entry:{entryId}` |
| **BYOK** | Bring-your-own-key GenAI; key stays in browser localStorage |
| **Rubric** | Competition criteria × levels matrix (`RubricMatrix`) stored under a notebook |
| **Judge** | Server job (`type: judge`) that normalizes a rubric or scores a notebook |
| **Judgment** | One past grade for a rubric run (`…/judgments/{id}`) |
| **LWW** | Last-write-wins ZIP import (backup, not sync) |
| **service_admin** | Platform role for `/admin` and elevated ops |
