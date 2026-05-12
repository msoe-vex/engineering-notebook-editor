import React, { useState, useRef, useEffect } from "react";
import { NodeViewWrapper, ReactNodeViewRenderer, Node } from "@tiptap/react";
import { GripVertical, Trash2, Sigma, Edit3 } from "lucide-react";
import katex from "katex";
import "katex/dist/katex.min.css";

import { NodeViewProps } from "./types";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    setMathBlock: (latex: string) => ReturnType;
  }
}

export function MathBlockNodeView({ node, updateAttributes, deleteNode, editor, selected }: NodeViewProps) {
  const [isEditing, setIsEditing] = useState(selected);
  const [isHoveringToolbar, setIsHoveringToolbar] = useState(false);
  const [dragEnabled, setDragEnabled] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const renderRef = useRef<HTMLDivElement>(null);

  const prevSelected = useRef(selected);

  // Sync isEditing with selected state (only on initial selection)
  useEffect(() => {
    if (selected && !prevSelected.current) {
      const timer = setTimeout(() => setIsEditing(true), 0);
      return () => clearTimeout(timer);
    }
    prevSelected.current = selected;
  }, [selected]);

  // Handle focus when entering edit mode
  React.useLayoutEffect(() => {
    if (isEditing && inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.focus();
      // Move cursor to end
      inputRef.current.selectionStart = inputRef.current.value.length;
      inputRef.current.selectionEnd = inputRef.current.value.length;

      // Initial auto-resize
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
    }
  }, [isEditing]);

  // Render KaTeX
  useEffect(() => {
    if (renderRef.current) {
      try {
        // Clear previous content to avoid duplicates if any
        renderRef.current.innerHTML = "";
        katex.render(node.attrs.latex || " ", renderRef.current, {
          throwOnError: false,
          displayMode: true,
        });
      } catch {
        renderRef.current.textContent = node.attrs.latex;
      }
    }
  }, [node.attrs.latex, isEditing]); // Re-render when toggling to ensure it's visible

  const active = selected || isEditing || isHoveringToolbar;

  return (
    <NodeViewWrapper
      draggable={dragEnabled}
      data-id={node.attrs.id}
      className={`my-6 group relative w-full transition ${active ? 'z-[100]' : 'z-10'} pl-12`}>

      {/* Side Toolbar */}
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
          title="Delete Math Block"
          className="w-8 h-8 rounded-full bg-nb-surface text-red-500 flex items-center justify-center hover:bg-red-50 transition border border-nb-outline-variant/30 shadow-sm"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className={`rounded-xl border border-nb-outline-variant/30 overflow-hidden bg-nb-surface transition-all duration-300 ${active ? 'ring-2 ring-nb-primary/50' : ''}`}>
        {/* Header Toolbar */}
        <div
          contentEditable={false}
          onMouseEnter={() => setIsHoveringToolbar(true)}
          onMouseLeave={() => setIsHoveringToolbar(false)}
          className="flex items-center gap-1.5 px-4 py-2 bg-nb-surface-low/80 border-b border-nb-outline-variant/10"
        >
          <div className="flex-1 flex items-center gap-1.5 shrink-0">
            <Sigma size={12} className="text-nb-primary" />
            <input
              type="text"
              value={node.attrs.title || ""}
              onChange={(e) => updateAttributes({ title: e.target.value })}
              placeholder="Equation Title..."
              className="flex-1 bg-transparent border-none outline-none text-[12px] font-bold tracking-wider text-nb-on-surface-variant placeholder:text-nb-on-surface-variant/30"
            />
          </div>

          <div className="flex-1" />

          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`p-1.5 rounded transition-colors ${isEditing ? 'bg-nb-primary text-white' : 'hover:bg-nb-surface-high text-nb-on-surface-variant'}`}
            title={isEditing ? "Finish Editing" : "Edit Source"}
          >
            <Edit3 size={14} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex flex-col items-stretch justify-center min-h-[6rem] relative">
          {/* Edit View */}
          <div
            className="w-full px-6 py-4 bg-nb-surface-low/30"
            style={{ display: isEditing ? 'block' : 'none' }}
          >
            <textarea
              ref={inputRef}
              value={node.attrs.latex}
              onChange={(e) => {
                updateAttributes({ latex: e.target.value });
                // Auto-resize
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              onBlur={() => setIsEditing(false)}
              placeholder="Type LaTeX here (e.g. ax^2 + bx + c = 0)..."
              spellCheck="false"
              autoCorrect="off"
              autoCapitalize="off"
              className="w-full bg-transparent text-nb-on-surface font-mono text-[14px] outline-none resize-none overflow-hidden text-center placeholder:text-nb-on-surface-variant/20"
              style={{ height: 'auto' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  setIsEditing(false);
                  editor.commands.focus();
                }
                if (e.key === 'Escape') {
                  setIsEditing(false);
                  editor.commands.focus();
                }
                if (e.key === 'Backspace' && node.attrs.latex === "") {
                  e.preventDefault();
                  deleteNode();
                  editor.commands.focus();
                }
                e.stopPropagation();
              }}
            />
          </div>

          {/* Render View */}
          <div
            ref={renderRef}
            onClick={() => setIsEditing(true)}
            className="cursor-pointer hover:bg-nb-surface-high/20 px-6 py-8 transition-colors w-full flex justify-center overflow-x-auto custom-scrollbar"
            style={{ display: isEditing ? 'none' : 'flex' }}
          />
        </div>

        {/* Caption Area */}
        <div contentEditable={false} className="bg-nb-surface-low/30 border-t border-nb-outline-variant/10 px-4 py-2 flex items-center justify-center gap-2 group/caption">
          <input
            type="text"
            value={node.attrs.caption || ""}
            onChange={(e) => updateAttributes({ caption: e.target.value })}
            placeholder="Add a caption to this equation..."
            className="w-full bg-transparent border-none outline-none text-center text-xs font-medium italic text-nb-on-surface/50 group-hover/caption:text-nb-on-surface focus:text-nb-on-surface focus:opacity-100 transition-all"
          />
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const MathBlockNode = Node.create({
  name: "mathBlock",
  group: "block",
  content: "",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-id"),
        renderHTML: (attributes) => ({ "data-id": attributes.id }),
      },
      latex: { default: "" },
      title: { default: "" },
      caption: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="math-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { "data-type": "math-block", ...HTMLAttributes }];
  },

  addCommands() {
    return {
      setMathBlock: (latex: string) => ({ commands }: import("@tiptap/core").CommandProps) => {
        return commands.insertContent({
          type: this.name,
          attrs: { latex, id: crypto.randomUUID() },
        });
      },
    } as unknown as import("@tiptap/core").RawCommands;
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockNodeView);
  },
});
