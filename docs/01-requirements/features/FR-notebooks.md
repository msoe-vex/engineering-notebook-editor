# FR-notebooks: Notebooks, Settings, Contributors, access

Status: partial  
Related: [FR-orgs](./FR-orgs.md), [tenancy-acl](../../02-architecture/tenancy-acl.md), [cloud UX plan](../plans/cloud-ux-hardening.md)

## Summary

Notebooks live under an org. **Settings** controls branding, phases, logo, and access mode. A **Share** dialog presents the same ACL (org-open vs restricted people/teams) in a share-sheet shape. **Contributors** is a credits list (distinct from org ACL People).

## Actors and permissions

- Org members with notebook access (open org mode or restricted allowlist / teams)
- Settings/Contributors edits: users who can PATCH the notebook (typically org admin + access)

## User-facing behavior

- `/orgs/:orgId` — notebook list/create/delete
- `/…/setup` — **Settings**: name, title, subtitle, logo upload → `logoAssetId`, phases CRUD, access (alias `/settings`)
- Notebook chrome **Share** dialog: entire org vs restricted; search/add org people and teams
- `/…/members` — **Contributors**: name/role/photo/`order` credits (alias `/contributors`)
- Section nav (Entries / Calendar / Compile / Contributors / Settings): **slim strip** under AppChrome on ≥ `md`; **bottom tab bar** on phone (&lt; `md`) — see [mobile-responsive](../plans/mobile-responsive.md)

## Acceptance criteria

- [ ] Delete notebook cascades entries, assets, audits, GCS blobs
- [ ] Restricted access hides notebook from unauthorized org members
- [ ] Logo and phases persist and round-trip in ZIP where supported
- [ ] UI copy distinguishes Org people vs Notebook contributors
- [ ] Share dialog can grant a user and a team without using Settings checkboxes
- [x] Notebook section destinations reachable via slim strip (desktop) or bottom tabs (phone)

## Data and APIs

- `NotebookSummaryV5`: folders, phases, access, `logoAssetId`, `lastCompiled`
- `notebooks/{id}/members/{memberId}` contributors roster
- Folder helpers: `POST|PATCH|DELETE …/folders`

## Non-goals

- Embedding org team UI as notebook “team” branding (legacy TeamEditor archived)
