"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  useEditor, EditorContent, Extension,
  NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer,

} from "@tiptap/react";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Slice, Fragment } from "@tiptap/pm/model";
import { getResource } from "@/lib/db";
import { remapContentIds, extractResources } from "@/lib/metadata";
import StarterKit from "@tiptap/starter-kit";
import { Image as TiptapImage } from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { CodeBlock } from "@tiptap/extension-code-block";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";

import Prism from "prismjs";
import "prismjs/components/prism-latex";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-go";
import "prismjs/components/prism-java";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-typescript";

// Fix Prism LaTeX highlighting for escaped percents
if (Prism.languages.latex) {
  const { comment, ...rest } = Prism.languages.latex;
  Prism.languages.latex = { ...rest, comment };
  Prism.languages.tex = Prism.languages.latex;
  Prism.languages.context = Prism.languages.latex;
}


import {
  Bold, Italic, List, ListOrdered, Code,
  Heading1, Heading2, Image as ImageIcon,
  Table as TableIcon, Undo, Redo, Trash2,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Pencil, AlertTriangle, FileCode, Check, Code2, MoreVertical, Settings, UserCircle, Grid3X3, GripVertical,
  Scissors as Scissor, Copy, Clipboard, Terminal, X, Underline as UnderlineIcon, Link2Off, ExternalLink
} from "lucide-react";
import { generateUUID, hashContent, getExtensionFromDataUrl } from "@/lib/utils";

export const LANGUAGES = [
  "plaintext", "cpp", "c", "python", "javascript",
  "typescript", "java", "bash", "sql", "rust", "go", "csharp",
];

const CustomLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      resourceId: {
        default: null,
        parseHTML: element => element.getAttribute('data-resource-id'),
        renderHTML: attributes => {
          if (!attributes.resourceId) return {};
          return { 'data-resource-id': attributes.resourceId };
        },
      },
    };
  },
  addProseMirrorPlugins() {
    return this.parent?.() || [];
  },
});

function getPrismDecorations(doc: any) {
  const decorations: Decoration[] = [];

  doc.descendants((node: any, pos: number) => {
    if (node.type.name === 'codeBlock' || node.type.name === 'rawLatex') {
      const language = node.attrs.language || (node.type.name === 'rawLatex' ? 'latex' : 'plaintext');
      const text = node.textContent;
      const prismLang = Prism.languages[language] || Prism.languages.markup || {};

      const tokens = Prism.tokenize(text, prismLang);

      let currentPos = pos + 1;

      const addDecorations = (tokenList: any[]) => {
        tokenList.forEach(token => {
          if (typeof token === 'string') {
            currentPos += token.length;
          } else {
            const length = Array.isArray(token.content)
              ? token.content.reduce((acc: number, t: any) => acc + (typeof t === 'string' ? t.length : (t.length || 0)), 0)
              : token.length || token.content.length;

            decorations.push(Decoration.inline(currentPos, currentPos + length, {
              class: `token ${token.type} ${token.alias || ''}`.trim()
            }));

            if (Array.isArray(token.content)) {
              addDecorations(token.content);
            } else {
              currentPos += length;
            }
          }
        });
      };

      addDecorations(tokens);
    }
    return true;
  });

  return DecorationSet.create(doc, decorations);
}

const PrismHighlightPlugin = new Plugin({
  key: new PluginKey('prism-highlight'),
  state: {
    init: (_, { doc }) => getPrismDecorations(doc),
    apply: (tr, set) => {
      if (tr.docChanged) {
        return getPrismDecorations(tr.doc);
      }
      return set.map(tr.mapping, tr.doc);
    },
  },
  props: {
    decorations(state) {
      return this.getState(state);
    },
  },
});

const PrismHighlightExtension = Extension.create({
  name: 'prismHighlight',
  addProseMirrorPlugins() {
    return [PrismHighlightPlugin];
  },
});



export const ToolbarButton = ({
  onClick,
  active,
  disabled,
  children,
  title
}: {
  onClick: (e?: React.MouseEvent) => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string
}) => (
  <button
    type="button"
    onClick={(e) => !disabled && onClick(e)}
    disabled={disabled}
    title={title}
    className={`p-2 rounded-lg transition-all flex items-center justify-center border ${active
      ? "bg-nb-primary text-white shadow-md border-nb-primary scale-105"
      : "text-nb-on-surface-variant hover:bg-nb-surface-low hover:text-nb-on-surface border-transparent"
      } ${disabled ? "opacity-30 cursor-not-allowed grayscale" : ""}`}
  >
    {children}
  </button>
);

const ContextMenuItem = ({ label, icon, onClick, danger }: { label: string, icon: React.ReactNode, onClick: () => void, danger?: boolean }) => (
  <button
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[10px] font-bold tracking-widest transition-all ${danger ? "text-red-500 hover:bg-red-50" : "text-nb-on-surface-variant hover:bg-nb-primary/10 hover:text-nb-primary"} text-left`}
  >
    <div className="opacity-60">{icon}</div>
    <span>{label}</span>
  </button>
);

/* ─────────────────────────────────────────────────────────────────
   Image Node View  — caption/initials are editable inline
   ───────────────────────────────────────────────────────────────── */

export const TableGridSelector = ({ onSelect, initialRows = 0, initialCols = 0 }: { onSelect: (rows: number, cols: number) => void, initialRows?: number, initialCols?: number }) => {
  const [hovered, setHovered] = useState({ r: initialRows, c: initialCols });

  return (
    <div className="p-3 bg-nb-surface border border-nb-outline-variant shadow-nb-lg rounded-xl w-max">
      <div className="grid grid-cols-10 gap-1 mb-2 w-[180px]">
        {Array.from({ length: 10 }).map((_, r) => (
          Array.from({ length: 10 }).map((_, c) => (
            <div
              key={`${r}-${c}`}
              onMouseEnter={() => setHovered({ r: r + 1, c: c + 1 })}
              onClick={() => onSelect(r + 1, c + 1)}
              className={`w-3.5 h-3.5 rounded-sm border transition-colors cursor-pointer ${r < hovered.r && c < hovered.c
                ? "bg-nb-primary border-nb-primary"
                : "bg-nb-surface-low border-nb-outline-variant/30 hover:border-nb-primary/50"
                }`}
            />
          ))
        ))}
      </div>
      <div className="text-[10px] font-bold tracking-widest text-nb-on-surface-variant text-center bg-nb-surface-low py-1 rounded">
        {hovered.r > 0 ? `${hovered.r} x ${hovered.c}` : "Select Size"}
      </div>
    </div>
  );
};

const ImageWithCaption = TiptapImage.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      dbName: 'notebook-pending',
    } as any;
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-id'),
        renderHTML: attributes => ({ 'data-id': attributes.id }),
      },
      alt: { default: "" },
      title: { default: "" }, // Title for referencing
      initials: { default: "" }, // author initials (legacy title field)
      filePath: { default: null }, // disk path for LaTeX
      caption: { default: "" }, // unify with table/code
      width: { default: "100%" },
    };
  },
  draggable: true,
  addNodeView() {
    return ReactNodeViewRenderer((props) => <ImageNodeView {...props} dbName={(this.options as any).dbName} />);
  },
});

const ImageNodeView = ({ node, selected, updateAttributes, deleteNode, dbName, editor }: any) => {
  const [resolvedSrc, setResolvedSrc] = useState(node.attrs.src);
  const [dragEnabled, setDragEnabled] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (node.attrs.src?.startsWith('data:')) {
        if (active) setResolvedSrc(node.attrs.src);
        return;
      }
      try {
        const cached = await getResource(dbName, node.attrs.src);
        if (cached && active) {
          setResolvedSrc(cached);
          return;
        }
      } catch { }
      if (active) setResolvedSrc(node.attrs.src);
    };
    load();
    return () => { active = false; };
  }, [node.attrs.src, dbName]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = parseInt(node.attrs.width) || 100;
    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.min(100, Math.max(10, startWidth + (deltaX / 6.7)));
      updateAttributes({ width: `${Math.round(newWidth)}%` });
    };
    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <NodeViewWrapper
      draggable={dragEnabled}
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
        <div className="flex flex-col gap-1 items-center">
          <div className="text-[8px] font-bold tracking-tighter text-nb-on-surface-variant/40 rotate-90 whitespace-nowrap mb-2">IMAGE</div>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteNode(); (editor as any)?.commands.focus(); }}
            title="Delete Image"
            className="w-8 h-8 rounded-full bg-nb-surface text-red-500 flex items-center justify-center hover:bg-red-50 transition border border-nb-outline-variant/30 shadow-sm"
          >
            <Trash2 size={14} />
          </button>
        </div>

      </div>

      <div className={`rounded-xl border border-nb-outline-variant/30 overflow-hidden bg-nb-surface transition-all duration-300 ${selected ? 'ring-2 ring-nb-primary/50' : ''}`}>
        {/* Block Header */}
        <div contentEditable={false} className="flex items-center justify-between px-4 py-2 bg-nb-surface-low/50 border-b border-nb-outline-variant/10">
          <div className="flex-1 flex items-center gap-3">
            <ImageIcon size={12} className="text-nb-primary shrink-0" />
            <input
              type="text"
              value={node.attrs.title || ""}
              onChange={(e) => updateAttributes({ title: e.target.value })}
              placeholder="Give this image a title..."
              className="flex-1 bg-transparent border-none outline-none text-[10px] font-bold tracking-widest text-nb-on-surface-variant placeholder:text-nb-on-surface-variant/30"
            />
          </div>
          <div className="flex items-center gap-2 px-2 py-0.5 rounded-full bg-nb-surface-mid/50 border border-nb-outline-variant/20">
            <UserCircle size={10} className="text-nb-tertiary" />
            <input
              type="text"
              value={node.attrs.initials || ""}
              onChange={(e) => updateAttributes({ initials: e.target.value })}
              placeholder="Initials"
              className="w-12 bg-transparent border-none outline-none text-[8px] font-bold text-nb-on-surface-variant"
            />
          </div>
        </div>

        <div className="relative flex justify-center">
          <img
            src={resolvedSrc}
            alt={node.attrs.caption || node.attrs.alt || ""}
            style={{ width: node.attrs.width ?? "100%" }}
            className="h-auto block select-none pointer-events-none"
            draggable={false}
          />
          <div
            contentEditable={false}
            onMouseDown={startResize}
            className="absolute top-0 right-0 bottom-0 w-2 cursor-ew-resize hover:bg-nb-primary/30 transition-colors z-50 group/resize"
            aria-hidden="true"
          >
            <div className={`absolute top-1/2 -translate-y-1/2 right-0 w-1.5 h-12 bg-nb-primary rounded-l-full transition-opacity ${selected ? 'opacity-100' : 'opacity-30 group-hover/resize:opacity-100'}`} />
          </div>
        </div>

        <div contentEditable={false} className="bg-nb-surface-low/30 border-t border-nb-outline-variant/10 px-4 py-2 flex items-center justify-center gap-2 group/caption">
          <input
            type="text"
            value={node.attrs.caption || ""}
            onChange={(e) => updateAttributes({ caption: e.target.value })}
            placeholder="Add figure description..."
            className="w-full bg-transparent border-none outline-none text-center text-xs font-medium italic text-nb-on-surface/50 group-hover/caption:text-nb-on-surface focus:text-nb-on-surface focus:opacity-100 transition-all"
          />
        </div>

      </div>
    </NodeViewWrapper>
  );
};



/* ─────────────────────────────────────────────────────────────────
   Table Node View — with integrated controls
   ───────────────────────────────────────────────────────────────── */

const TableWithCaption = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-id'),
        renderHTML: attributes => ({ 'data-id': attributes.id }),
      },
      caption: { default: "" },
      title: { default: "" },
    };
  },
  draggable: true,
  addNodeView() {
    return ReactNodeViewRenderer(TableNodeView);
  },
});

const RestrictedTableCell = TableCell.extend({
  content: 'paragraph+',
});

const RestrictedTableHeader = TableHeader.extend({
  content: 'paragraph+',
});

function TableNodeView({ node, updateAttributes, deleteNode, editor, selected, getPos }: any) {
  const [isCursorInside, setIsCursorInside] = useState(false);
  const [isHoveringToolbar, setIsHoveringToolbar] = useState(false);
  const [dragEnabled, setDragEnabled] = useState(false);


  React.useEffect(() => {
    const check = () => {
      try {
        const pos = getPos();
        if (typeof pos !== 'number' || pos < 0) return;
        const { from, to } = editor.state.selection;
        setIsCursorInside(from >= pos && to <= pos + node.nodeSize);
      } catch (e) { }
    };
    check();
    editor.on('selectionUpdate', check);
    return () => { editor.off('selectionUpdate', check); };
  }, [editor, getPos, node.nodeSize]);

  const active = selected || isCursorInside || isHoveringToolbar;


  return (
    <NodeViewWrapper
      draggable={dragEnabled}
      className={`my-6 group relative w-full transition ${active ? 'z-[100]' : 'z-10'}`}>

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
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteNode(); (editor as any)?.commands.focus(); }}
          title="Delete Table"
          className="w-8 h-8 rounded-full bg-nb-surface text-red-500 flex items-center justify-center hover:bg-red-50 transition border border-nb-outline-variant/30 shadow-sm"
        >
          <Trash2 size={14} />
        </button>

      </div>

      <div className={`rounded-xl border border-nb-outline-variant/30 overflow-hidden bg-nb-surface transition-all duration-300 ${active ? 'ring-2 ring-nb-primary/50' : ''}`}>
        {/* Integrated Table Toolbar */}
        <div
          contentEditable={false}
          onMouseEnter={() => setIsHoveringToolbar(true)}
          onMouseLeave={() => setIsHoveringToolbar(false)}
          className="flex items-center gap-1.5 px-3 py-2 bg-nb-surface-low/50 border-b border-nb-outline-variant/10 overflow-x-auto"
        >

          <div className="flex items-center gap-1.5 pr-3 border-r border-nb-outline-variant/20 mr-1 shrink-0">
            <TableIcon size={12} className="text-nb-primary" />
            <input
              type="text"
              value={node.attrs.title || ""}
              onChange={(e) => updateAttributes({ title: e.target.value })}
              placeholder="Table Title..."
              className="bg-transparent border-none outline-none text-[10px] font-bold tracking-widest text-nb-on-surface-variant placeholder:text-nb-on-surface-variant/30 w-48"
            />
          </div>

          <div className={`flex items-center gap-0.5 shrink-0 transition-opacity duration-200 ${isCursorInside || isHoveringToolbar ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
            <div className="flex items-center bg-nb-surface border border-nb-outline-variant/30 p-0.5 rounded-lg shadow-sm">
              <button
                onMouseDown={(e) => { e.preventDefault(); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); editor.chain().focus(undefined, { scrollIntoView: false }).addRowBefore().run(); }}
                className="p-1.5 hover:bg-nb-surface-high rounded transition-colors text-nb-on-surface-variant hover:text-nb-primary"
                title="Add Row Above"
              >
                <ChevronUp size={12} />
              </button>

              <button
                onMouseDown={(e) => { e.preventDefault(); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); editor.chain().focus(undefined, { scrollIntoView: false }).addRowAfter().run(); }}
                className="p-1.5 hover:bg-nb-surface-high rounded transition-colors text-nb-on-surface-variant hover:text-nb-primary"
                title="Add Row Below"
              >
                <ChevronDown size={12} />
              </button>

              <div className="w-px h-3 bg-nb-outline-variant/30 mx-0.5" />
              <button
                onMouseDown={(e) => { e.preventDefault(); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); editor.chain().focus(undefined, { scrollIntoView: false }).deleteRow().run(); }}
                className="p-1.5 hover:bg-red-50 rounded transition-colors text-red-500"
                title="Delete Row"
              >
                <Trash2 size={12} />
              </button>
            </div>


            <div className="flex items-center bg-nb-surface border border-nb-outline-variant/30 p-0.5 ml-1.5 rounded-lg shadow-sm">
              <button
                onMouseDown={(e) => { e.preventDefault(); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); editor.chain().focus(undefined, { scrollIntoView: false }).addColumnBefore().run(); }}
                className="p-1.5 hover:bg-nb-surface-high rounded transition-colors text-nb-on-surface-variant hover:text-nb-primary"
                title="Add Column Left"
              >
                <ChevronLeft size={12} />
              </button>
              <button
                onMouseDown={(e) => { e.preventDefault(); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); editor.chain().focus(undefined, { scrollIntoView: false }).addColumnAfter().run(); }}
                className="p-1.5 hover:bg-nb-surface-high rounded transition-colors text-nb-on-surface-variant hover:text-nb-primary"
                title="Add Column Right"
              >
                <ChevronRight size={12} />
              </button>

              <div className="w-px h-3 bg-nb-outline-variant/30 mx-0.5" />
              <button
                onMouseDown={(e) => { e.preventDefault(); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); editor.chain().focus(undefined, { scrollIntoView: false }).deleteColumn().run(); }}
                className="p-1.5 hover:bg-red-50 rounded transition-colors text-red-500"
                title="Delete Column"
              >
                <Trash2 size={12} />
              </button>
            </div>

          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <NodeViewContent as={"table" as any} className="border-collapse min-w-full table-auto" />
        </div>

        <div contentEditable={false} className="bg-nb-surface-low/30 border-t border-nb-outline-variant/10 px-4 py-2 flex items-center justify-center gap-2 group/caption">
          <input
            type="text"
            value={node.attrs.caption || ""}
            onChange={(e) => updateAttributes({ caption: e.target.value })}
            placeholder="Describe this table..."
            className="w-full bg-transparent border-none outline-none text-center text-xs font-medium italic text-nb-on-surface/50 group-hover/caption:text-nb-on-surface focus:text-nb-on-surface focus:opacity-100 transition-all"
          />
        </div>

      </div>
    </NodeViewWrapper>
  );
}


/* ─────────────────────────────────────────────────────────────────
   Code Block Node View — per-block language selector inline
   ───────────────────────────────────────────────────────────────── */

const CustomCodeBlock = CodeBlock.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      languageClassPrefix: 'language-',
      defaultLanguage: null,
      exitOnTripleEnter: true,
      exitOnArrowDown: true,
      HTMLAttributes: {},
    } as any;
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



function CodeBlockNodeView({ node, updateAttributes, deleteNode, editor, selected, getPos }: any) {
  const [isCursorInside, setIsCursorInside] = useState(false);
  const [dragEnabled, setDragEnabled] = useState(false);

  React.useEffect(() => {
    const check = () => {
      try {
        const pos = getPos();
        if (typeof pos !== 'number' || pos < 0) return;
        const { from, to } = editor.state.selection;
        setIsCursorInside(from >= pos && to <= pos + node.nodeSize);
      } catch (e) { }
    };
    check();
    editor.on('selectionUpdate', check);
    return () => { editor.off('selectionUpdate', check); };
  }, [editor, getPos, node.nodeSize]);

  const active = selected || isCursorInside;

  return (
    <NodeViewWrapper
      draggable={dragEnabled}
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
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteNode(); (editor as any)?.commands.focus(); }}
          title="Delete Snippet"
          className="w-8 h-8 rounded-full bg-nb-surface text-red-500 flex items-center justify-center hover:bg-red-50 transition border border-nb-outline-variant/30 shadow-sm"
        >
          <Trash2 size={14} />
        </button>

      </div>

      <div className={`rounded-xl border border-nb-outline-variant/30 overflow-hidden bg-nb-surface transition-all duration-300 ${active ? 'ring-2 ring-nb-primary/50' : ''}`}>
        <div className="flex items-center justify-between px-4 py-2 bg-nb-surface-low/50 border-b border-nb-outline-variant/10">
          <div className="flex-1 flex items-center gap-3">
            <div className="flex items-center gap-2 text-nb-primary shrink-0">
              <Code2 size={12} />
            </div>
            <input
              type="text"
              value={node.attrs.title || ""}
              onChange={(e) => updateAttributes({ title: e.target.value })}
              placeholder="Code Snippet Title..."
              className="flex-1 bg-transparent border-none outline-none text-[10px] font-bold tracking-widest text-nb-on-surface-variant placeholder:text-nb-on-surface-variant/30"
            />
            <div className="relative group/select shrink-0 ml-auto">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-nb-surface-low border border-nb-outline-variant/50 hover:border-nb-primary/50 hover:bg-nb-surface transition-all cursor-pointer">
                <select
                  value={node.attrs.language}
                  onChange={(e) => updateAttributes({ language: e.target.value })}
                  className="text-[10px] font-bold tracking-widest bg-transparent border-none outline-none text-nb-on-surface-variant cursor-pointer hover:text-nb-primary transition-colors appearance-none pr-4"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
                <ChevronDown size={10} className="absolute right-2 text-nb-on-surface-variant/40 group-hover/select:text-nb-primary transition-colors pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
        <pre spellCheck="false" className={`p-6 text-[12px] leading-[1.8] overflow-x-auto border-none m-0 text-nb-on-surface bg-transparent language-${node.attrs.language}`}>
          <NodeViewContent as="div" className="font-mono" />
        </pre>

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



/* ─────────────────────────────────────────────────────────────────
   Raw LaTeX Node View
   ───────────────────────────────────────────────────────────────── */

const RawLatexBlock = StarterKit.options.codeBlock === false ? null : ({} as any); // placeholder if needed

const CustomRawLatex = CodeBlock.extend({
  name: "rawLatex",
  addOptions() {
    return {
      ...this.parent?.(),
      languageClassPrefix: 'language-',
      defaultLanguage: null,
      exitOnTripleEnter: true,
      exitOnArrowDown: true,
      HTMLAttributes: {},
    } as any;
  },

  addAttributes() {
    return {
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

const IdRemapper = Extension.create({
  name: 'idRemapper',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('idRemapper'),
        props: {
          transformPasted: (slice: Slice): Slice => {
            const json = slice.content.toJSON();
            const remapped = remapContentIds(json);
            try {
              const fragment = Fragment.fromJSON(this.editor.schema, remapped);
              return new Slice(fragment, slice.openStart, slice.openEnd);
            } catch (e) {
              console.error("Failed to remap pasted IDs", e);
              return slice;
            }
          }
        }
      })
    ]
  }
});

function RawLatexNodeView({ node, deleteNode, selected, editor, updateAttributes }: any) {

  const [dragEnabled, setDragEnabled] = useState(false);

  return (
    <NodeViewWrapper
      draggable={dragEnabled}
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
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteNode(); (editor as any)?.commands.focus(); }}
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



/* ─────────────────────────────────────────────────────────────────
   Main Component
   ───────────────────────────────────────────────────────────────── */

interface UnifiedEditorProps {
  content: string;
  onChange: (content: string) => void;
  onImageUpload?: (path: string, base64: string) => void;
  author?: string;
  filename: string;
  dbName?: string;
  onEditorInit?: (editor: any) => void;
  onToggleLink?: (fn: () => void) => void;
  notebookMetadata?: any;
}

function LinkReferencePopup({ 
  editor, 
  onClose, 
  metadata,
  filename
}: { 
  editor: any, 
  onClose: () => void, 
  metadata: any,
  filename?: string
}) {
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [selectedResource, setSelectedResource] = useState<{ id: string, title: string, type: string, entryTitle?: string, entryDate?: string } | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  useEffect(() => {
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, " ");
    setText(selectedText);
    
    if (editor.isActive('link')) {
      const attrs = editor.getAttributes('link');
      setLink(attrs.href || "");
      if (attrs.resourceId) {
        // Find resource in metadata
        let found = null;
        for (const entry of Object.values(metadata?.entries || {})) {
          const e = entry as any;
          if (e.id === attrs.resourceId) {
            found = { id: e.id, title: e.title, type: 'entry' };
            break;
          }
          if (e.resources?.[attrs.resourceId]) {
            found = { id: attrs.resourceId, ...e.resources[attrs.resourceId] };
            break;
          }
        }
        if (found) setSelectedResource(found);
      }
    }
  }, [editor, metadata]);

  const allResources = useMemo(() => {
    const list: any[] = [];
    if (!metadata || !metadata.entries) return list;

    // 1. Get resources from the current editor state (most up-to-date for active entry)
    const currentEntryId = (editor as any).options.element.closest('[data-filename]')?.dataset.filename?.split('/').pop()?.replace('.json', '') 
      || filename?.split('/').pop()?.replace('.json', '');
    
    // We can also just extract directly from the editor JSON
    const localResources = extractResources(editor.getJSON());

    for (const [entryId, entry] of Object.entries(metadata.entries)) {
      const e = entry as any;
      const entryTitle = e.title?.trim() || "Untitled Entry";
      const entryDate = e.createdAt?.split('T')[0];
      
      list.push({ id: e.id, title: entryTitle, type: "entry", entryTitle, entryDate });
      
      const resources = (e.id === currentEntryId) ? { ...e.resources, ...localResources } : (e.resources || {});
      
      for (const [resId, res] of Object.entries(resources)) {
        const r = res as any;
        const resTitle = r.title?.trim() || `Untitled ${r.type?.charAt(0).toUpperCase() + r.type?.slice(1) || 'Block'}`;
        list.push({ id: resId, title: resTitle, type: r.type, entryTitle, entryDate });
      }
    }
    return list;
  }, [metadata, editor, filename]);

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allResources.filter(r => 
      (r.title || "").toLowerCase().includes(q) || 
      (r.entryTitle || "").toLowerCase().includes(q)
    ).slice(0, 10);
  }, [allResources, query]);

  const handleApply = () => {
    const trimmedText = text.trim();
    let finalLink = selectedResource ? `#${selectedResource.id}` : link.trim();
    const resourceId = selectedResource?.id;

    // Auto-prepend https:// for external links that look like domains
    if (!selectedResource && finalLink && !finalLink.startsWith('#')) {
      const hasProtocol = /^[a-z]+:/i.test(finalLink);
      const isDomain = finalLink.includes('.') && !finalLink.includes(' ');
      if (!hasProtocol && isDomain) {
        finalLink = `https://${finalLink}`;
      }
    }

    if (finalLink || trimmedText) {
      const marks: any[] = [{ type: 'underline' }];
      if (finalLink) {
        marks.push({ type: 'link', attrs: { href: finalLink, resourceId } });
      }

      editor.chain()
        .focus()
        .insertContent({
          type: 'text',
          text: trimmedText || finalLink,
          marks: marks
        })
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').unsetLink().unsetMark('underline').run();
    }
    onClose();
  };

  const rect = editor.view.coordsAtPos(editor.state.selection.from);

  return (
    <div 
      className="fixed z-[1000] w-80 bg-nb-surface border border-nb-outline-variant shadow-nb-xl rounded-2xl p-5 animate-in zoom-in-95 fade-in duration-200"
      style={{ 
        top: Math.min(window.innerHeight - 400, rect.bottom + 10), 
        left: Math.min(window.innerWidth - 350, rect.left) 
      }}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-black tracking-widest text-nb-secondary">Insert Link/Reference</span>
        <button onClick={onClose} className="p-1.5 hover:bg-nb-surface-low rounded-lg transition-colors"><X size={16}/></button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-[10px] font-bold text-nb-on-surface-variant/50 mb-1.5">Display Text</label>
          <input 
            type="text" 
            value={text} 
            onChange={e => setText(e.target.value)}
            className="w-full px-3 py-2 bg-nb-surface-low border border-nb-outline-variant/30 rounded-lg outline-none text-sm focus:border-nb-primary transition-all"
            placeholder="Text to display..."
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-nb-on-surface-variant/50 mb-1.5">Link or Resource</label>
          <div className="relative">
            <input 
              type="text" 
              value={selectedResource ? selectedResource.title : link} 
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              onChange={e => {
                setLink(e.target.value);
                setSelectedResource(null);
                setQuery(e.target.value);
              }}
              className="w-full px-3 py-2 bg-nb-surface-low border border-nb-outline-variant/30 rounded-lg outline-none text-sm focus:border-nb-primary transition-all"
              placeholder="URL or search resource..."
            />
            {isSearchFocused && query && !selectedResource && filtered.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-nb-surface border border-nb-outline-variant shadow-nb-lg rounded-lg overflow-hidden z-50 max-h-60 overflow-y-auto scrollbar-thin">
                {filtered.map(r => (
                  <button
                    key={r.id}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      setSelectedResource(r);
                      setQuery("");
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-nb-primary/5 transition-colors border-b border-nb-outline-variant/10 last:border-0"
                  >
                    <div className="text-sm font-bold text-nb-on-surface truncate">{r.title}</div>
                    <div className="text-[11px] text-nb-on-surface-variant/60 truncate">
                      {r.type} • {r.entryTitle} • {r.entryDate}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {(selectedResource || link.trim()) && (
            <div className="mt-3 p-3 bg-nb-surface-low border border-nb-outline-variant/20 rounded-xl flex items-center justify-between gap-3 animate-in slide-in-from-top-1 duration-200">
              <div className="flex-1 min-w-0">
                <div className="text-[9px] font-black text-nb-primary mb-0.5 tracking-tighter">
                  {selectedResource ? "Linked Resource" : "External Link"}
                </div>
                <div className="text-sm font-bold text-nb-on-surface truncate">
                  {selectedResource ? selectedResource.title : link}
                </div>
                {selectedResource && (
                  <div className="text-[11px] text-nb-on-surface-variant/60 truncate">
                    {selectedResource.type} • {selectedResource.entryTitle} • {selectedResource.entryDate}
                  </div>
                )}
              </div>
              <button 
                onClick={() => {
                  let url = selectedResource ? `#${selectedResource.id}` : link.trim();
                  if (!selectedResource && url && !url.startsWith('#')) {
                    const hasProtocol = /^[a-z]+:/i.test(url);
                    const isDomain = url.includes('.') && !url.includes(' ');
                    if (!hasProtocol && isDomain) url = `https://${url}`;
                  }
                  window.open(url, '_blank');
                }}
                title="Go to Link"
                className="p-2 bg-nb-surface text-nb-primary rounded-lg hover:bg-nb-primary/10 transition-colors shrink-0 border border-nb-outline-variant/30 shadow-sm"
              >
                <ExternalLink size={14} />
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button 
            onClick={handleApply}
            className="flex-1 py-2.5 bg-nb-primary text-white text-[11px] font-bold tracking-widest rounded-lg hover:bg-nb-primary-dim transition-all shadow-md shadow-nb-primary/20"
          >
            Apply Link
          </button>
          
          {editor.isActive('link') && (
            <button 
              onClick={() => { editor.chain().focus().unsetLink().unsetMark('underline').run(); onClose(); }}
              title="Remove Link"
              className="px-3 py-2 bg-nb-surface-low text-red-500 rounded-lg hover:bg-red-50 transition-all border border-nb-outline-variant/30"
            >
              <Link2Off size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UnifiedEditor({
  content, onChange, onImageUpload, author, filename, dbName = "notebook-pending", onEditorInit, notebookMetadata, onToggleLink
}: UnifiedEditorProps) {
  const parseContent = (raw: string) => {
    if (!raw) return "";
    try { return JSON.parse(raw); } catch { return raw; }
  };

  const handleImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];

      const hash = await hashContent(base64);
      const ext = getExtensionFromDataUrl(dataUrl);
      const newPath = `assets/${hash}.${ext}`;

      if (editor?.isActive('tableCell') || editor?.isActive('tableHeader')) {
        // Prevent image insertion inside tables as LaTeX cannot render them
        return;
      }

      const imageAttrs = {
        id: generateUUID(),
        src: dataUrl, // Keep dataUrl for immediate preview
        alt: "",
        title: author ?? "",
        filePath: newPath,
      };

      if (editor?.state.selection instanceof NodeSelection) {
        editor.chain().focus().insertContentAt(editor.state.selection.to, {
          type: "image",
          attrs: imageAttrs,
        }).run();
      } else {
        editor?.chain().focus().insertContent({
          type: "image",
          attrs: imageAttrs,
        }).run();
      }

      if (onImageUpload) onImageUpload(newPath, base64);
    };
    reader.readAsDataURL(file);
  };

  const [, setSelectionUpdate] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showLinkPopup, setShowLinkPopup] = useState(false);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => setIsCtrlPressed(e.ctrlKey || e.metaKey);
    const handleBlur = () => setIsCtrlPressed(false);
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKey);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKey);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: false,
        underline: false,
        dropcursor: {
          color: '#d9282f',
          width: 3,
        }
      }),
      ImageWithCaption.configure({ inline: false, allowBase64: true, dbName } as any),
      TableWithCaption.configure({ resizable: true }),
      TableRow,
      RestrictedTableHeader,
      RestrictedTableCell,
      CustomCodeBlock,
      CustomRawLatex,
      PrismHighlightExtension,
      Underline,
      CustomLink.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: 'text-nb-primary hover:underline hover:decoration-nb-primary transition-all cursor-text',
        },
      }),
      Placeholder.configure({
        placeholder: "Start writing...",
      }),
      IdRemapper,
    ],
    content: parseContent(content),
    onUpdate: ({ editor }) => {
      onChange(JSON.stringify(editor.getJSON()));
    },
    onSelectionUpdate: () => {
      setSelectionUpdate(s => s + 1);
    },
    onTransaction: () => {
      setSelectionUpdate(s => s + 1);
    },
    editorProps: {
      attributes: { class: "focus:outline-none min-h-[800px] h-full max-w-none p-4 lg:p-6 cursor-text" },
      handleDOMEvents: {
        click: (view, event) => {
          const target = event.target as HTMLElement;
          const anchor = target.closest('a');
          if (anchor && (event.ctrlKey || event.metaKey)) {
            window.open(anchor.href, '_blank');
            return true;
          }
          return false; // Let editor handle (move cursor)
        },
        dragstart: () => { setIsDragging(true); return false; },
        dragend: () => { setIsDragging(false); return false; },
        dragover: (view, event) => {
          if (!isDragging) setIsDragging(true);
          const scrollContainer = view.dom.closest('.overflow-y-auto');
          if (!scrollContainer) return false;
          const rect = scrollContainer.getBoundingClientRect();
          const y = event.clientY;
          const threshold = 50;
          if (y < rect.top + threshold) {
            scrollContainer.scrollBy({ top: -15, behavior: 'auto' });
          } else if (y > rect.bottom - threshold) {
            scrollContainer.scrollBy({ top: 15, behavior: 'auto' });
          }
          return false;
        },
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (items) {
          for (const item of Array.from(items)) {
            if (item.type.startsWith("image")) {
              const file = item.getAsFile();
              if (file) { handleImageFile(file); return true; }
            }
          }
        }
        return false;
      },
      handleDrop: (view, event, slice, moved) => {
        setIsDragging(false);
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          for (const file of Array.from(files)) {
            if (file.type.startsWith("image")) {
              handleImageFile(file);
              return true;
            }
          }
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (editor && onEditorInit) {
      onEditorInit(editor);
    }
  }, [editor, onEditorInit]);

  useEffect(() => {
    if (onToggleLink && editor) {
      onToggleLink(() => {
        // 1. Clean selection (strip whitespace)
        if (editor.isActive('link')) {
          editor.commands.extendMarkRange('link');
        } else {
          const { from, to } = editor.state.selection;
          if (from !== to) {
            const text = editor.state.doc.textBetween(from, to, " ");
            const startOffset = text.search(/\S/);
            const endOffset = text.trimEnd().length;
            if (startOffset !== -1) {
              editor.chain().setTextSelection({ 
                from: from + startOffset, 
                to: from + endOffset 
              }).run();
            }
          }
        }
        // 2. Open popup
        setShowLinkPopup(true);
      });
    }
  }, [onToggleLink, editor]);

  const isInTable = editor?.isActive("tableCell") || editor?.isActive("tableHeader") || false;

  const insertImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleImageFile(file);
      // Clear for potential re-upload of same file name
      input.value = "";
    };
    input.click();
  };

  const [showTableGrid, setShowTableGrid] = useState(false);
  const [hoveredGrid, setHoveredGrid] = useState({ r: 0, c: 0 });

  // Dismiss table grid on click away
  React.useEffect(() => {
    if (!showTableGrid) return;
    const handleOutsideClick = () => setShowTableGrid(false);
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [showTableGrid]);



  if (!editor) return null;


  return (
    <div className="flex flex-col gap-4">

      <div className="relative group/editor">
        {/* Table Controls (Now embedded in NodeView, keeping this for fallback/external interaction) */}
        {isInTable && !editor.isActive('table') && (
          <div className="absolute -top-12 left-0 right-0 flex flex-wrap items-center justify-center gap-2 p-1.5 bg-nb-primary text-white rounded-lg shadow-nb-lg z-20 animate-in fade-in slide-in-from-bottom-2 duration-200">
            {/* ... fallback controls ... */}
          </div>
        )}

        <div className="bg-nb-surface min-h-[800px] relative">
          <div 
            className={`max-w-none h-full ${isCtrlPressed ? '[&_a]:!cursor-pointer' : ''}`}
            onMouseDown={() => setShowLinkPopup(false)}
          >
            <EditorContent editor={editor} className="h-full" />
          </div>
          {showLinkPopup && (
            <LinkReferencePopup 
              editor={editor} 
              metadata={notebookMetadata} 
              onClose={() => setShowLinkPopup(false)} 
              filename={filename}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Shared UI Components ────────────────────────────────────── */

function Sep({ light }: { light?: boolean }) {
  return <div className={`w-px h-6 self-center mx-2 shrink-0 ${light ? "bg-white/20" : "bg-nb-outline-variant/30"}`} />;
}
