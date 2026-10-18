# FR-orgs: Organizations, people, invites, teams

Status: current  
Related: [tenancy-acl](../../02-architecture/tenancy-acl.md), [schema](../../03-reference/schema.md)

## Summary

Organizations are the tenancy root. Admins manage members, email invites (with expiry), and ACL **teams**.

## Actors and permissions

| Role | Org CRUD | Members / invites | Teams |
| --- | --- | --- | --- |
| owner / admin | yes | yes | yes |
| member | read notebooks (ACL permitting) | no | no |

## User-facing behavior

- `/` — list/create orgs; org rows support right-click / ⋯ (Open, People, Rename/Delete when allowed)
- `/orgs/:orgId/people` — members + invites; single **Invite** opens a modal (email or account id + role); right-click / ⋯ for change role, remove, copy/renew/revoke invite
- `/orgs/:orgId/teams` — ACL groups; expand a team to search-add org people and remove via chips; right-click / ⋯ (show people, Rename, Delete)
- Invite create sets `expiresAt` (default 14 days); accept rejects expired and email mismatch when both emails present

## Acceptance criteria

- [ ] Create org makes creator owner/admin member
- [ ] Invite accept joins org; second accept fails; expired invite fails
- [ ] Team membership can grant notebook access in restricted mode

## Data and APIs

- `organizations/{orgId}`, `members/{uid}`, `teams/…`, `invites/{id}`
- Routes under `/orgs`, `/invites/:id/accept` — [api-contracts](../../03-reference/api-contracts.md)

## Non-goals

- Billing; multi-org SSO federation beyond Firebase
