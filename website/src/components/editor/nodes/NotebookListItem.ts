import { Node, mergeAttributes, InputRule } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Node as PMNode } from "@tiptap/pm/model";

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    notebookListItem: {
      indentNotebookListItem: () => ReturnType;
      outdentNotebookListItem: () => ReturnType;
      toggleNotebookList: (listType: 'bullet' | 'ordered') => ReturnType;
      toggleListRestart: () => ReturnType;
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
          class: `notebook-list-item indent-level-${attributes.indent} list-type-${attributes.listType}${attributes.restart ? ' restart-list' : ''}`,
        }),
      },
      listType: {
        default: 'bullet',
        parseHTML: element => element.getAttribute('data-list-type') || 'bullet',
        renderHTML: attributes => ({
          'data-list-type': attributes.listType,
        }),
      },
      restart: {
        default: false,
        parseHTML: element => element.getAttribute('data-restart') === 'true' || element.classList.contains('restart-list'),
        renderHTML: attributes => {
          if (!attributes.restart) return {};
          return {
            'data-restart': 'true',
          };
        },
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

  renderHTML({ node, HTMLAttributes }) {
    const isRestart = node.attrs.restart === true;
    return ['div', mergeAttributes(HTMLAttributes, {
      class: `${HTMLAttributes.class || ''}${isRestart ? ' restart-list' : ''}`
    }), 0];
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

        // 1. Pre-pass to count convertible blocks and check for active list items
        let hasListItems = false;
        let totalConvertibleBlocks = 0;
        tr.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
          if (node.type.name === 'table' || node.type.name === 'codeBlock') {
            return false;
          }
          if (node.isBlock && node.type.name !== 'doc') {
            const startsAtOrAfterTo = pos >= selection.to;
            const endsAtOrBeforeFrom = pos + node.nodeSize <= selection.from;
            if (startsAtOrAfterTo || endsAtOrBeforeFrom) {
              return;
            }
            const isConvertible = node.type.name === 'paragraph' || node.type.name === 'heading' || node.type.name === 'notebookListItem';
            if (isConvertible) {
              totalConvertibleBlocks++;
              if (node.type.name === 'notebookListItem') {
                hasListItems = true;
              }
            }
          }
        });

        // 2. Main pass to compute targetType
        let allTargetType = true;
        tr.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
          if (node.type.name === 'table' || node.type.name === 'codeBlock') {
            return false;
          }
          if (node.isBlock && node.type.name !== 'doc') {
            const startsAtOrAfterTo = pos >= selection.to;
            const endsAtOrBeforeFrom = pos + node.nodeSize <= selection.from;
            if (startsAtOrAfterTo || endsAtOrBeforeFrom) {
              return;
            }

            // Skip empty paragraph/heading at the end of selection if it's a multi-line selection
            const isEmptyParagraphAtEnd = (node.type.name === 'paragraph' || node.type.name === 'heading') &&
              node.content.size === 0 &&
              (pos + node.nodeSize >= selection.to);

            if (isEmptyParagraphAtEnd && totalConvertibleBlocks > 1) {
              return;
            }

            const isConvertible = node.type.name === 'paragraph' || node.type.name === 'heading' || node.type.name === 'notebookListItem';
            if (isConvertible) {
              if (node.type.name === 'notebookListItem') {
                if (node.attrs.listType !== listType) {
                  allTargetType = false;
                }
              } else {
                allTargetType = false;
              }
            }
          }
        });

        const targetType = (hasListItems && allTargetType) ? 'paragraph' : 'notebookListItem';

        // 3. Transformation pass
        tr.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
          if (node.type.name === 'table' || node.type.name === 'codeBlock') {
            return false;
          }
          if (node.isBlock && node.type.name !== 'doc') {
            const startsAtOrAfterTo = pos >= selection.to;
            const endsAtOrBeforeFrom = pos + node.nodeSize <= selection.from;
            if (startsAtOrAfterTo || endsAtOrBeforeFrom) {
              return;
            }

            const isEmptyParagraphAtEnd = (node.type.name === 'paragraph' || node.type.name === 'heading') &&
              node.content.size === 0 &&
              (pos + node.nodeSize >= selection.to);

            if (isEmptyParagraphAtEnd && totalConvertibleBlocks > 1) {
              return;
            }

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
      },
      toggleListRestart: () => ({ tr, state, dispatch }) => {
        let hasChanges = false;
        const { selection } = state;
        tr.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
          if (node.type.name === 'notebookListItem') {
            const startsAtOrAfterTo = pos >= selection.to;
            const endsAtOrBeforeFrom = pos + node.nodeSize <= selection.from;
            if (startsAtOrAfterTo || endsAtOrBeforeFrom) {
              return;
            }
            const currentRestart = node.attrs.restart ?? false;
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, restart: !currentRestart });
            hasChanges = true;
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
      "Alt-r": () => this.editor.commands.toggleListRestart(),
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
        const { selection } = state;
        if (!selection.empty) {
          return false;
        }
        const { $from } = selection;

        // 1. If inside a list item at the start, outdent it
        if ($from.parent.type.name === 'notebookListItem' && $from.parentOffset === 0) {
          return this.editor.commands.outdentNotebookListItem();
        }

        // 2. If inside a paragraph/heading at the start, and the preceding block is a list item, join them cleanly
        if ($from.parentOffset === 0) {
          const index = $from.index(-1); // Index of current block in its parent (doc)
          if (index > 0) {
            const parent = $from.node(-1); // The parent (doc)
            const prevNode = parent.child(index - 1);
            if (prevNode.type.name === 'notebookListItem') {
              const { tr } = state;
              const currentBlockStart = $from.before();
              const currentBlockEnd = $from.after();
              const content = $from.parent.content;

              // Insert current block's content at the end of the preceding list item
              const targetInsertPos = currentBlockStart - 1;
              tr.insert(targetInsertPos, content);

              // Delete the current block (accounting for the shift in positions due to the insertion)
              const shift = content.size;
              tr.delete(currentBlockStart + shift, currentBlockEnd + shift);

              // Position cursor exactly at the transition point inside the list item
              tr.setSelection(TextSelection.create(tr.doc, targetInsertPos));

              this.editor.view.dispatch(tr);
              return true;
            }
          }
        }

        return false;
      }
    };
  },

  addInputRules() {
    return [
      new InputRule({
        find: /^\s*([-*+])\s$/,
        handler: ({ state, range, match, chain }) => {
          const { $from } = state.selection;
          // Ensure we are typing at the start of the block
          if ($from.parentOffset > match[0].length) {
            return;
          }
          // Only convert paragraphs or headings
          const parentType = $from.parent.type.name;
          if (parentType !== 'paragraph' && parentType !== 'heading') {
            return;
          }

          chain()
            .deleteRange(range)
            .command(({ tr, state }) => {
              tr.setNodeMarkup($from.before(), state.schema.nodes.notebookListItem, {
                listType: 'bullet',
                indent: 1,
              });
              return true;
            })
            .run();
        },
      }),
      new InputRule({
        find: /^\s*(\d+)\.\s$/,
        handler: ({ state, range, match, chain }) => {
          const { $from } = state.selection;
          // Ensure we are typing at the start of the block
          if ($from.parentOffset > match[0].length) {
            return;
          }
          // Only convert paragraphs or headings
          const parentType = $from.parent.type.name;
          if (parentType !== 'paragraph' && parentType !== 'heading') {
            return;
          }

          const startVal = parseInt(match[1], 10);

          chain()
            .deleteRange(range)
            .command(({ tr, state }) => {
              tr.setNodeMarkup($from.before(), state.schema.nodes.notebookListItem, {
                listType: 'ordered',
                indent: 1,
                restart: startVal !== 1, // Restart if not beginning at 1
              });
              return true;
            })
            .run();
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    return [
      NotebookListMarkersPlugin(),
    ];
  },
});

// Helper to convert number to lower-alpha representation (a, b, c, ..., z, aa, ab)
function toAlpha(num: number): string {
  if (num <= 0) return 'a';
  let result = '';
  let temp = num;
  while (temp > 0) {
    const modulo = (temp - 1) % 26;
    result = String.fromCharCode(97 + modulo) + result;
    temp = Math.floor((temp - modulo) / 26);
  }
  return result;
}

// Helper to convert number to roman numerals (lower-case)
function toRoman(num: number): string {
  if (num <= 0) return 'i';
  const romanMap = [
    { value: 100, symbol: 'c' },
    { value: 90, symbol: 'xc' },
    { value: 50, symbol: 'l' },
    { value: 40, symbol: 'xl' },
    { value: 10, symbol: 'x' },
    { value: 9, symbol: 'ix' },
    { value: 5, symbol: 'v' },
    { value: 4, symbol: 'iv' },
    { value: 1, symbol: 'i' },
  ];
  let result = '';
  let temp = num;
  for (const { value, symbol } of romanMap) {
    while (temp >= value) {
      result += symbol;
      temp -= value;
    }
  }
  return result;
}

// Traverser to calculate list markers sequentially and build the decoration set
function buildDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];
  const bulletCounters = [0, 0, 0, 0, 0, 0, 0, 0, 0]; // 1-indexed counters for level 1 to 8
  const orderedCounters = [0, 0, 0, 0, 0, 0, 0, 0, 0]; // 1-indexed counters for level 1 to 8
  let lastParent: PMNode | null = null;

  doc.descendants((node, pos, parent) => {
    // Reset counters when entering a new parent node (e.g. table cell)
    if (parent !== lastParent) {
      for (let i = 1; i <= 8; i++) {
        bulletCounters[i] = 0;
        orderedCounters[i] = 0;
      }
      lastParent = parent;
    }

    if (node.type.name === 'notebookListItem') {
      const indent = node.attrs.indent || 1;
      const listType = node.attrs.listType || 'bullet';
      const restart = node.attrs.restart || false;

      // Reset sub-counters for all deeper levels on both lists
      for (let i = indent + 1; i <= 8; i++) {
        bulletCounters[i] = 0;
        orderedCounters[i] = 0;
      }

      // Decouple list counters:
      // Starting a bullet list item at level `indent` breaks/resets any active ordered list at level `indent` (and vice-versa)
      if (listType === 'bullet') {
        orderedCounters[indent] = 0;
        if (restart) {
          bulletCounters[indent] = 1;
        } else {
          bulletCounters[indent]++;
        }
      } else {
        bulletCounters[indent] = 0;
        if (restart) {
          orderedCounters[indent] = 1;
        } else {
          orderedCounters[indent]++;
        }
      }

      if (typeof window !== 'undefined') {
        const logs = (window as any).listDebugLogs || [];
        logs.push(`Node "${node.textContent}" (level ${indent}, ${listType}): orderedCounters=[${orderedCounters.slice(1, 4).join(',')}], bulletCounters=[${bulletCounters.slice(1, 4).join(',')}]`);
        (window as any).listDebugLogs = logs;
      }

      let marker = '';
      if (listType === 'bullet') {
        const bullets = ['•', '◦', '▪', '–', '•', '◦', '▪', '–'];
        marker = bullets[(indent - 1) % bullets.length];
      } else {
        const val = orderedCounters[indent];
        const lvl = (indent - 1) % 4; // 0, 1, 2, 3
        if (lvl === 0) {
          marker = `${val}.`;
        } else if (lvl === 1) {
          marker = `${toAlpha(val)}.`;
        } else if (lvl === 2) {
          marker = `${toRoman(val)}.`;
        } else {
          marker = `${toAlpha(val).toUpperCase()}.`;
        }
      }

      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          'data-marker': marker,
        })
      );
    } else if (node.isBlock) {
      // Split list by text or another block type: reset all counters under this parent
      for (let i = 1; i <= 8; i++) {
        bulletCounters[i] = 0;
        orderedCounters[i] = 0;
      }
    }

    // Do not descend into inline elements of a list item
    return node.type.name !== 'notebookListItem';
  });

  return DecorationSet.create(doc, decorations);
}

const notebookListKey = new PluginKey('notebookListMarkers');

export const NotebookListMarkersPlugin = () => {
  return new Plugin({
    key: notebookListKey,
    state: {
      init(_, state) {
        return buildDecorations(state.doc);
      },
      apply(tr, oldState) {
        if (tr.docChanged) {
          return buildDecorations(tr.doc);
        }
        return oldState.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(state) {
        return notebookListKey.getState(state);
      },
    },
  });
};

