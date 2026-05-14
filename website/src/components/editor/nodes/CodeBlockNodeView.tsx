import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react";
import { CodeBlock, type CodeBlockOptions } from "@tiptap/extension-code-block";
import { GripVertical, Trash2, Code2, ChevronDown, Check } from "lucide-react";

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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    const handleScroll = () => {
      if (buttonRef.current) {
        setDropdownRect(buttonRef.current.getBoundingClientRect());
      }
    };

    window.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);

    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [isDropdownOpen]);

  const toggleDropdown = () => {
    if (buttonRef.current) {
      setDropdownRect(buttonRef.current.getBoundingClientRect());
    }
    setIsDropdownOpen(!isDropdownOpen);
  };

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
      className={`my-6 group relative w-full transition ${active ? 'z-[100]' : 'z-10'} pl-12`}
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
          title="Delete Snippet"
          className="w-8 h-8 rounded-full bg-nb-surface text-red-500 flex items-center justify-center hover:bg-red-50 transition border border-nb-outline-variant/30 shadow-sm"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className={`rounded-xl border border-nb-outline-variant/30 overflow-hidden bg-nb-surface transition-all duration-300 ${active ? 'ring-2 ring-nb-primary/50' : ''}`}>
        <div contentEditable={false} className="flex items-center justify-between px-4 py-2 bg-nb-surface-low/80 border-b border-nb-outline-variant/10 overflow-x-auto scrollbar-hide">
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
            <div className="relative shrink-0 ml-auto">
              <button
                ref={buttonRef}
                type="button"
                onClick={toggleDropdown}
                className={`flex items-center gap-2 px-3 py-1 rounded-full transition-all border ${isDropdownOpen
                    ? "bg-nb-primary border-nb-primary text-white shadow-lg shadow-nb-primary/20"
                    : "bg-nb-surface-low border-nb-outline-variant/50 text-nb-on-surface-variant hover:border-nb-primary/50 hover:bg-nb-surface hover:text-nb-on-surface"
                  }`}
              >
                <span className="text-[9px] font-black tracking-[0.15em] uppercase">
                  {LANGUAGES[node.attrs.language] || "Plain Text"}
                </span>
                <ChevronDown size={10} className={`transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {isDropdownOpen && dropdownRect && createPortal(
                <div
                  ref={dropdownRef}
                  style={{
                    position: 'fixed',
                    top: dropdownRect.bottom + 8,
                    left: dropdownRect.right - 192, // 192px is w-48
                    width: '192px',
                    zIndex: 9999,
                  }}
                  className="bg-nb-surface border border-nb-outline-variant shadow-nb-2xl rounded-xl p-1.5 animate-in fade-in zoom-in-95 duration-200 ring-1 ring-nb-primary/10"
                >
                  <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                    {Object.entries(LANGUAGES).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          updateAttributes({ language: key });
                          setIsDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[10px] font-bold tracking-widest transition-all text-left cursor-pointer active:scale-[0.98] ${node.attrs.language === key
                            ? "bg-nb-primary/10 text-nb-primary"
                            : "text-nb-on-surface-variant hover:bg-nb-surface-mid hover:text-nb-on-surface"
                          }`}
                      >
                        <span className="uppercase">{label}</span>
                        {node.attrs.language === key && <Check size={10} />}
                      </button>
                    ))}
                  </div>
                </div>,
                document.body
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-row items-stretch">
          <div contentEditable={false} className="select-none text-right px-4 py-6 border-r border-nb-outline-variant/10 text-nb-on-surface-variant/20 font-mono text-[14px] leading-[1.8] bg-nb-surface-low/30 min-w-[56px] shrink-0">
            {node.textContent.split('\n').map((_, i) => (
              <div key={i} className="h-[1.8em]">{i + 1}</div>
            ))}
          </div>
          <NodeViewContent
            as="div"
            spellCheck="false"
            data-placeholder="Paste your code here..."
            className={`flex-1 relative py-6 pl-3 pr-6 overflow-x-hidden text-[14px] leading-[1.8] font-mono whitespace-pre-wrap break-words language-${node.attrs.language} ${node.textContent.length === 0 ? 'is-empty' : ''}`}
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
