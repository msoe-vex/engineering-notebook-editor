# Smoke tests

Manual acceptance checks aligned with [01-requirements](../01-requirements/).

| Area | Smoke |
| --- | --- |
| Auth | Sign in (emulator or prod) → `/` loads orgs |
| Orgs | Create org → invite (optional) → accept |
| Notebook | Create notebook → open workspace |
| Images | Insert image → reload entry → image still loads |
| Upload limit | Image ~2–10 MiB uploads (Core streams to GCS, `bodyLimit` 64 MiB); over-limit shows toast, not silent fail |
| Presence | Two browsers on same entry → each sees the other’s avatar initials |
| Multi-select | Ctrl-click several explorer rows → Move… / Delete bulk actions |
| Folders | Create folder → move entry → reload → still nested |
| Templates | **New** → blank / from template; templates show template icon in explorer (no separate Templates section) |
| Metadata SSE | Two browsers on same notebook: change title/phase in A → sidebar updates in B without hard refresh |
| Phases → validity | Notebook with no phases → add a phase in Settings → entries without a phase show incomplete (explorer warning) |
| Schedule | Drag entry to another day → persists; day cells same height in month view (cards scroll inside cell) |
| Compile | Compile → PDF downloadable; `lastCompiled` set |
| Split LaTeX | Entry **Split** / **LaTeX** updates while typing |
| ZIP | Export → import → entries + images restored; toast on success/fail |
| Prefs | Second browser: theme/authors apply; keys still local |
| Audit | Run audit with notebook access; history lists scorecard |
| Restricted | Share / Settings: restrict notebook → user without grant cannot open |
| Delete | Delete notebook → GCS tipTap/assets/exports gone |

## Mobile (DevTools ~375px or real device)

| Area | Smoke |
| --- | --- |
| Chrome | Bottom notebook tabs visible; top bar does not wrap into unreadability; account menu reaches Help / About |
| Entries list | Full-screen explorer; open entry → full-width editor; list icon or Entries tab returns to list |
| Entry header | Chevron toggles date/phase/authors; phone starts collapsed |
| Entry edit | Editor \| LaTeX only (no Split); body scrolls; format toolbar scrolls horizontally |
| Calendar | Week layout; day cards scroll inside cell; no page-level horizontal overflow |
| Compile | Controls stack; Compile CTA tappable; PDF preview area usable |
| Contributors / Settings | Single column; primary actions reachable |
| Share | Dialog usable; people/teams lists scroll |
| Account / Help | Account tabs horizontal; Help topics drawer opens |

**Ops note:** After pulling Core changes, restart the Core service so `BODY_LIMIT_BYTES` / SSE / phase revalidation are live. If SSE drops behind a reverse proxy, raise idle timeout (e.g. nginx `proxy_read_timeout`, Cloud Run request timeout) above the 25 s ping interval.

Local stack: [local-development.md](./local-development.md). Realtime: [realtime.md](../02-architecture/realtime.md).
