# FR-public-notebook: Notebook share link (PDF)

Status: done  

Related: [FR-notebooks](./FR-notebooks.md), [FR-compile](./FR-compile.md), [FR-org-public-page](./FR-org-public-page.md), [roadmap](../../00-product/roadmap.md), [tenancy-acl](../../02-architecture/tenancy-acl.md), [schema](../../03-reference/schema.md), [api-contracts](../../03-reference/api-contracts.md)

## Summary

Share a **stable link** that serves the notebook’s **compiled PDF** (no HTML wrapper, no live TipTap). Default remains private. Compiles keep at most the **latest** PDF and the **currently shared** PDF; older non-shared compiles are pruned. Admins can delete either saved version.

Visitors never need GCS credentials: **`/o/:orgSlug/n/:notebookKey`** (website) proxies bytes from Core `GET /public/o/…/pdf`, which reads storage server-side.

## Actors and permissions

| Actor | Can publish / revoke | Can open link |
| --- | --- | --- |
| Org owner / admin | yes | yes |
| Anonymous / signed-out visitor | no | yes when link sharing is on |
| Org member without publish right | no | via normal ACL; share link optional |

## User-facing behavior

- **Compile** page: preview latest / shared PDFs; **Share this PDF** / **Turn off**; delete saved versions
- Notebook **Settings**: Off | Anyone with the link (shortcut); prefer Compile for which PDF is bound
- Share URL: **`/o/:orgSlug/n/:notebookKey`** → PDF stream (website → Core → storage)
- Visibility is link-only (`publicAccess: "unlisted"`). Legacy `"public"` is accepted and stored as `"unlisted"`. No separate listed/SEO mode for notebooks.

## Acceptance criteria

- [x] Unpublished notebooks are not reachable via old links after revoke
- [x] Share URL serves the PDF via Core proxy (no public TipTap / wrapper page; no raw GCS redirect for visitors)
- [x] `notebookKey` unique within the org
- [x] `publishedAt` / `publishedBy` recorded for admins; cleared on revoke
- [x] At most latest + shared compile exports retained; others pruned on compile
- [x] Saved versions can be deleted (deleting the shared one turns the link off)
- [x] Core `GET …/pdf` streams bytes by default; `?json=1` returns a storage/signed `{ url }` for tooling only

## Data and APIs

- Notebook: `publicAccess` (`off`|`unlisted`), `publicKey`, `latestExportId`, `publicExportId`, `publishedAt`, `publishedBy`
- `compileExports/{id}` metadata + object-store PDFs; `DELETE …/exports/:exportId`
- Public: website route proxies Core stream — [api-contracts](../../03-reference/api-contracts.md)

## Non-goals

- Public write collaboration
- Listing published notebooks on the org marketing page (could return later)
- Keeping a full compile history
- Handing visitors raw bucket / signed GCS URLs as the share target
