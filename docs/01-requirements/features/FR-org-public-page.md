# FR-org-public-page: Public organization profile

Status: planned  
Related: [FR-orgs](./FR-orgs.md), [FR-public-notebook](./FR-public-notebook.md), [roadmap](../../00-product/roadmap.md), [vex-website](https://github.com/msoe-vex/vex-website) / [msoevex.com](https://msoevex.com)

## Summary

Optional **public org page** for people outside the org — a multi-tenant “club site” surface inspired by [msoevex.com](https://msoevex.com) (Raider Robotics): mission, donors/sponsors, projects/robots, events, public members/board, contact/social, media. Visibility is **public** or **hidden**. Separate from the signed-in **org dashboard** (notebooks, people, teams).

## URL / IA decision

**Do not** make `/orgs/:orgId` the public page and shove the app under `/orgs/:orgId/dashboard`.

| Surface | Path | Audience |
| --- | --- | --- |
| **Org dashboard** (keep) | `/orgs/:orgId`, `/people`, `/teams`, `/notebooks/…` | Signed-in members |
| **Public org site** | `/o/:orgSlug` (+ section paths below) | Anyone when visibility = public |
| **Admin preview / editor** | `/orgs/:orgId/public` (or Settings → Public page) | Org admins; preview + CMS |

**Org slug:** Admins set `organizations.slug` (lowercase URL-safe). Must be **globally unique** if not taken; rename updates public URLs (optional redirect from old slug — later). Reserved words blocked (`admin`, `api`, `o`, `orgs`, …). Schema: [schema.md](../../03-reference/schema.md) planned section.

**Why:** `/orgs/:orgId` is already the member home (notebooks). Flipping it to marketing breaks bookmarks and mixes app chrome with a public layout. Slug URLs (`/o/raider-robotics`) are shareable and SEO-friendly; UUIDs are not. This matches msoevex.com’s split: public **Projects / Events / Members** vs a separate **Dashboard** entry to the app.

Public notebooks nest under the org slug ([FR-public-notebook](./FR-public-notebook.md)): `/o/:orgSlug/n/:notebookKey` — not under the dashboard tree.

### Public section routes (MVP)

| Path | Content |
| --- | --- |
| `/o/:slug` | Home: About, announcement strip, donors teaser, featured projects, board teaser, join/donate CTA |
| `/o/:slug/projects` | Project / robot archive (season filters) |
| `/o/:slug/events` | Recurring meetings + upcoming competitions |
| `/o/:slug/members` | Public roster / board (+ alumni later) |
| `/o/:slug/donate` or CTA | External donate link or short donor blurb (optional) |

## Actors and permissions

| Actor | Edit public page | View when public | View when hidden |
| --- | --- | --- | --- |
| Org owner / admin | yes | yes | yes (preview) |
| Org member | no (unless granted later) | yes | no |
| Anonymous visitor | no | yes | no (404 / gated) |

## Content model (from msoevex.com)

MVP sections admins can edit (each public|hidden at section or page level as needed):

| Section | Fields (indicative) |
| --- | --- |
| **Branding** | Display name, logo, tagline, accent colors (optional) |
| **Announcement** | Optional top banner (e.g. “Next meeting…”) + link |
| **About** | Short blurb (`publicPage.about`; legacy `mission` still read) |
| **Donors / sponsors** | Name, logo, URL, tier/order |
| **Projects** | Title, season/year, summary, highlights[], media, optional “Source / CAD” URL |
| **Events** | Recurring rows (day/time/title/location) + dated competitions/milestones |
| **Members (public)** | Curated board/roster cards (name, role, major/class, photo) — **not** full ACL People dump |
| **Contact / social** | Email, Discord, GitHub, other links |
| **Media** | Photo/video gallery (reuse asset/GCS patterns) |
| **Call to action** | Join / donate heading, body, and links |
| **Footer** | Org copyright, parent org credit, trademark disclaimer (templated) |

**Toggle:** whole page Public | Hidden. Unpublished projects/members can stay draft.

## Relationship to vex-website / msoevex.com

[msoe-vex/vex-website](https://github.com/msoe-vex/vex-website) remains the current MSOE VEX club site. ENGen’s public org page is multi-tenant (any org). Migrating Raider content into ENGen is optional later — not an MVP blocker. Feature parity target for MVP is the **information architecture** above, not pixel-perfect clone.

## Acceptance criteria

- [x] `/orgs/:orgId` remains the signed-in dashboard (notebooks); public site is `/o/:orgSlug`
- [x] Org admin can claim/change slug; conflict if taken; invalid/reserved slugs rejected
- [x] Hidden pages are not listed publicly and return non-success for anonymous users
- [x] Editing public page content is org-admin (not notebook ACL)
- [x] Dashboard nav has a clear “Public page” / “View public site” entry
- [x] Home + Projects + Events + Members sections ship for MVP (donate may be CTA-only)
- [x] Media uploads use existing asset/GCS patterns with size limits
- [x] Public layout does **not** use notebook AppChrome (marketing shell)
- [x] Public CMS (`/orgs/:orgId/public`) edits slug + copy link; section add/edit uses modals
- [x] Public chrome shows org logo when `publicPage.logoAssetId` is set; nav includes **Home**
- [x] UI labels use **About** and **Join / Donate** (not Mission / CTA jargon)

## Data and APIs

- See [schema.md](../../03-reference/schema.md) **Planned** — `slug`, `publicPage`, donors/projects/events/…  
- Public GET by slug (no membership); write APIs admin-only — [api-contracts](../../03-reference/api-contracts.md) when implemented

## Non-goals

- Full CMS / blog engine  
- Replacing msoevex.com in v1  
- Custom domains per org (later)  
- Auto-publishing every ACL member onto the public Members page (curated / board first; alumni opt-in later)

## Open questions / risks

- Whether published **notebooks** appear as projects or only manually curated project cards  
- Alumni auto-pull onto Members ([FR-orgs](./FR-orgs.md))  
- Old-slug redirects after rename
