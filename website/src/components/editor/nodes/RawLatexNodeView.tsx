import React, { useState } from "react";
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react";
import { CodeBlock } from "@tiptap/extension-code-block";
import { GripVertical, Trash2, Terminal } from "lucide-react";

import { NodeViewProps } from "./types";

export function RawLatexNodeView({ node, deleteNode, selected, editor, updateAttributes }: NodeViewProps) {
  const [dragEnabled, setDragEnabled] = useState(false);

  return (
    <NodeViewWrapper
      draggable={dragEnabled}
      className={`my-6 group relative w-full transition ${selected ? 'z-[100]' : 'z-10'} pl-12`}
    >
      <div contentEditable={false} className="absolute left-0 top-0 bottom-0 w-8 flex flex-col items-center justify-center gap-2 z-[70]">
        <div
          data-drag-handle
          onMouseEnter={() => setDragEnabled(true)}
          onMouseLeave={() => setDragEnabled(false)}
          className="w-8 h-8 rounded-full bg-nb-surface text-nb-on-surface-variant flex items-center justify-center cursor-grab active:cursor-grabbing shadow-sm border border-nb-outline-variant/30 hover:bg-nb-surface-high hover:text-nb-primary transition"
        >
          <GripVertical size={14} />
        </div>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteNode(); editor.commands.focus(); }}
          title="Delete Block"
          className="w-8 h-8 rounded-full bg-nb-surface text-red-500 flex items-center justify-center hover:bg-red-50 transition border border-nb-outline-variant/30 shadow-sm"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className={`rounded-xl border border-nb-outline-variant/30 overflow-hidden bg-nb-surface transition-all duration-300 ${selected ? 'ring-2 ring-nb-primary/50' : ''}`}>
        <div className="flex items-center justify-between px-4 py-2 bg-nb-surface-low/50 border-b border-nb-outline-variant/10">
          <div className="flex-1 flex items-center gap-2">
            <Terminal size={12} className="text-nb-primary shrink-0" />
            <span className="text-[10px] font-black tracking-[0.2em] text-nb-on-surface-variant/50 uppercase">Raw LaTeX</span>
          </div>
        </div>
        <div className="flex flex-row items-stretch">
          <NodeViewContent
            as="div"
            spellCheck="false"
            autoCorrect="off"
            autoCapitalize="off"
            data-placeholder="Type your LaTeX code here..."
            className={`flex-1 relative py-6 px-6 overflow-x-auto text-[12px] leading-[1.8] font-mono whitespace-pre language-latex ${node.textContent.length === 0 ? 'is-empty' : ''}`}
          />
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const CustomRawLatex = CodeBlock.extend({
  name: "rawLatex",
  addOptions() {
    return {
      ...this.parent!(),
      languageClassPrefix: 'language-',
      defaultLanguage: null,
      exitOnTripleEnter: true,
      exitOnArrowDown: true,
      HTMLAttributes: {},
    };
  },
  addAttributes() {
    return {
      ...this.parent!(),
      content: { default: "" },
      caption: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="raw-latex"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-type': 'raw-latex', ...HTMLAttributes }, 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(RawLatexNodeView);
  },
  addInputRules() {
    return [];
  },
  addKeyboardShortcuts() {
    return {
      'Mod-a': ({ editor }) => {
        const { state } = editor;
        const { selection } = state;
        const { $from, $to } = selection;

        let blockPos = -1;
        let blockSize = -1;

        state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
          if (node.type.name === this.name) {
            blockPos = pos;
            blockSize = node.nodeSize;
            return false;
          }
        });

        if (blockPos !== -1) {
          const isFullSelected = selection.from === blockPos + 1 && selection.to === blockPos + blockSize - 1;
          if (!isFullSelected) {
            editor.commands.setTextSelection({
              from: blockPos + 1,
              to: blockPos + blockSize - 1,
            });
            return true;
          }
        }
        return false;
      },
      Backspace: ({ editor }) => {
        const { state } = editor;
        const { selection } = state;
        const { $from } = selection;

        if (selection.empty && $from.parent.type.name === this.name && $from.parent.content.size === 0) {
          return editor.commands.deleteNode(this.name);
        }
        return false;
      },
    };
  },
});
