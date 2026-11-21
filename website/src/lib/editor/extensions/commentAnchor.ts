import { Mark, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    commentAnchor: {
      setCommentAnchor: (commentId: string) => ReturnType;
      unsetCommentAnchor: () => ReturnType;
    };
  }
}

/**
 * Yjs-synced mark that anchors a MetadataStore comment thread to a text range.
 * Compile / LaTeX ignores this mark (text still exports; thread body never does).
 */
export const CommentAnchor = Mark.create({
  name: "commentAnchor",
  excludes: "",
  inclusive: false,
  keepOnSplit: true,

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-comment-id"),
        renderHTML: (attrs) =>
          attrs.commentId ? { "data-comment-id": attrs.commentId } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-comment-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "comment-anchor",
        "data-comment-id": HTMLAttributes["data-comment-id"] || HTMLAttributes.commentId,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setCommentAnchor:
        (commentId: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { commentId }),
      unsetCommentAnchor:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
