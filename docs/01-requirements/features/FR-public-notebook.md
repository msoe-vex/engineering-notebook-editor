# FR-public-notebook: Public notebook share link

Status: planned  
Related: [FR-notebooks](./FR-notebooks.md), [roadmap](../../00-product/roadmap.md), [tenancy-acl](../../02-architecture/tenancy-acl.md)

## Summary

Allow publishing a **read-only public (or unlisted) link** to a notebook so outsiders (judges, mentors, alumni, recruiters) can view content without becoming org members. Default remains private.

## Actors and permissions

| Actor | Can publish / revoke | Can view via link |
| --- | --- | --- |
| Org owner / admin | yes | yes |
| Notebook editor (TBD exact role) | yes if granted | yes |
| Anonymous / signed-out visitor | no | yes when link is public or they have the unlisted URL |
| Org member without publish right | no | yes via normal ACL; public link optional |

## User-facing behavior

- Notebook **Settings**: toggle “Public link” / “Anyone with the link” / Off
- Copy share URL (slug or opaque token)
- Public view: read-only explorer + entry render (no collab write, no Settings)
- Revoke regenerates or disables the token

## Acceptance criteria

- [ ] Unpublished notebooks are not reachable via old links after revoke
- [ ] Public view never exposes org People invites, admin APIs, or other notebooks
- [ ] Restricted-mode notebooks still require an explicit publish action
- [ ] Audit: who published / revoked is recorded (admin-visible)

## Data and APIs

- Notebook fields e.g. `publicAccess: "off" | "unlisted" | "public"`, `publicSlug` / `publicToken`, `publishedAt`
- Public GET routes (no org membership) — details in [api-contracts](../../03-reference/api-contracts.md) when implemented

## Non-goals

- Public **write** collaboration
- SEO indexing of unlisted links (robots/noindex for unlisted)
- Publishing a single entry without the notebook (follow-up)

## Open questions / risks

- PDF compile on public view: allow download of last compiled PDF only vs live compile  
- Whether entry bodies use a frozen snapshot or live read of GCS
