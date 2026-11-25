# Core journeys

Happy paths for the live App Router product. Feature detail: [01-requirements/features/](../01-requirements/features/).

## 1. First session

1. Sign in (Firebase Auth or local dev token) — [FR-auth](../01-requirements/features/FR-auth.md)
2. Optional **product tour** (skippable; replay from Help) — [FR-help](../01-requirements/features/FR-help.md)
3. Create or open an **organization** — [FR-orgs](../01-requirements/features/FR-orgs.md)
4. Create a **notebook** — [FR-notebooks](../01-requirements/features/FR-notebooks.md)
5. **New entry** → collaborative editor — [FR-entries-collab](../01-requirements/features/FR-entries-collab.md)

## 2. Daily writing

1. Open notebook workspace (`NotebookShell` + explorer)
2. Filter/search or open folder — [FR-explorer](../01-requirements/features/FR-explorer.md)
3. Edit entry (TipTap + Yjs); images upload to assets
4. Optional: Calendar / reorder by date — [FR-schedule](../01-requirements/features/FR-schedule.md)

## 3. Branding and contributors

1. Notebook **Settings**: title, subtitle, logo, access mode, phases — [FR-notebooks](../01-requirements/features/FR-notebooks.md)
2. **Contributors**: credits list (not org ACL)

## 4. Compile and backup

1. Per-entry LaTeX preview or notebook **Compile** → PDF — [FR-compile](../01-requirements/features/FR-compile.md)
2. Overflow **Export ZIP** / **Import ZIP** — [FR-zip](../01-requirements/features/FR-zip.md)

## 5. GenAI and Judge

1. Account **Profile** / **Preferences**: theme, authors, GenAI (BYOK key local) — [FR-account](../01-requirements/features/FR-account.md)
2. Generate entry title / image captions; run notebook Judge — [FR-genai-judge](../01-requirements/features/FR-genai-judge.md)

## 6. Org people

1. People: **Active** members + invites (expiry, email match); **Alumni** section (planned)
2. Teams: ACL groups for restricted notebooks

## 7. Public sharing

1. Share notebook PDF link (anyone with link) — [FR-public-notebook](../01-requirements/features/FR-public-notebook.md)
2. Public org page (projects, sponsors, events, media) — [FR-org-public-page](../01-requirements/features/FR-org-public-page.md)
3. Roadmap: [roadmap.md](./roadmap.md)

## Route map (IA)

```
/                         Organizations
/orgs/:orgId              Dashboard: Notebooks + People / Teams / Donors / Projects / Events / Settings
/orgs/:orgId/notebooks/:notebookId
  ├── entries/:entryId    Collaborative editor
  ├── schedule            Calendar (alias /calendar)
  ├── compile             PDF versions + share links
  ├── setup               Settings: branding, access, phases, logo
  └── members             Contributors credits (alias /contributors)
/o/:orgSlug               Public org page (visibility public|hidden)
/o/:orgSlug/n/:key        Shared notebook PDF (website → Core proxy)
/account                  Profile
/account/preferences      Theme, GenAI prefs
/help · /about
/admin                    Platform admin
```
