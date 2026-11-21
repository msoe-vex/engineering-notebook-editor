# FR-public-notebook: Notebook share link (PDF)

Status: done  

Related: [FR-notebooks](./FR-notebooks.md), [FR-compile](./FR-compile.md), [FR-org-public-page](./FR-org-public-page.md), [roadmap](../../00-product/roadmap.md), [tenancy-acl](../../02-architecture/tenancy-acl.md), [schema](../../03-reference/schema.md), [api-contracts](../../03-reference/api-contracts.md)

## Summary

Share a **stable link** that serves the notebook’s **compiled PDF** (no HTML wrapper, no live TipTap). Default remains private. Compiles keep up to **10** versioned PDFs; at the limit, delete a version before compiling again. Share / revoke and version delete live on the **Compile** page.

Visitors never need GCS credentials: **`/o/:orgSlug/n/:notebookKey`** (website) proxies bytes from Core `GET /public/o/…/pdf`, which reads storage server-side.

## Actors and permissions

| Actor | Can publish / revoke | Can open link |
| --- | --- | --- |
| Org owner / admin | yes | yes |
| Anonymous / signed-out visitor | no | yes when link sharing is on |
| Org member without publish right | no | via normal ACL; share link optional |

## User-facing behavior

- **Compile** page: preview versions; **Share** / **Turn off** / copy link; delete saved versions (max 10)
- Share URL: **`/o/:orgSlug/n/:notebookKey`** → PDF stream (website → Core → storage)
- Visibility is link-only (`publicAccess: "unlisted"`). Legacy `"public"` is accepted and stored as `"unlisted"`. No separate listed/SEO mode for notebooks.

## Acceptance criteria

- [x] Unpublished notebooks are not reachable via old links after revoke
- [x] Share URL serves the PDF via Core proxy (no public TipTap / wrapper page; no raw GCS redirect for visitors)
- [x] `notebookKey` unique within the org
- [x] `publishedAt` / `publishedBy` recorded for admins; cleared on revoke
- [x] Up to 10 compile exports retained; compile refused at the limit until a version is deleted
- [x] Saved versions can be deleted (deleting the shared one turns the link off)
- [x] Core `GET …/pdf` streams bytes by default; `?json=1` returns a storage/signed `{ url }` for tooling only

## Data and APIs

- Notebook: `publicAccess` (`off`|`unlisted`), `publicKey`, `latestExportId`, `publicExportId`, `publishedAt`, `publishedBy`
- `compileExports/{id}` metadata + object-store PDFs; `DELETE …/exports/:exportId`
- Public: website route proxies Core stream — [api-contracts](../../03-reference/api-contracts.md)

## Non-goals

- Public write collaboration
- Listing published notebooks on the org marketing page (could return later)
- Unlimited compile history (hard cap: 10 versions)
- Handing visitors raw bucket / signed GCS URLs as the share target
