# Core journeys

Happy paths for the live App Router product. Feature detail: [01-requirements/features/](../01-requirements/features/).

## 1. First session

1. Sign in (Firebase Auth or local dev token) — [FR-auth](../01-requirements/features/FR-auth.md)
2. Create or open an **organization** — [FR-orgs](../01-requirements/features/FR-orgs.md)
3. Create a **notebook** — [FR-notebooks](../01-requirements/features/FR-notebooks.md)
4. **New entry** → collaborative editor — [FR-entries-collab](../01-requirements/features/FR-entries-collab.md)

## 2. Daily writing

1. Open notebook workspace (`NotebookShell` + explorer)
2. Filter/search or open folder — [FR-explorer](../01-requirements/features/FR-explorer.md)
3. Edit entry (TipTap + Yjs); images upload to assets
4. Optional: schedule / reorder by date — [FR-schedule](../01-requirements/features/FR-schedule.md)

## 3. Branding and roster

1. Setup: title, subtitle, logo, access mode, phases — [FR-notebooks](../01-requirements/features/FR-notebooks.md)
2. Members: credits roster (not org ACL)

## 4. Compile and backup

1. Per-entry LaTeX preview or notebook **Compile** → PDF — [FR-compile](../01-requirements/features/FR-compile.md)
2. Overflow **Export ZIP** / **Import ZIP** — [FR-zip](../01-requirements/features/FR-zip.md)

## 5. GenAI and audit

1. Account: enable GenAI, set provider (BYOK key local) — [FR-account](../01-requirements/features/FR-account.md)
2. Generate entry title / image captions; run rubric audit — [FR-genai-audit](../01-requirements/features/FR-genai-audit.md)

## 6. Org people

1. People: members + invites (expiry, email match)
2. Teams: ACL groups for restricted notebooks

## Route map (IA)

```
/                         Organizations
/orgs/:orgId              Notebooks + People / Teams
/orgs/:orgId/notebooks/:notebookId
  ├── entries/:entryId    Collaborative editor
  ├── schedule            Calendar
  ├── compile             BusyTeX PDF
  ├── setup               Branding, access, phases, logo
  └── members             Credits roster
/account                  Theme, GenAI prefs
/help · /about
/admin                    Platform admin
```
