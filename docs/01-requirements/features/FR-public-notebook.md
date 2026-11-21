# FR-public-notebook: Public notebook share link

Status: partial  

Related: [FR-notebooks](./FR-notebooks.md), [FR-org-public-page](./FR-org-public-page.md), [roadmap](../../00-product/roadmap.md), [tenancy-acl](../../02-architecture/tenancy-acl.md), [schema](../../03-reference/schema.md)

## Summary

Allow publishing a **read-only public (or unlisted) link** to a notebook so outsiders (judges, mentors, alumni, recruiters) can view content without becoming org members. Default remains private. Multiple notebooks per org can be published (e.g. season versions) under the same org slug.

## Actors and permissions

| Actor | Can publish / revoke | Can view via link |
| --- | --- | --- |
| Org owner / admin | yes | yes |
| Notebook editor (TBD exact role) | yes if granted | yes |
| Anonymous / signed-out visitor | no | yes when link is public or they have the unlisted URL |
| Org member without publish right | no | yes via normal ACL; public link optional |

## User-facing behavior

- Notebook **Settings**: toggle `off` | `unlisted` | `public`
- Share URL under the org’s public slug:

  **`/o/:orgSlug/n/:notebookKey`**

  where `notebookKey` is a **per-org** public slug (preferred), or opaque token / id fallback. Lets one org publish several notebooks (e.g. `…/n/high-stakes-2025`, `…/n/over-under-2024`) without colliding across orgs.
- Public view: read-only explorer + entry render (no collab write, no Settings)
- Revoke disables access; changing `notebookKey` or regenerating token invalidates old URLs (redirects optional later)
- Unlisted: reachable by URL, `noindex`; not listed on the org public Projects page unless explicitly featured

## Acceptance criteria

- [x] Unpublished notebooks are not reachable via old links after revoke
- [x] Public view never exposes org People invites, admin APIs, or other notebooks
- [x] Restricted-mode notebooks still require an explicit publish action
- [x] `notebookKey` unique within the org; org slug + key resolves to at most one notebook
- [x] Who published is recorded on the notebook (`publishedAt` / `publishedBy`) for **admins only** (settings / GET notebook) — cleared on revoke
- [x] Notebook Settings exposes **Copy public URL** when `publicAccess` ≠ `off` and the org has a slug

## Data and APIs

- Notebook fields: `publicAccess`, `publicKey`, `publishedAt`, `publishedBy` — [schema](../../03-reference/schema.md)
- Public GET under `/o/:orgSlug/n/:notebookKey` — [api-contracts](../../03-reference/api-contracts.md)

## Non-goals

- Public **write** collaboration
- SEO indexing of unlisted links
- Publishing a single entry without the notebook (follow-up)
- Global short `/n/:token` URLs in MVP (optional later alias)
- **Public judgments / publish-revoke history** — Judge grades stay behind notebook ACL; never on `/public/o/…`

## Open questions / risks

- Live GCS read vs frozen publish snapshot (today: live TipTap + last compiled PDF)
