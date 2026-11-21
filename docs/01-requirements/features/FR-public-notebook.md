# FR-public-notebook: Public notebook share link

Status: partial  

Related: [FR-notebooks](./FR-notebooks.md), [FR-org-public-page](./FR-org-public-page.md), [roadmap](../../00-product/roadmap.md), [tenancy-acl](../../02-architecture/tenancy-acl.md), [schema](../../03-reference/schema.md)

## Summary

Allow publishing a **read-only public (or unlisted) link** to a notebook’s **compiled PDF** so outsiders (judges, mentors, alumni, recruiters) can view a fixed export without becoming org members. Default remains private. Multiple notebooks per org can be published under the same org slug. Compiles create versioned PDFs; admins choose which version is public.

## Actors and permissions

| Actor | Can publish / revoke | Can view via link |
| --- | --- | --- |
| Org owner / admin | yes | yes |
| Notebook editor (TBD exact role) | yes if granted | yes |
| Anonymous / signed-out visitor | no | yes when link is public or they have the unlisted URL |
| Org member without publish right | no | yes via normal ACL; public link optional |

## User-facing behavior

- **Compile** page: list PDF versions with preview; publish selected version as `off` | `unlisted` | `public`
- Notebook **Settings**: visibility shortcut + Copy link (publishing a specific version is on Compile)
- Share URL under the org’s public slug:

  **`/o/:orgSlug/n/:notebookKey`**

  where `notebookKey` is a **per-org** public slug (preferred), or opaque token / id fallback.
- Public view: **PDF only** (embed + download). No live TipTap entries, no collab, no Settings.
- Revoke disables access; changing `notebookKey` invalidates old URLs
- Unlisted: reachable by URL, `noindex`

## Acceptance criteria

- [x] Unpublished notebooks are not reachable via old links after revoke
- [x] Public view never exposes org People invites, admin APIs, or other notebooks
- [x] Restricted-mode notebooks still require an explicit publish action
- [x] `notebookKey` unique within the org; org slug + key resolves to at most one notebook
- [x] Who published is recorded on the notebook (`publishedAt` / `publishedBy`) for **admins only** (settings / GET notebook) — cleared on revoke
- [x] Notebook Settings exposes **Copy public URL** when `publicAccess` ≠ `off` and the org has a slug
- [x] Public page serves the compiled PDF for `publicExportId` (fallback: latest compile)
- [x] Compile page lists versions with preview and can publish a selected version
- [x] Public entry TipTap routes return not found (PDF-only)

## Data and APIs

- Notebook fields: `publicAccess`, `publicKey`, `publishedAt`, `publishedBy`, `latestExportId`, `publicExportId` — [schema](../../03-reference/schema.md)
- `compileExports/{exportId}` metadata + GCS `exports/{exportId}.pdf` (+ `latest.pdf` alias)
- Public GET under `/o/:orgSlug/n/:notebookKey` — [api-contracts](../../03-reference/api-contracts.md)

## Non-goals

- Public **write** collaboration
- SEO indexing of unlisted links
- Publishing a single entry without the notebook
- Global short `/n/:token` URLs in MVP (optional later alias)
- **Public judgments / publish-revoke history** — Judge grades stay behind notebook ACL; never on `/public/o/…`

## Open questions / risks

- Optional labels / notes per compile version
- Auto-republish latest on each compile (currently sticky `publicExportId`)
