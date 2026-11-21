# Plan: Public content information architecture

Status: proposed  
Related: [FR-org-public-page](../features/FR-org-public-page.md), [FR-public-notebook](../features/FR-public-notebook.md)

## Problem

Today the **Public page** CMS tab owns donors, projects, events, social, about, logo, announcement, and visibility. That mixes **site chrome** (slug/logo/about) with **content catalogs** (donors/projects/events). Content editors expect those catalogs to feel like first-class org data; marketing toggles belong elsewhere.

## Options

### A — Keep one Public CMS tab (status quo)

Everything edited under `/orgs/:orgId/public`.

- Pros: one place; matches current APIs  
- Cons: crowded; content feels like “website-only” rather than org records

### B — Content tabs + thin Public tab

Top-level **Donors / Projects / Events** tabs manage records. **Public page** tab only chooses which sections appear, section order, and home teasers.

- Pros: clear content ownership; public tab stays small  
- Cons: still a dedicated Public tab; two hops for “make this project public”

### C — Content tabs own visibility; Settings owns site chrome (**recommended**)

| Surface | Owns |
| --- | --- |
| **Org Settings** | Slug, whole-site visibility, logo, announcement, about, social links, CTA |
| **Donors / Projects / Events** tabs | CRUD + per-item `visibility` (`listed` / `hidden`) + images |
| **People** | Public roster (already); no CMS members |
| Drop `/public` CMS tab | Preview/copy link live on Settings |

- Pros: same pattern as notebook public settings; no duplicate “website vs app” content; alumni/credits already on People  
- Cons: nav grows by ~3 tabs; needs section empty states on `/o/:slug` when nothing is listed

### D — No public chrome in Settings; every surface self-publishes

Even slug/logo live next to content. Too scattered for share URL and branding.

## Recommendation

Ship **Option C**.

1. Move slug / visibility / logo / announcement / about / social / CTA into **Org Settings** (extend current settings block; keep Copy link / View site actions there).  
2. Add org nav tabs **Donors**, **Projects**, **Events** that reuse today’s CMS item editors + image upload + a simple Listed/Hidden control per item.  
3. Remove the dedicated Public CMS route (redirect `/public` → Settings or Donors).  
4. Public GET `/public/o/:slug` only returns listed items; home teasers = first N listed.  
5. Align notebook **Setup → Public page** with the same Visibility + Copy link + View pattern (already in progress).

## Implementation slices

1. Settings: absorb home chrome fields from Public CMS; Copy link / View  
2. New pages under `/orgs/:orgId/{donors,projects,events}` (shared item editor component)  
3. Schema: `visibility?: "listed" | "hidden"` on public* collections (default listed)  
4. Delete/redirect Public CMS tab; update FR-org-public-page  
5. Docs + nav counts

## Non-goals

- Custom domains  
- Per-section accent themes  
- Auto-syncing projects from notebooks (optional later)
