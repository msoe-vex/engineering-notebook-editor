# FR-org-public-page: Public organization profile

Status: planned  
Related: [FR-orgs](./FR-orgs.md), [roadmap](../../00-product/roadmap.md), [vex-website](https://github.com/msoe-vex/vex-website)

## Summary

Optional **public org page** for people outside the org: projects, donors, sponsors, events, social links, photos/media. Visibility is **public** or **hidden**. This is separate from the signed-in **org dashboard** (notebooks, people, teams).

## Actors and permissions

| Actor | Edit public page | View when public | View when hidden |
| --- | --- | --- | --- |
| Org owner / admin | yes | yes | yes (preview) |
| Org member | no (unless granted later) | yes | no |
| Anonymous visitor | no | yes | no (404 / gated) |

## User-facing behavior

- Dashboard: `/orgs/:orgId` — manage notebooks & membership (unchanged primary job)
- Public: e.g. `/o/:orgSlug` or `/orgs/:orgId/public` — marketing profile
- CMS sections (MVP): about blurb, projects, sponsors/donors, events, social links, media gallery
- Toggle: Public | Hidden

## Relationship to vex-website

[msoe-vex/vex-website](https://github.com/msoe-vex/vex-website) remains the current MSOE VEX club site. ENGen’s public org page is multi-tenant (any org). Deep integration or content migration from vex-website is a later optional project — not a blocker for MVP.

## Acceptance criteria

- [ ] Hidden pages are not listed on any public directory and return non-success for anonymous users
- [ ] Editing public page content never requires notebook ACL beyond org admin
- [ ] Dashboard IA clearly separates “Public page” from “People / Notebooks”
- [ ] Media uploads use existing asset/GCS patterns with size limits

## Data and APIs

- Org profile document / subcollection: `publicPage: { visibility, sections… }`, optional `slug`
- Public read API without membership; write API admin-only — see schema/API when implemented

## Non-goals

- Full CMS / blog engine  
- Replacing vex-website in v1  
- Mixing notebook editor chrome into the public marketing layout

## Open questions / risks

- Custom domains per org (out of scope initially)  
- Whether alumni roster is auto-pulled onto the public page ([FR-orgs](./FR-orgs.md) alumni)
