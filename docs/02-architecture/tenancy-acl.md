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

## Invites

Create as org admin → `expiresAt` (default 14d) → accept checks expiry + email match when both present.
