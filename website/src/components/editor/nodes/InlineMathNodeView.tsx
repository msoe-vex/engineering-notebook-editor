import React, { useState, useEffect, useRef } from "react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { Node, InputRule } from "@tiptap/core";
import katex from "katex";
import "katex/dist/katex.min.css";

import { NodeViewProps } from "./types";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    setInlineMath: (latex: string) => ReturnType;
    toggleInlineMath: () => ReturnType;
  }
}

export function InlineMathNodeView({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLSpanElement>(null);
  const renderRef = useRef<HTMLSpanElement>(null);

  // Automatically enter edit mode if the node is selected AND empty (e.g. just created)
  useEffect(() => {
    if (selected && !node.attrs.latex) {
      let active = true;
      queueMicrotask(() => {
        if (active) setIsEditing(true);
      });
      return () => {
        active = false;
      };
    }
  }, [selected, node.attrs.latex]);

  const prevSelectionPos = useRef(editor.state.selection.from);

  useEffect(() => {
    const update = () => {
      const pos = getPos();
      const currentFrom = editor.state.selection.from;
      if (typeof pos === 'number' && currentFrom !== pos) {
        prevSelectionPos.current = currentFrom;
      }
    };
    editor.on('selectionUpdate', update);
    return () => { editor.off('selectionUpdate', update); };
  }, [editor, getPos]);

  // Handle focus when entering edit mode
  React.useLayoutEffect(() => {
    if (isEditing && inputRef.current) {
      const frameId = requestAnimationFrame(() => {
        if (!inputRef.current || document.activeElement === inputRef.current) return;

        const initialText = node.attrs.latex || "\u200B";
        if (inputRef.current.textContent !== initialText) {
          inputRef.current.textContent = initialText;
        }

        const pos = getPos();
        const isComingFromRight = typeof pos === 'number' && prevSelectionPos.current >= pos + 1;

        inputRef.current.focus();
        const sel = window.getSelection();
        const range = document.createRange();

        if (sel && inputRef.current.childNodes.length > 0) {
          const textNode = inputRef.current.childNodes[0];
          const offset = isComingFromRight ? (node.attrs.latex?.length || 0) : 0;
          const actualOffset = node.attrs.latex ? offset : 0;
          range.setStart(textNode, Math.min(actualOffset, textNode.textContent?.length || 0));
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      });
      return () => cancelAnimationFrame(frameId);
    }
  }, [isEditing, node.attrs.latex, getPos]);

  // Render KaTeX when not editing
  useEffect(() => {
    if (!isEditing && renderRef.current) {
      try {
        katex.render(node.attrs.latex || "", renderRef.current, {
          throwOnError: false,
          displayMode: false,
          strict: false,
        });
      } catch {
        renderRef.current.textContent = node.attrs.latex;
      }
    }
  }, [node.attrs.latex, isEditing]);

  return (
    <NodeViewWrapper as="span" className={`nb-inline-math-node mx-0.5 px-0.5 rounded transition-all inline-flex items-center align-middle relative ${selected && !isEditing ? 'ring-2 ring-nb-primary bg-nb-primary/10 shadow-sm' : ''}`}>
      {isEditing ? (
        <span key="edit" className="flex items-center bg-nb-outline-variant/15 text-nb-on-surface border-b border-nb-outline-variant/50 px-1 py-0.5 font-mono text-[1.0em] rounded-t-sm">
          <span className="opacity-40 font-bold mr-0.5">$</span>
          <span
            ref={inputRef}
            contentEditable
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            suppressContentEditableWarning
            className="outline-none min-w-[1ch] focus:ring-0"
            onKeyUp={(e) => e.stopPropagation()}
            onInput={(e) => {
              let text = e.currentTarget.textContent || "";
              text = text.replace(/\u200B/g, "");
              updateAttributes({ latex: text });
            }}
            onBlur={() => {
              setIsEditing(false);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                setIsEditing(false);
                editor.commands.focus();
              }
              if (e.key === 'Backspace' && (node.attrs.latex === "" || node.attrs.latex === "\u200B")) {
                e.preventDefault();
                const pos = getPos();
                if (typeof pos === 'number') {
                  editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
                }
              }
              // Arrow keys logic to "exit" the node
              if (e.key === 'ArrowRight') {
                const selection = window.getSelection();
                if (selection && selection.anchorOffset === (inputRef.current?.textContent?.length || 0)) {
                  e.preventDefault();
                  setIsEditing(false);
                  const pos = getPos();
                  if (typeof pos === 'number') {
                    editor.chain().focus().setTextSelection(pos + node.nodeSize).run();
                  }
                }
              }
              if (e.key === 'ArrowLeft') {
                const selection = window.getSelection();
                if (selection && selection.anchorOffset === 0) {
                  e.preventDefault();
                  setIsEditing(false);
                  const pos = getPos();
                  if (typeof pos === 'number') {
                    editor.chain().focus().setTextSelection(pos).run();
                  }
                }
              }
              e.stopPropagation();
            }}
          />
          <span className="opacity-40 font-bold ml-0.5">$</span>
        </span>
      ) : (
        <span
          key="view"
          ref={renderRef}
          contentEditable={false}
          className="cursor-pointer hover:ring-2 hover:ring-nb-tertiary/20 rounded px-1 transition-all"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const pos = getPos();
            if (typeof pos === 'number') {
              if (selected) {
                setIsEditing(true);
              } else {
                editor.commands.setNodeSelection(pos);
              }
            }
          }}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const pos = getPos();
            if (typeof pos === 'number') {
              editor.commands.setNodeSelection(pos);
              setIsEditing(true);
            }
          }}
        />
      )}
    </NodeViewWrapper>
  );
}

export const InlineMathNode = Node.create({
  name: "inlineMath",
  group: "inline",
  inline: true,
  selectable: true,
  atom: true,
  marks: "", // Prevent formatting marks like bold/code on this node

  addAttributes() {
    return {
      latex: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="inline-math"]',
        getAttrs: (element) => ({
          latex: (element as HTMLElement).getAttribute("data-latex"),
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["span", { "data-type": "inline-math", "data-latex": node.attrs.latex, ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(InlineMathNodeView, {
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement;
        return !!(target?.closest('[contenteditable]') || target?.closest('input') || target?.closest('textarea'));
      },
      ignoreMutation: () => true,
    });
  },

  addCommands() {
    return {
      setInlineMath: (latex: string) => ({ chain, state }: import("@tiptap/core").CommandProps) => {
        const { from } = state.selection;
        return chain()
          .insertContent({
            type: this.name,
            attrs: { latex },
          })
          .command(({ state, commands }) => {
            let foundPos = -1;
            state.doc.nodesBetween(from, from + 2, (node, pos) => {
              if (node.type.name === 'inlineMath') {
                foundPos = pos;
                return false;
              }
            });
            if (foundPos >= 0) {
              commands.setNodeSelection(foundPos);
            }
            return true;
          })
          .run();
      },
      toggleInlineMath: () => ({ chain, editor }: import("@tiptap/core").CommandProps) => {
        const { from, to, $from } = editor.state.selection;

        // Find the math node if it's selected or if the cursor is touching it
        let mathNodePos = -1;
        let mathNode: import("@tiptap/pm/model").Node | null = null;

        // 1. Check current selection range
        editor.state.doc.nodesBetween(from, to, (node, pos) => {
          if (node.type.name === this.name) {
            mathNodePos = pos;
            mathNode = node;
            return false;
          }
        });

        // 2. If not found, check if cursor is adjacent to one
        if (!mathNode) {
          const nodeBefore = $from.nodeBefore;
          const nodeAfter = $from.nodeAfter;

          if (nodeBefore?.type.name === this.name) {
            mathNode = nodeBefore;
            mathNodePos = from - nodeBefore.nodeSize;
          } else if (nodeAfter?.type.name === this.name) {
            mathNode = nodeAfter;
            mathNodePos = from;
          }
        }

        // If found, convert back to text
        if (mathNode) {
          return chain()
            .insertContentAt({ from: mathNodePos, to: mathNodePos + mathNode.nodeSize }, mathNode.attrs.latex || "")
            .setTextSelection({ from: mathNodePos, to: mathNodePos + (mathNode.attrs.latex?.length || 0) })
            .run();
        }

        // Otherwise, create a new math node from selection
        const text = editor.state.doc.textBetween(from, to, " ");
        return chain()
          .unsetMark("code")
          .insertContent({
            type: this.name,
            attrs: { latex: text },
          })
          .command(({ state, commands }) => {
            let foundPos = -1;
            state.doc.nodesBetween(from, from + 2, (node, pos) => {
              if (node.type.name === 'inlineMath') {
                foundPos = pos;
                return false;
              }
            });
            if (foundPos >= 0) {
              commands.setNodeSelection(foundPos);
            }
            return true;
          })
          .run();
      },
    } as unknown as import("@tiptap/core").RawCommands;
  },

  addInputRules() {
    return [
      new InputRule({
        find: /(?:^|[^$])\$([^$]+)\$$/,
        handler: ({ range, match, chain }) => {
          const fullMatch = match[0];
          const latex = match[1];
          
          if (latex) {
            // If the match starts with a character before $, we need to keep that character
            const hasLeadingChar = !fullMatch.startsWith('$');
            const actualRange = {
              from: hasLeadingChar ? range.from + 1 : range.from,
              to: range.to
            };

            chain()
              .deleteRange(actualRange)
              .insertContent({
                type: this.name,
                attrs: { latex: latex.trim() },
              })
              .run();
          }
        },
      }),
    ];
  },
});
