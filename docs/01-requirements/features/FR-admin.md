# FR-admin: Platform admin

Status: current  
Related: [NFR-security](../quality/NFR-security.md)

## Summary

`/admin` for `service_admin` users: metrics snapshot, user list/grants, org overview.

## Actors and permissions

Only `platformRole === service_admin` (local: `SERVICE_ADMIN_UID`).

## User-facing behavior

- Metrics cards
- Users: patch grants / roles as implemented
- Orgs listing

## Acceptance criteria

- [ ] Non-admin cannot load admin APIs (403)
- [ ] `service-admin` local uid can open `/admin`

## Data and APIs

- `GET /api/admin/metrics`, users, orgs
- Metrics currently in-memory in Core (see backlog)

## Non-goals

- Full customer support CRM
