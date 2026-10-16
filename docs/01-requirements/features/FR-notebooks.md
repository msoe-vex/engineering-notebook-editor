# FR-notebooks: Notebooks, setup, roster, access

Status: current  
Related: [FR-orgs](./FR-orgs.md), [tenancy-acl](../../02-architecture/tenancy-acl.md)

## Summary

Notebooks live under an org. Setup controls branding, phases, logo, and access mode. **Members** is a credits roster (distinct from org ACL).

## Actors and permissions

- Org members with notebook access (open org mode or restricted allowlist / teams)
- Setup/members edits: users who can PATCH the notebook (typically org admin + access)

## User-facing behavior

- `/orgs/:orgId` — notebook list/create/delete
- `/…/setup` — name, title, subtitle, logo upload → `logoAssetId`, phases CRUD, access
- `/…/members` — roster name/role/photo/`order` (credits)

## Acceptance criteria

- [ ] Delete notebook cascades entries, assets, audits, GCS blobs
- [ ] Restricted access hides notebook from unauthorized org members
- [ ] Logo and phases persist and round-trip in ZIP where supported
- [ ] UI copy distinguishes Org people vs Notebook roster

## Data and APIs

- `NotebookSummaryV5`: folders, phases, access, `logoAssetId`, `lastCompiled`
- `notebooks/{id}/members/{memberId}` roster
- Folder helpers: `POST|PATCH|DELETE …/folders`

## Non-goals

- Embedding org team UI as notebook “team” branding (legacy TeamEditor archived)
