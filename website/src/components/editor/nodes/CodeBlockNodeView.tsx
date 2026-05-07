import React, { useState } from "react";
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react";
import { CodeBlock, type CodeBlockOptions } from "@tiptap/extension-code-block";
import { GripVertical, Trash2, Code2, ChevronDown } from "lucide-react";

import { NodeViewProps } from "./types";

export const LANGUAGES: Record<string, string> = {
  plaintext: "Plain Text",
  cpp: "C++",
  c: "C",
  python: "Python",
  javascript: "JavaScript",
  typescript: "TypeScript",
  java: "Java",
  bash: "Bash/Shell",
  sql: "SQL",
  rust: "Rust",
  go: "Go",
  csharp: "C#",
};

export function CodeBlockNodeView({ node, updateAttributes, deleteNode, editor, selected, getPos }: NodeViewProps) {
  const [isCursorInside, setIsCursorInside] = useState(false);
  const [dragEnabled, setDragEnabled] = useState(false);

  React.useEffect(() => {
    const check = () => {
      try {
        const pos = getPos();
        if (typeof pos !== 'number' || pos < 0) return;
        const { from, to } = editor.state.selection;
        setIsCursorInside(from >= pos && to <= pos + node.nodeSize);
      } catch { }
    };
    check();
    editor.on('selectionUpdate', check);
    return () => { editor.off('selectionUpdate', check); };
  }, [editor, getPos, node.nodeSize]);

  const active = selected || isCursorInside;

  return (
    <NodeViewWrapper
      draggable={dragEnabled}
      data-id={node.attrs.id}
      className={`my-6 group relative w-full transition ${active ? 'z-[100]' : 'z-10'}`}
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
          title="Delete Snippet"
          className="w-8 h-8 rounded-full bg-nb-surface text-red-500 flex items-center justify-center hover:bg-red-50 transition border border-nb-outline-variant/30 shadow-sm"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className={`rounded-xl border border-nb-outline-variant/30 overflow-hidden bg-nb-surface transition-all duration-300 ${active ? 'ring-2 ring-nb-primary/50' : ''}`}>
        <div contentEditable={false} className="flex items-center justify-between px-4 py-2 bg-nb-surface-low/80 border-b border-nb-outline-variant/10">
          <div className="flex-1 flex items-center gap-3">
            <div className="flex items-center gap-2 text-nb-primary shrink-0">
              <Code2 size={12} />
            </div>
            <input
              type="text"
              value={node.attrs.title || ""}
              onChange={(e) => updateAttributes({ title: e.target.value })}
              placeholder="Code Snippet Title..."
              className="flex-1 bg-transparent border-none outline-none text-[12px] font-bold tracking-wider text-nb-on-surface-variant placeholder:text-nb-on-surface-variant/30"
            />
            <div className="relative group/select shrink-0 ml-auto">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-nb-surface-low border border-nb-outline-variant/50 hover:border-nb-primary/50 hover:bg-nb-surface transition-all cursor-pointer">
                <select
                  value={node.attrs.language}
                  onChange={(e) => updateAttributes({ language: e.target.value })}
                  className="text-[10px] font-bold tracking-widest bg-transparent border-none outline-none text-nb-on-surface cursor-pointer transition-colors appearance-none pr-4"
                >
                  {Object.entries(LANGUAGES).map(([key, label]) => (
                    <option key={key} value={key} className="text-nb-on-surface bg-nb-surface">{label}</option>
                  ))}
                </select>
                <ChevronDown size={10} className="absolute right-2 text-nb-on-surface-variant/40 group-hover/select:text-nb-primary transition-colors pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-row items-stretch">
          <div contentEditable={false} className="select-none text-right px-4 py-6 border-r border-nb-outline-variant/10 text-nb-on-surface-variant/20 font-mono text-[12px] leading-[1.8] bg-nb-surface-low/30 min-w-[56px] shrink-0">
            {node.textContent.split('\n').map((_, i) => (
              <div key={i} className="h-[1.8em]">{i + 1}</div>
            ))}
          </div>
          <NodeViewContent
            as="div"
            spellCheck="false"
            data-placeholder="Paste your code here..."
            className={`flex-1 relative py-6 pl-3 pr-6 overflow-x-auto text-[12px] leading-[1.8] font-mono whitespace-pre language-${node.attrs.language} ${node.textContent.length === 0 ? 'is-empty' : ''}`}
          />
        </div>

        <div contentEditable={false} className="bg-nb-surface-low/30 border-t border-nb-outline-variant/10 px-4 py-2 flex items-center justify-center gap-2 group/caption">
          <input
            type="text"
            value={node.attrs.caption || ""}
            onChange={(e) => updateAttributes({ caption: e.target.value })}
            placeholder="What does this code do?"
            className="w-full bg-transparent border-none outline-none text-center text-xs font-medium italic text-nb-on-surface/50 group-hover/caption:text-nb-on-surface focus:text-nb-on-surface focus:opacity-100 transition-all"
          />
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const CustomCodeBlock = CodeBlock.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      languageClassPrefix: 'language-',
      defaultLanguage: null,
      exitOnTripleEnter: true,
      exitOnArrowDown: true,
      HTMLAttributes: {},
    } as unknown as CodeBlockOptions;
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-id'),
        renderHTML: attributes => ({ 'data-id': attributes.id }),
      },
      language: { default: "plaintext" },
      caption: { default: "" },
      title: { default: "" },
    };
  },
  draggable: true,
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView);
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
