# FR-comments: Entry comments

Status: partial  
Related: [FR-entries-collab](./FR-entries-collab.md), [public-collab-comments-polish plan](../plans/public-collab-comments-polish.md), [realtime](../../02-architecture/realtime.md)

## Summary

Entry **comments** are collaborative review notes that never appear in PDF compile. Anchors live in TipTap (Yjs); thread bodies live in MetadataStore and fan out over SSE.

## Model

| Piece | Store / transport |
| --- | --- |
| Anchor (`commentAnchor` mark + `commentId`) | TipTap / Yjs |
| Thread (`body`, resolve, author) | `…/entries/{entryId}/comments/{id}` + SSE `comment.upserted` / `comment.deleted` |
| Explorer signal | Entry denorm `openCommentCount` / `commentCount` |

## Acceptance

- [x] TipTap `commentAnchor` mark synced via collab
- [x] Comments sidebar: list, add (with selection quote), resolve/reopen, delete; click focuses anchor
- [x] Core CRUD under `…/entries/:entryId/comments`
- [x] SSE fanout for upsert/delete; entry counts updated
- [x] LaTeX/compile ignores `commentAnchor` (thread body never exported)
- [x] Explorer filter: **Has open comments**
- [ ] Public TipTap viewer strips comment decorations (optional polish)
