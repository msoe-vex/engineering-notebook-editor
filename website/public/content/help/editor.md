# Editor guide

Each notebook entry has metadata plus a collaborative rich-text body. Changes sync live with teammates who have the entry open.

## Entry header

- **Title** — descriptive name; optional GenAI sparkles when configured.
- **Date** — when the work happened (drives calendar placement).
- **Authors** — who contributed; defaults come from Preferences.
- **Phase** — design-process tag from notebook Setup.
- **Hide from PDF** — exclude this entry from compile without deleting it.

Missing required fields may show incomplete warnings in the explorer.

## View modes

- **Editor** — rich text (default).
- **Split** — editor + live LaTeX (desktop).
- **LaTeX** — generated source only.

On phone, Split is omitted; use Editor or LaTeX.

## Toolbar

Formatting, links, images, tables, math, and raw LaTeX blocks. Hover icons for shortcuts.

### Links & cross-references

**Link** (or `Ctrl/Cmd + K`) targets other entries, figures, or external URLs. The compiler resolves notebook-internal references in the PDF.

### Images

Drag/drop or insert images; they upload to cloud storage and appear as figures with captions. Prefer clear photos and diagrams for judges.

### Math

Inline and block math render with KaTeX in the editor and become LaTeX in the PDF.

## Explorer

Folders, search, phase/author/date filters, multi-select Move/Delete, and **New** (blank entry, blank template, from template). Templates use a distinct glyph. See [Organizations & access](/help/orgs) for trash and Hide from PDF.
