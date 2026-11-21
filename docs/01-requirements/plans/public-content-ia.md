# Plan: Public content information architecture

Status: done  
Related: [FR-org-public-page](../features/FR-org-public-page.md), [FR-public-notebook](../features/FR-public-notebook.md), [schema](../../03-reference/schema.md)

## Problem

Today the **Public page** CMS tab owns donors, projects, events, social, about, logo, announcement, and visibility. Collections are prefixed `public*` (`publicDonors`, …), which encodes “website-only” into the data model. Content should be first-class org records that *can* be shown publicly.

## Recommendation (Option C + schema rename)

**UI:** Content tabs own Donors / Projects / Events; **Org Settings** owns site chrome (slug, whole-site visibility, logo, announcement, about, social, CTA). Drop the dedicated Public CMS tab.

**Schema:** Drop the `public*` collection prefix. Store catalogs as normal org subcollections with a per-record **`public` boolean (default `true`)**.

### Target paths

| Today | Target |
| --- | --- |
| `organizations/{orgId}/publicDonors/{id}` | `organizations/{orgId}/donors/{id}` |
| `…/publicProjects/{id}` | `…/projects/{id}` |
| `…/publicEvents/{id}` | `…/events/{id}` |
| `…/publicSocial/{id}` | `…/socialLinks/{id}` (or keep under Settings-only docs) |
| `…/publicMembers/{id}` | **Remove** — use `members/{uid}` |

### Per-record field

```
public?: boolean   // omit or true ⇒ shown on public site; false ⇒ org-only
```

Default **on** (public). Missing field = public for back-compat after migrate.

Same flag on **`OrgMember`**: `public?: boolean` (default true) so People can hide someone from the public roster without alumni/ACL changes. Alumni remains a separate cosmetic `status`.

### Site-level

`organizations/{orgId}.publicPage`:

- `visibility: "public" | "hidden"` — whole site gate  
- `slug`, `logoAssetId`, `announcement`, `about`, `cta`  
- `sections?: { about?, donors?, projects?, events?, members?, social? }` — whole-section gates (omit/true = on)  
- Social links: `socialLinks/{id}` with per-item `public`

Anonymous `GET /public/o/:slug` returns only records with `public !== false`, only when site visibility is public, and only for sections that are on.

### API sketch

- Admin: `GET/PUT/DELETE /orgs/:orgId/donors/:id` (same for projects, events, socialLinks)  
- Deprecate `/orgs/:orgId/public/:section/:itemId`  
- Public read unchanged URL; filter by `public`

### Migration (no prod back-compat required per product stance)

1. Copy `publicDonors` → `donors` (set `public: true`), same for projects/events/social  
2. Switch Core + website path helpers  
3. Delete old collections / path helpers / CMS members section  
4. Add `public` toggle on People + catalog UIs (default on)

## UI ownership

| Surface | Owns |
| --- | --- |
| **Org Settings** | Slug, site visibility, section toggles, logo, announcement, about, social, CTA, Copy link / View |
| **Donors / Projects / Events** tabs | CRUD, images, order, per-item `public` |
| **People** | Roster; per-member `public` (+ title/photo); alumni cosmetic |
| **Notebook Setup → Public page** | Notebook `publicAccess` + Copy link / View (already aligned) |

## Why not keep `public*` names?

- Prefix implies a parallel CMS universe instead of org data  
- Bool on the real record matches how notebooks already do `publicAccess`  
- One mental model: “this donor exists; is it on the website?”

## Implementation slices

1. [x] Shared paths/types: `donorsCollection`, …; `public?: boolean` on catalogs + `OrgMember`  
2. [x] Core routes + public GET filter (item + section); redirect legacy `/public` CMS  
3. [x] Settings: site chrome + `publicPage.sections` toggles  
4. [x] Org nav tabs for Donors / Projects / Events with per-item `public`  
5. [x] People: `public` toggle; FR + schema docs  

## Non-goals

- Custom domains  
- Per-section accent themes  
- Auto-syncing projects from notebooks (optional later)  
- Keeping `publicMembers` as a separate curated board
