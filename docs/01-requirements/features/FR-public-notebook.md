# FR-public-notebook: Notebook share links (PDF)

Status: partial  

Related: [FR-notebooks](./FR-notebooks.md), [FR-compile](./FR-compile.md), [FR-org-public-page](./FR-org-public-page.md), [roadmap](../../00-product/roadmap.md), [tenancy-acl](../../02-architecture/tenancy-acl.md), [schema](../../03-reference/schema.md), [api-contracts](../../03-reference/api-contracts.md)

## Summary

Admins create **explicit share links** that each serve one **named compile version** as a PDF (no HTML wrapper, no live TipTap). Links are created, rebound to a different version, or revoked independently — not a single opaque “turn sharing on” toggle.

Visitors never need GCS credentials: **`/o/:orgSlug/n/:key`** (website) proxies bytes from Core `GET /public/o/…/pdf`.

## Actors and permissions

| Actor | Can create / edit / revoke links | Can open link |
| --- | --- | --- |
| Org owner / admin | yes | yes |
| Anonymous / signed-out visitor | no | yes when the link is active |
| Org member without publish right | no | via normal ACL; share link optional |

## User-facing behavior

- **Compile → Versions**: rename versions; delete (max 10)
- **Compile → Links**: create named share links bound to a version; copy / open; change version; revoke
- Share URL: **`/o/:orgSlug/n/:key`** → PDF for that link’s `exportId`
- Keys are unguessable UUIDs (separate from notebook id). Revoking deletes the public key lookup (404).

## Acceptance criteria

- [x] Unpublished / revoked links are not reachable
- [x] Share URL serves the PDF via Core proxy (no public TipTap / wrapper page; no raw GCS redirect for visitors)
- [x] `key` unique within the org and unguessable (full UUID when minted)
- [x] Multiple active share links per notebook; each points at a chosen compile export
- [x] Compile versions can be named (`label`)
- [x] Deleting a version retargets links to the next latest export, or revokes them if none remain
- [x] Legacy single `publicKey` / `publicExportId` migrates to one share link named “Share”
- [x] Core `GET …/pdf` streams bytes by default; `?json=1` returns a storage/signed `{ url }` for tooling only

## Data and APIs

- `shareLinks/{linkId}`: `key`, `name`, `exportId`, `createdAt`, `revokedAt?`
- Org lookup: `publicNotebookKeys/{key}` → `{ notebookId, linkId }`
- `compileExports/{id}` (+ optional `label`); `PATCH …/exports/:exportId` `{ label }`
- `GET/POST …/share-links`, `PATCH/DELETE …/share-links/:linkId`
- Public: website route proxies Core stream — [api-contracts](../../03-reference/api-contracts.md)

## Non-goals

- Public write collaboration
- Listing published notebooks on the org marketing page (could return later)
- Unlimited compile history (hard cap: 10 versions)
- Handing visitors raw bucket / signed GCS URLs as the share target
- Password / expiry on share links (could return later)
