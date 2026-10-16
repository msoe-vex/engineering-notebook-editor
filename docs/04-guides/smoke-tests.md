# Smoke tests

Manual acceptance checks aligned with [01-requirements](../01-requirements/).

| Area | Smoke |
| --- | --- |
| Auth | Sign in (emulator or prod) → `/` loads orgs |
| Orgs | Create org → invite (optional) → accept |
| Notebook | Create notebook → open workspace |
| Images | Insert image → reload entry → image still loads |
| Folders | Create folder → move entry → reload → still nested |
| Schedule | Drag entry to another day → persists |
| Compile | Compile → PDF downloadable; `lastCompiled` set |
| ZIP | Export → import → entries + images restored |
| Prefs | Second browser: theme/authors apply; keys still local |
| Audit | Run audit with notebook access; history lists scorecard |
| Restricted | User without grant cannot open restricted notebook |
| Delete | Delete notebook → GCS tipTap/assets/exports gone |

Local stack: [local-development.md](./local-development.md).
