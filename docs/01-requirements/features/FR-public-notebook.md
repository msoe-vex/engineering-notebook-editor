# FR-public-notebook: Public notebook share link

Status: partial  

Related: [FR-notebooks](./FR-notebooks.md), [FR-org-public-page](./FR-org-public-page.md), [roadmap](../../00-product/roadmap.md), [tenancy-acl](../../02-architecture/tenancy-acl.md), [schema](../../03-reference/schema.md)

## Summary

Allow sharing a **link that opens the notebook’s compiled PDF directly** (no HTML wrapper). Default remains private. Compiles keep at most the **latest** PDF and the **currently shared** PDF; older non-shared compiles are pruned. Admins can delete either saved version.

## Actors and permissions

| Actor | Can publish / revoke | Can open link |
| --- | --- | --- |
| Org owner / admin | yes | yes |
| Anonymous / signed-out visitor | no | yes when link sharing is on |
| Org member without publish right | no | via normal ACL; share link optional |

## User-facing behavior

- **Compile** page: preview latest / shared PDFs; **Share this PDF** / **Turn off**; delete saved versions
- Notebook **Settings**: Off | Anyone with the link (shortcut); prefer Compile for which PDF is bound
- Share URL: **`/o/:orgSlug/n/:notebookKey`** → redirects to a signed PDF URL
- Visibility is link-only (`unlisted`). Legacy `public` is accepted and stored as `unlisted`. There is no separate “listed on org site / SEO” mode for notebooks.

## Acceptance criteria

- [x] Unpublished notebooks are not reachable via old links after revoke
- [x] Share URL redirects to the PDF (no public TipTap / wrapper page)
- [x] `notebookKey` unique within the org
- [x] `publishedAt` / `publishedBy` recorded for admins; cleared on revoke
- [x] At most latest + shared compile exports retained; others pruned on compile
- [x] Saved versions can be deleted (deleting the shared one turns the link off)

## Data and APIs

- Notebook: `publicAccess` (`off`|`unlisted`), `publicKey`, `latestExportId`, `publicExportId`, …
- `compileExports/{id}` + GCS PDFs; `DELETE …/exports/:exportId`
- See [schema](../../03-reference/schema.md), [api-contracts](../../03-reference/api-contracts.md)

## Non-goals

- Public write collaboration
- Listing published notebooks on the org marketing page (could return later)
- Keeping a full compile history
