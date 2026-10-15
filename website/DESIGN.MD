---
name: Technical Precision
colors:
  primary: '#d9282f'
  secondary: '#1e293b'
  tertiary: '#0076bc'
  surface: '#fbf9f8'
  surface-dim: '#dbdad9'
  surface-bright: '#fbf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e6e5e5'
  surface-container-highest: '#e0dfdf'
  on-surface: '#1c1b1b'
  on-surface-variant: '#444746'
  outline: '#747775'
  outline-variant: '#c4c7c5'

typography:
  font-family: 'Work Sans, sans-serif'
  headings:
    font-weight: 700
    letter-spacing: '-0.02em'
  body:
    font-weight: 400
    line-height: 1.6
  scale:
    caption: 11px
    label: 12px
    body: 14px
    title: 20px
    display: 28px

components:
  TopNavBar:
    style: calm, single header
    elements: [Product Logo, Context breadcrumbs/switcher, Account menu]
  SideNavBar:
    style: labeled notebook subnav + collapsible entry list
    elements: [Entries, Schedule, Members, Setup]
  EditorPane:
    style: paper-like, fluid-text
  PreviewPane:
    style: code-optimized, monospaced
---

# Technical Precision Design System

## Vision
A professional workspace for engineering notebooks. Document-first (Notion/Linear), not IDE-first. Keep brand red/blue and warm paper surfaces; use sentence-case UI labels.

## Domain vocabulary (UI)
- **People** — org accounts + invites
- **Teams** — named groups of users (access grouping)
- **Members** — notebook contributor roster (may lack accounts)
- **Users** — code/API only; UI says “account” / “people”

## Color Palette
- **Primary (#d9282f):** Branding and primary actions
- **Tertiary (#0076bc):** Links, synced status
- **Surfaces:** Warm greys / off-whites (technical paper)

## Typography
**Work Sans** for UI and prose; **Inconsolata** for code.
- Buttons and nav: sentence case, weight 600
- Uppercase only for rare badges
- Named ramp: `text-nb-caption` | `text-nb-label` | `text-nb-body` | `text-nb-title` | `text-nb-display`

## UI kit
Primitives in `src/components/ui/`. Prefer these over one-off Tailwind.
Radii: `rounded-nb` / `rounded-nb-lg` / `rounded-nb-xl` / `rounded-nb-2xl`.
Shadows: `shadow-nb-sm` / `shadow-nb-lg`.

## Layout principles
1. One global top bar — no double headers on org pages
2. Hub pages: max-width + airy spacing
3. Notebook workspace: labeled subnav + collapsible entry list + paper editor
4. Progressive disclosure for export/import/audit/delete
