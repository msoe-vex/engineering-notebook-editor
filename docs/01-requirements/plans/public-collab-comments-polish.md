# Plan: Public CMS polish, collab presence, comments, jobs SSE, trash

**Status:** current (Epics A–F shipped; light polish leftovers)  

**Created:** 2026-11-21  
**Audience:** engineering + product  
**Related:** [FR-org-public-page](../features/FR-org-public-page.md), [FR-public-notebook](../features/FR-public-notebook.md), [FR-entries-collab](../features/FR-entries-collab.md), [FR-trash](../features/FR-trash.md), [FR-compile](../features/FR-compile.md), [FR-genai-judge](../features/FR-genai-judge.md), [realtime.md](../../02-architecture/realtime.md), [ADR-006](../../02-architecture/decisions/ADR-006-compile-job.md)

Dogfood follow-ups: public org/notebook share UX, collab cursors, entry comments, richer compile progress, trash for contributors/phases.

When an epic ships, check it off here and fold lasting acceptance into the matching FR.

---

## Goals

1. Make the public org CMS and public surfaces shareable and editable without hunting Settings.
2. Fix cross-route job toasts (rubric extract / judge / compile).
3. Show remote cursors + selection highlights with hover names (Yjs awareness).
4. Ship entry **comments** that never appear in PDF compile, with a clear sync story.
5. Enrich compile (and job) SSE with staged detail.
6. Decide trash behavior for contributors and phases.

## Non-goals

- Pixel-perfect marketing redesign of `/o/:slug` (IA + clarity first).
- Putting notebook metadata (title/phase/date) into Yjs.
- Public comments on `/o/…` notebooks.
- Full Google-Docs-grade suggestion mode / resolve workflows in v1 (resolve + delete is enough).

---

## Priority legend

| Sev | Meaning |
| --- | --- |
| **P0** | Broken or blocking share/collab dogfood |
| **P1** | Clear product gap |
| **P2** | Polish / stretch |

Suggested ship order: **A → B → C → D → E → F → G**.

---

## Epic overview

| Epic | Title | Sev |
| --- | --- | --- |
| A | Public CMS + share links + public chrome | P0–P1 |
| B | Job toast durability across navigation | P0 |
| C | Remote cursors / selection / peer hover | P1 |
| D | Entry comments (architecture + MVP) | P1 |
| E | Compile / job detailed SSE | P2→P1 |
| F | Trash: contributors + phases | P2 |
| G | Docs / FR sync | — |

---

## Epic A — Public CMS + share links + public chrome (P0–P1)

### Current gaps

- Slug is claimed under org Settings; Public page tab only warns if missing.
- “View public site” exists; no one-click **Copy link** for org page or public notebook.
- CMS section items (donors, members, events, …) use inline/ad-hoc fields — no add/edit **modals**.
- Public section pages lack a clear **Home** / back-to-org-main link.
- Org **logo** is in FR branding but not on `OrgPublicPage` / home header today.
- Labels: **CTA** is jargon; **Mission** should read as **About**.

### Product copy decisions (this plan)

| Old | New (UI) | Notes |
| --- | --- | --- |
| Mission | **About** | Keep field key `mission` in API for now, or rename to `about` with no prod compat needed — prefer rename to `about` in types + API. |
| CTA title / body | **Call to action** heading + short explanation: “Buttons for join / donate links on the public home.” | Sub-labels: **Join link**, **Donate link** (not “CTA”). |

### Work

- [x] **Slug editor** on `/orgs/:orgId/public` (same validation/uniqueness as Settings); save with home content or dedicated “Save URL”.
- [x] **Copy link** buttons:
  - Public org: absolute URL to `/o/:slug` (and optionally section paths).
  - Public notebook: copy `/o/:slug/n/:key` from Compile → Links for an active share link.
- [x] **Add / Edit modals** for each CMS section (`donors`, `projects`, `events`, `members`, `social`) — shared dialog pattern; image upload stays in modal.
- [x] Public layout: header **org name + logo**; nav includes **Home** (link to `/o/:slug`) on section pages.
- [x] Schema: `organizations.logoAssetId` or `publicPage.logoAssetId` + CMS upload; public API returns signed/logo URL.
- [x] Rename Mission → About in UI (+ prefer `about` field); clarify CTA labels as above.
- [x] Amend [FR-org-public-page](../features/FR-org-public-page.md) + [FR-public-notebook](../features/FR-public-notebook.md) acceptance.

### Acceptance

- [x] Admin can set slug and copy org URL without leaving Public page.
- [x] Admin can copy a public notebook URL from the notebook surface.
- [x] Adding a donor/member/event uses a modal; list remains scannable.
- [x] `/o/:slug/projects` (etc.) can navigate back to `/o/:slug`.
- [x] Public home shows logo when set; About + join/donate wording is clear to non-engineers.

---

## Epic B — Job toast durability (P0)

### Problem

Rubric extract uses a **loading** toast + notebook SSE listener inside `CloudNotebookJudge`. Leaving the Judge tab unmounts the listener; `job.done` never dismisses/replaces the toast.

### Work

- [x] Lift job-toast subscription to **NotebookShell** (or a small `useNotebookJobToasts` hook mounted for the whole notebook workspace).
- [x] Track in-flight jobs in session (`jobId` → toast id / label / type) so remounts can re-bind.
- [x] On `job.done` / `job.failed` for `judge` (normalize + score) and `compile`, update/dismiss toast even if Judge/Compile page is not mounted.
- [ ] Optional: persist “job running” chip in notebook chrome until done.

### Acceptance

- [x] Start rubric extract → navigate to Entries → success/error toast still appears; loading toast does not stick forever.

---

## Epic C — Remote cursors / selection / peer hover (P1)

### Current

Awareness already publishes `{ name, color }` and AppChrome shows peer **avatars**. TipTap does **not** render remote carets/selections.

### Work

- [x] Add TipTap collaboration-cursor (or equivalent) wired to the same Hocuspocus awareness.
- [x] Remote **caret** + **selection highlight** in peer color.
- [x] Hover tooltip / label on caret and on chrome avatar (username).
- [x] Keep awareness user payload: `name`, `color`, optional `uid`.

### Acceptance

- [x] Two browsers on one entry see each other’s caret/selection; hovering avatar or caret shows the name.

---

## Epic D — Entry comments (P1) — architecture + MVP

### Sync today (answer)

| Data | Transport | Store |
| --- | --- | --- |
| TipTap **body** | Yjs / Hocuspocus | GCS (flush) |
| Entry / notebook **metadata** | Core REST + **SSE** | MetadataStore / Firestore |

**Do not move metadata into Yjs.** SSE already fans out ACL’d metadata; Yjs is the right CRDT for concurrent prose. Dual-writing title/phase/date into Yjs would fight Core as source of truth and complicate offline/ACL.

### Recommended comment model (hybrid)

```
TipTap mark (Yjs)          MetadataStore (SSE)
─────────────────          ────────────────────
commentAnchor {            …/entries/{entryId}/comments/{commentId}
  commentId                  body, createdBy, createdAt,
}                            resolvedAt?, anchorQuote?
                             replies[] (optional v1.1)
```

| Piece | Where | Why |
| --- | --- | --- |
| **Anchor** (where in text) | TipTap **mark** synced via **Yjs** | Survives concurrent edits with the prose; moves with text |
| **Thread body** (who said what) | MetadataStore subcollection + REST; fanout via **SSE** (`comment.upserted` / `comment.deleted`) | Not in PDF; easy ACL/moderation; doesn’t bloat Yjs or compile snapshot |
| **Compile** | Strip comment marks when building TipTap→LaTeX | Guarantees comments never appear in PDF |
| **Explorer** | Filter “Has comments” and/or Comments rail listing threads by entry | Discovery without a second document store |

**Why not TipTap-only?** Thread history, resolve, and notifications don’t belong in the CRDT; export stripping is fragile if content lives only in node attrs.

**Why not metadata-only (char offsets)?** Offsets break under concurrent edits; marks-in-Yjs are the industry default for co-editing.

### MVP work

- [x] TipTap `commentAnchor` mark + gutter/inline icon.
- [x] Comments **sidebar** (list threads for open entry; click focuses anchor).
- [x] Core CRUD: `GET/POST/PATCH/DELETE …/entries/:entryId/comments`.
- [x] SSE events; strip marks in compile path (+ public viewer polish remaining).
- [x] Explorer filter: **Has comments** (from entry metadata denorm `commentCount` or `hasComments`).
- [ ] Optional stretch: notebook-level Comments overview (not a second explorer tree in v1).
- [x] New FR-comments (or amend FR-entries-collab); schema + api-contracts.

### Acceptance

- [x] Two users can leave/resolve comments; marks move with edits; PDF has no comment text.
- [x] Sidebar lists threads; icon in text opens the thread.
- [x] Explorer can filter to entries with open comments.

---

## Epic E — Compile / job detailed SSE (P2→P1)

### Current

Workers call Core `/internal/compile/progress` → `job.progress` SSE with `statusMessage` + `progress` percent. Enough for a bar; weak for “what step”.

### Work

- [x] Extend progress payload (backward-compatible fields): e.g. `stage` (`fetch` \| `tex` \| `xelatex` \| `upload`), `detail` (log line / file), keep `statusMessage` human-readable.
- [x] Compile worker emits stages at real boundaries (snapshot pull, write tex, xelatex pass, PDF upload).
- [x] Compile UI shows stage list or last N detail lines (not only percent).
- [ ] Same shape reusable for judge progress if useful.
- [x] Document in [api-contracts](../../03-reference/api-contracts.md) + [async-jobs](../../02-architecture/async-jobs.md).

### Acceptance

- [x] During compile, UI shows staged messages (e.g. “Running XeLaTeX…”) that update without leaving the page; toast durability from Epic B still applies.

---

## Epic F — Trash: contributors + phases (P2)

### Recommendation

| Object | Trash? | How |
| --- | --- | --- |
| **Contributors** (notebook roster) | **Yes** | Soft-delete `deletedAt` on `notebooks/…/members/{id}`; Trash page section; restore / purge. Matches rubrics/entries. |
| **Phases** | **Yes, soft-hide** | Add optional `deletedAt` on each phase in `notebook.phases` map (or `status: active\|trashed`). Trashed phases hidden from pickers/calendar; entries retaining that phase id show restore hint. Avoid hard-delete while entries reference the id. |

### Work

- [x] Contributors: API list `?trashed=1`; soft DELETE; restore; Trash UI section.
- [x] Phases: soft-trash from Settings editor; Trash or Settings → Trash subsection; restore; revalidate entries if needed.
- [x] Amend [FR-trash](../features/FR-trash.md).

### Acceptance

- [x] Soft-deleted contributor disappears from credits UI but can be restored from Trash.
- [x] Soft-deleted phase disappears from pickers; can be restored; no silent data loss on entries.

---

## Epic G — Docs sync

- [x] FR-org-public-page / FR-public-notebook / FR-entries-collab / FR-trash / FR-compile acceptance updated as epics land.
- [x] [realtime.md](../../02-architecture/realtime.md): comment anchors (Yjs) vs threads (SSE) note.
- [x] [backlog.md](../backlog.md) + [roadmap.md](../../00-product/roadmap.md) link this plan.
- [x] [FR-comments](../features/FR-comments.md); schema + api-contracts + async-jobs stage note.

---

## Decision log (product)

| Question | Decision |
| --- | --- |
| Sync metadata with Yjs? | **No** — keep SSE for metadata; Yjs for body (+ comment anchors only). |
| Comments storage? | **Hybrid** — TipTap mark anchors + MetadataStore threads. |
| CTA meaning? | “Call to action” = join/donate buttons on public home; rename labels. |
| Mission? | UI **About** (prefer field rename `about`). |
| Contributors/phases trash? | Soft-delete both (phases hide, don’t hard-remove while referenced). |

---

## Verification

- Public: slug edit, copy org + notebook links, modal CRUD, logo on `/o/:slug`, Home nav on section pages, About wording.
- Jobs: extract rubric → switch tab → completion toast.
- Collab: two cursors + hover names.
- Comments: create/resolve; PDF clean; explorer filter.
- Compile: staged SSE visible in UI.
- Trash: contributor + phase restore path.

---

## Tracking

Work epics in order A→F. Prefer small PRs per epic (B alone is a good hotfix).
