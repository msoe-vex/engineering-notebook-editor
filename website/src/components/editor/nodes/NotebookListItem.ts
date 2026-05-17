import { Node, mergeAttributes } from "@tiptap/core";

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    notebookListItem: {
      indentNotebookListItem: () => ReturnType;
      outdentNotebookListItem: () => ReturnType;
      toggleNotebookList: (listType: 'bullet' | 'ordered') => ReturnType;
    };
  }
}

export const NotebookListItem = Node.create({
  name: 'notebookListItem',
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      indent: {
        default: 1,
        parseHTML: element => parseInt(element.getAttribute('data-indent') || '1', 10),
        renderHTML: attributes => ({
          'data-indent': attributes.indent,
          class: `notebook-list-item indent-level-${attributes.indent} list-type-${attributes.listType}`,
        }),
      },
      listType: {
        default: 'bullet',
        parseHTML: element => element.getAttribute('data-list-type') || 'bullet',
        renderHTML: attributes => ({
          'data-list-type': attributes.listType,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div.notebook-list-item',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      indentNotebookListItem: () => ({ tr, state, dispatch }) => {
        let hasChanges = false;
        const { selection } = state;
        tr.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
          if (node.type.name === 'notebookListItem') {
            const currentIndent = node.attrs.indent ?? 1;
            if (currentIndent < 8) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: currentIndent + 1 });
              hasChanges = true;
            }
          }
        });
        if (hasChanges && dispatch) {
          dispatch(tr);
          return true;
        }
        return false;
      },
      outdentNotebookListItem: () => ({ tr, state, dispatch }) => {
        let hasChanges = false;
        const { selection } = state;
        tr.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
          if (node.type.name === 'notebookListItem') {
            const currentIndent = node.attrs.indent ?? 1;
            if (currentIndent > 1) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: currentIndent - 1 });
              hasChanges = true;
            } else {
              tr.setNodeMarkup(pos, state.schema.nodes.paragraph);
              hasChanges = true;
            }
          }
        });
        if (hasChanges && dispatch) {
          dispatch(tr);
          return true;
        }
        return false;
      },
      toggleNotebookList: (listType: 'bullet' | 'ordered') => ({ tr, state, dispatch }) => {
        let hasChanges = false;
        const { selection } = state;

        let allTargetType = true;
        let hasListItems = false;

        tr.doc.nodesBetween(selection.from, selection.to, (node) => {
          if (node.isBlock && node.type.name !== 'doc') {
            if (node.type.name === 'notebookListItem') {
              hasListItems = true;
              if (node.attrs.listType !== listType) {
                allTargetType = false;
              }
            } else {
              allTargetType = false;
            }
          }
        });

        const targetType = (hasListItems && allTargetType) ? 'paragraph' : 'notebookListItem';

        tr.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
          if (node.isBlock && node.type.name !== 'doc') {
            const name = node.type.name;
            if (targetType === 'paragraph') {
              if (name === 'notebookListItem') {
                tr.setNodeMarkup(pos, state.schema.nodes.paragraph);
                hasChanges = true;
              }
            } else {
              if (name === 'paragraph' || name === 'heading') {
                tr.setNodeMarkup(pos, state.schema.nodes.notebookListItem, {
                  indent: 1,
                  listType: listType,
                });
                hasChanges = true;
              } else if (name === 'notebookListItem' && node.attrs.listType !== listType) {
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, listType });
                hasChanges = true;
              }
            }
          }
        });

        if (hasChanges && dispatch) {
          dispatch(tr);
          return true;
        }
        return false;
      }
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.indentNotebookListItem(),
      "Shift-Tab": () => this.editor.commands.outdentNotebookListItem(),
      Enter: () => {
        const { state, view } = this.editor;
        const { $from } = state.selection;
        if ($from.parent.type.name !== 'notebookListItem') {
          return false;
        }
        if ($from.parent.content.size === 0) {
          this.editor.commands.outdentNotebookListItem();
          return true;
        }
        const indent = $from.parent.attrs.indent;
        const listType = $from.parent.attrs.listType;
        this.editor.commands.splitBlock();
        const { $from: freshFrom } = this.editor.state.selection;
        const pos = freshFrom.before();
        const tr = this.editor.state.tr.setNodeMarkup(pos, state.schema.nodes.notebookListItem, { indent, listType });
        view.dispatch(tr);
        return true;
      },
      Backspace: () => {
        const { state } = this.editor;
        const { $from } = state.selection;
        if ($from.parent.type.name === 'notebookListItem' && $from.parentOffset === 0) {
          return this.editor.commands.outdentNotebookListItem();
        }
        return false;
      }
    };
  },
});
