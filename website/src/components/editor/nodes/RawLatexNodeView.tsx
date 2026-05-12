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
      data-id={node.attrs.id}
      className={`my-6 group relative w-full transition ${selected ? 'z-[100]' : 'z-10'}`}
    >
      <div contentEditable={false} className="absolute -left-12 top-0 bottom-0 w-8 flex flex-col items-center justify-center gap-2 z-[70]">
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
        <div className="flex items-center justify-between px-4 py-2 bg-nb-surface-low/50 border-b border-nb-outline-variant/10 overflow-x-auto scrollbar-hide">
          <div className="flex-1 flex items-center gap-2">
            <Terminal size={12} className="text-nb-primary shrink-0" />
            <input
              type="text"
              value={node.attrs.title || ""}
              onChange={(e) => updateAttributes({ title: e.target.value })}
              placeholder="LaTeX Block Title..."
              className="flex-1 bg-transparent border-none outline-none text-[10px] font-bold tracking-widest text-nb-on-surface-variant placeholder:text-nb-on-surface-variant/30"
            />
          </div>
        </div>
        <pre spellCheck="false" className="p-6 text-[12px] leading-[1.8] overflow-x-auto border-none m-0 text-nb-on-surface bg-transparent language-latex">
          <NodeViewContent as="div" className="font-mono" />
        </pre>
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
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-id'),
        renderHTML: attributes => ({ 'data-id': attributes.id }),
      },
      content: { default: "" },
      caption: { default: "" },
      title: { default: "" },
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
    };
  },
});
