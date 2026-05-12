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

  // Sync isEditing with selected state
  useEffect(() => {
    if (selected) {
      setIsEditing(true);
    }
  }, [selected]);

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
    if (isEditing && inputRef.current && document.activeElement !== inputRef.current) {
      if (inputRef.current.textContent !== node.attrs.latex) {
        inputRef.current.textContent = node.attrs.latex;
      }
      
      const pos = getPos();
      const isComingFromRight = typeof pos === 'number' && prevSelectionPos.current >= pos + 1;
      
      inputRef.current.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      
      if (sel && inputRef.current.childNodes.length > 0) {
        const textNode = inputRef.current.childNodes[0];
        const offset = isComingFromRight ? (node.attrs.latex?.length || 0) : 0;
        range.setStart(textNode, Math.min(offset, textNode.textContent?.length || 0));
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }, [isEditing, node.attrs.latex]);

  // Render KaTeX when not editing
  useEffect(() => {
    if (!isEditing && renderRef.current) {
      try {
        katex.render(node.attrs.latex || "", renderRef.current, {
          throwOnError: false,
          displayMode: false,
        });
      } catch (e) {
        renderRef.current.textContent = node.attrs.latex;
      }
    }
  }, [node.attrs.latex, isEditing]);

  return (
    <NodeViewWrapper as="span" className="nb-inline-math-node mx-0.5 px-0.5 rounded transition-colors inline-flex items-center align-middle relative">
      {isEditing ? (
        <span key="edit" className="flex items-center bg-nb-outline-variant/15 text-nb-on-surface border-b border-nb-outline-variant/50 px-1 py-0.5 font-mono text-[0.95em] rounded-t-sm">
          <span className="opacity-40 font-bold mr-0.5">$</span>
          <span
            ref={inputRef}
            contentEditable
            suppressContentEditableWarning
            className="outline-none min-w-[1ch] focus:ring-0"
            onInput={(e) => {
              const text = e.currentTarget.textContent || "";
              updateAttributes({ latex: text });
            }}
            onBlur={() => {
              setIsEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setIsEditing(false);
                editor.commands.focus();
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
          onClick={() => {
            const pos = getPos();
            if (typeof pos === 'number') {
              editor.commands.setNodeSelection(pos);
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
        return !!target?.closest('.nb-inline-math-node [contenteditable="true"]');
      },
    });
  },

  addCommands() {
    return {
      setInlineMath: (latex: string) => ({ commands }: any) => {
        return commands.insertContent({
          type: this.name,
          attrs: { latex },
        });
      },
      toggleInlineMath: () => ({ chain, editor }: any) => {
        const { from, to, $from } = editor.state.selection;
        
        // Find the math node if it's selected or if the cursor is touching it
        let mathNodePos = -1;
        let mathNode: any = null;

        // 1. Check current selection range
        editor.state.doc.nodesBetween(from, to, (node: any, pos: number) => {
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
          .setNodeSelection(from)
          .run();
      },
    } as any;
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\$([^$]+)\$$/,
        handler: ({ range, match, chain }) => {
          const [fullMatch, latex] = match;
          if (latex) {
            chain()
              .deleteRange(range)
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
