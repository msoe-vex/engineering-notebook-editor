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

  // Handle focus when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      if (inputRef.current.textContent !== node.attrs.latex) {
        inputRef.current.textContent = node.attrs.latex;
      }
      // Focus and move cursor to end
      inputRef.current.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(inputRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [isEditing]);

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
        <span key="edit" className="flex items-center bg-nb-tertiary/5 text-nb-tertiary border-b border-nb-tertiary/40 px-1 py-0.5 font-mono text-[0.95em]">
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
                inputRef.current?.blur();
                editor.commands.focus();
              }
              // Arrow keys logic to "exit" the node
              if (e.key === 'ArrowRight') {
                const selection = window.getSelection();
                if (selection && selection.anchorOffset === (inputRef.current?.textContent?.length || 0)) {
                  e.preventDefault();
                  inputRef.current?.blur();
                  const pos = getPos();
                  if (typeof pos === 'number') {
                    editor.commands.setTextSelection(pos + node.nodeSize);
                  }
                }
              }
              if (e.key === 'ArrowLeft') {
                const selection = window.getSelection();
                if (selection && selection.anchorOffset === 0) {
                  e.preventDefault();
                  inputRef.current?.blur();
                  const pos = getPos();
                  if (typeof pos === 'number') {
                    editor.commands.setTextSelection(pos);
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
        const { from, to } = editor.state.selection;
        const text = editor.state.doc.textBetween(from, to, " ");
        
        return chain()
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
