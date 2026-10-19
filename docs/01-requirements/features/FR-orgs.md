# FR-orgs: Organizations, people, invites, teams

Status: current  
Related: [tenancy-acl](../../02-architecture/tenancy-acl.md), [schema](../../03-reference/schema.md)

## Summary

Organizations are the tenancy root. Admins manage members, email invites (with expiry), and ACL **teams**.

## Actors and permissions

| Role | Org CRUD | Members / invites | Teams |
| --- | --- | --- | --- |
| owner | yes | yes (all roles, including owner management) | yes |
| admin | yes (non-destructive) | yes (admin/member roles only) | yes |
| member | read notebooks (ACL permitting) | no | no |

## User-facing behavior

- `/` — list/create orgs; org rows support right-click / ⋯ (Open, People, Rename/Delete when allowed)
- `/orgs/:orgId/people` — members + invites; share code / invite link generator with role selection (member/admin, and owner if caller is owner), configurable expiration (7, 14, 30, 90 days), and optional email restriction; right-click / ⋯ for change role, remove, copy/renew/revoke invite
- `/orgs/:orgId/teams` — ACL groups; expand a team to search-add org people and remove via chips; right-click / ⋯ (show people, Rename, Delete)
- Invites / Share codes: generate an invite link / share code with `expiresAt`. If email is specified, accept enforces email match; if omitted, any authenticated user can join. Accepts preserve higher existing role ranks (owner/admin not demoted).
- Multiple owners: Orgs can have multiple owners. Only owners can promote, invite, or demote/remove owners. A last-owner guard prevents demoting or removing the sole remaining owner.

## Acceptance criteria

- [ ] Create org makes creator owner member
- [ ] Multiple owners supported; last remaining owner cannot be removed or demoted
- [ ] Share codes work without email restriction, or with email restriction if specified
- [ ] Invite accept joins org; second accept fails; expired invite fails; existing higher roles are preserved
- [ ] Team membership can grant notebook access in restricted mode

## Data and APIs

- `organizations/{orgId}`, `members/{uid}`, `teams/…`, `invites/{id}`
- Routes under `/orgs`, `/invites/:id/accept` — [api-contracts](../../03-reference/api-contracts.md)

## Non-goals

- Billing; multi-org SSO federation beyond Firebase
