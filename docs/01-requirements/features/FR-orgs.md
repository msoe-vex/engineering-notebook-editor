# FR-orgs: Organizations, people, invites, teams

Status: current (alumni / public profile: planned)  
Related: [tenancy-acl](../../02-architecture/tenancy-acl.md), [schema](../../03-reference/schema.md), [FR-org-public-page](./FR-org-public-page.md), [roadmap](../../00-product/roadmap.md)

## Summary

Organizations are the tenancy root. Admins manage members, email invites (with expiry), and ACL **teams**.

**Planned:** split People into **Active** vs **Alumni**, and optionally drive a separate [public org page](./FR-org-public-page.md) (distinct from the signed-in org dashboard).

## Actors and permissions

| Role / status | Org CRUD | Members / invites | Teams | Notebook write |
| --- | --- | --- | --- | --- |
| owner (active) | yes | yes (all roles, including owner management) | yes | ACL permitting |
| admin (active) | yes (non-destructive) | yes (admin/member roles only) | yes | ACL permitting |
| member (active) | no | no | no | ACL permitting |
| alumni | no | no | no | no (read optional / policy TBD) |

## User-facing behavior

- `/` — list/create orgs; org rows support right-click / ⋯ (Open, People, Rename/Delete when allowed)
- `/orgs/:orgId` — **dashboard**: notebooks + nav to People / Teams (management). Public marketing site is **`/o/:orgSlug`**, not this path — [FR-org-public-page](./FR-org-public-page.md)
- `/orgs/:orgId/public` — admin editor / preview for the public page (planned)
- `/orgs/:orgId/people` — members + invites; share code / invite link generator with role selection (member/admin, and owner if caller is owner), configurable expiration (7, 14, 30, 90 days), and optional email restriction; right-click / ⋯ for change role, remove, copy/renew/revoke invite; **Active** vs **Alumni** sections (planned)
- `/orgs/:orgId/teams` — ACL groups; expand a team to search-add org people and remove via chips; right-click / ⋯ (show people, Rename, Delete)
- Invites / Share codes: generate an invite link / share code with `expiresAt`. If email is specified, accept enforces email match; if omitted, any authenticated user can join. Accepts preserve higher existing role ranks (owner/admin not demoted).
- Multiple owners: Orgs can have multiple owners. Only owners can promote, invite, or demote/remove owners. A last-owner guard prevents demoting or removing the sole remaining owner.
- Mark member as alumni (and reactivate) without deleting history (planned)

## Acceptance criteria

- [x] Create org makes creator owner member
- [x] Multiple owners supported; last remaining owner cannot be removed or demoted
- [x] Share codes work without email restriction, or with email restriction if specified
- [x] Invite accept joins org; second accept fails; expired/revoked invite fails; existing higher roles are preserved
- [x] Invite `status` (`pending` \| `accepted` \| `revoked`); revoke soft-sets `revoked` instead of hard-delete
- [x] Team membership can grant notebook access in restricted mode
- [x] Alumni are listed separately from active members in People UI
- [x] Alumni cannot mutate notebooks or org ACL (exact read policy documented when shipped)

## Data and APIs

- `organizations/{orgId}`, `members/{uid}`, `teams/…`, `invites/{id}`
- Member field planned: `status: "active" | "alumni"` (and optional `alumniAt`)
- Routes under `/orgs`, `/invites/:id/accept` — [api-contracts](../../03-reference/api-contracts.md)

## Non-goals

- Billing; multi-org SSO federation beyond Firebase
- Using “alumni” as a substitute for notebook **Contributors** credits ([FR-notebooks](./FR-notebooks.md))
