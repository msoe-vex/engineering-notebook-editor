# Tenancy & ACL

Related: [FR-orgs](../01-requirements/features/FR-orgs.md), [FR-notebooks](../01-requirements/features/FR-notebooks.md), [NFR-security](../01-requirements/quality/NFR-security.md).

## Hierarchy

```
users/{uid}
organizations/{orgId}
  members/{uid}          ← org ACL (owner | admin | member)
  teams/{teamId}
    members/{uid}        ← ACL groups
  notebooks/{notebookId}
    members/{memberId}   ← credits roster (not ACL)
    entries|assets|audits
invites/{inviteId}       ← top-level, points at orgId
```

## Notebook access modes

| Mode | Who can open |
| --- | --- |
| Org-open (default) | Any org member |
| Restricted | Explicit user uids and/or org team ids on notebook `access` |

Core `canAccessNotebook` gates list/get and Agents audit routes.

## Distinction

| Concept | Purpose |
| --- | --- |
| Org **members** / **teams** | Application ACL |
| Notebook **members** roster | Printed credits / branding |

## Role hierarchy & ownership
- `owner`: full control over organization, members, teams, invites, notebooks, and org settings. Can appoint or demote other owners. The last remaining owner cannot be demoted or removed.
- `admin`: can manage members (up to admin), invites (up to admin), teams, notebooks, and org settings. Cannot demote or remove owners.
- `member`: baseline access to org notebooks according to notebook ACL.

Membership is strictly stored in `members/{uid}` (no fallback zombie-owner logic).

## Invites & Share codes

Create as org admin or owner → `expiresAt` (default 14d, configurable via `expiresInDays`) → shareable link or code.
- If `email` is specified during creation, acceptance requires the recipient's authenticated email to match and be verified (`emailVerified: true`).
- If `email` is omitted, any authenticated user can redeem the share code / invite link.
- Acceptance never demotes an existing member if their current role rank is higher than the invite's role.
