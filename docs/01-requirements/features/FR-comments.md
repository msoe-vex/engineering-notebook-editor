# FR-comments: Entry comments

Status: partial  
Related: [FR-entries-collab](./FR-entries-collab.md), [FR-notifications](./FR-notifications.md), [public-collab-comments-polish plan](../plans/public-collab-comments-polish.md), [realtime](../../02-architecture/realtime.md)

## Summary

Entry **comments** are collaborative review notes that never appear in PDF compile. Anchors live in TipTap (Yjs); thread bodies live in MetadataStore and fan out over SSE.

## Model

| Piece | Store / transport |
| --- | --- |
| Anchor (`commentAnchor` mark + `commentId`) | TipTap / Yjs |
| Thread (`body`, resolve, author, `mentionedUids`) | `…/entries/{entryId}/comments/{id}` + SSE `comment.upserted` / `comment.deleted` |
| Mentions | Org member uids; `NotificationPort` template `comment_mention` (console adapter OK until email is wired) |
| Explorer signal | Entry denorm `openCommentCount` / `commentCount` |

## Acceptance

- [x] TipTap `commentAnchor` mark synced via collab
- [x] Selection bubble / toolbar opens a **compose modal** (quote + body + member mentions); side panel lists / resolve / reopen / delete; click focuses anchor
- [x] Core CRUD under `…/entries/:entryId/comments`; create accepts `mentionedUids`
- [x] Mentioned members notified via `NotificationPort`
- [x] SSE fanout for upsert/delete; entry counts updated
- [x] LaTeX/compile ignores `commentAnchor` (thread body never exported)
- [x] Explorer filter: **Has open comments**
- [ ] Public TipTap viewer strips comment decorations (optional polish)
