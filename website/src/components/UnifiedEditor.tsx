"use client";

import React, { useState, useEffect } from "react";
import {
  useEditor, EditorContent,
  NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer,
} from "@tiptap/react";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { getResource } from "@/lib/db";
import StarterKit from "@tiptap/starter-kit";
import { Image as TiptapImage } from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { CodeBlock } from "@tiptap/extension-code-block";
import Placeholder from "@tiptap/extension-placeholder";

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
  Scissors as Scissor, Copy, Clipboard, Terminal
} from "lucide-react";
import { generateUUID, hashContent, getExtensionFromDataUrl } from "@/lib/utils";

export const LANGUAGES = [
  "plaintext", "cpp", "c", "python", "javascript",
  "typescript", "java", "bash", "sql", "rust", "go", "csharp",
];

function getPrismDecorations(doc: any) {
  const decorations: Decoration[] = [];

  doc.descendants((node: any, pos: number) => {
    if (node.type.name === 'codeBlock' || node.type.name === 'rawLatex') {
      const language = node.attrs.language || (node.type.name === 'rawLatex' ? 'latex' : 'plaintext');
      const text = node.textContent;
      const prismLang = Prism.languages[language] || Prism.languages.plaintext;
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
    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${danger ? "text-red-500 hover:bg-red-50" : "text-nb-on-surface-variant hover:bg-nb-primary/10 hover:text-nb-primary"} text-left`}
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
      <div className="text-[10px] font-bold uppercase tracking-widest text-nb-on-surface-variant text-center bg-nb-surface-low py-1 rounded">
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
      title: { default: "" }, // author initials
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

const ImageNodeView = ({ node, selected, updateAttributes, deleteNode, dbName }: any) => {
  const [menuPos, setMenuPos] = useState<{top: number, left: number} | null>(null);
  const showMenu = menuPos !== null;
  const [dragEnabled, setDragEnabled] = useState(false);

  React.useEffect(() => {
    if (!showMenu) return;
    const handleOutsideClick = () => setMenuPos(null);
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [showMenu]);

  const [resolvedSrc, setResolvedSrc] = useState(node.attrs.src);

  useEffect(() => {
    let active = true;
    const load = async () => {
      // 1. If it's already a data URL, we're good
      if (node.attrs.src?.startsWith('data:')) {
        if (active) setResolvedSrc(node.attrs.src);
        return;
      }

      // 2. Try the resource cache (IndexedDB)
      try {
        const cached = await getResource(dbName, node.attrs.src);
        if (cached && active) {
          setResolvedSrc(cached);
          return;
        }
      } catch { /* cache miss or error */ }

      // 3. Fallback: Trust the initial src.
      if (active) setResolvedSrc(node.attrs.src);
    };

    load();
    return () => { active = false; };
  }, [node.attrs.src, dbName]);

  const [isResizing, setIsResizing] = useState(false);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = parseInt(node.attrs.width) || 100;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      // Container is max-w-2xl (~672px). 
      // A delta of 6.7px is roughly 1%.
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
      className={`my-6 group relative max-w-4xl mx-auto transition ${showMenu ? 'z-[200]' : selected ? 'z-[100]' : 'z-10'}`}
    >
      {/* External Controls (Left side) - Always Visible */}
      <div contentEditable={false} className="absolute -left-12 top-0 bottom-0 w-8 flex flex-col items-center justify-center gap-2 z-[70]">
        <button
          onMouseDown={(e) => { 
            e.stopPropagation(); 
            if (menuPos) {
              setMenuPos(null);
            } else {
              const blockElement = e.currentTarget.closest('.group');
              if (blockElement) {
                const rect = blockElement.getBoundingClientRect();
                setMenuPos({ top: e.clientY - rect.top, left: e.clientX - rect.left + 24 });
              } else {
                setMenuPos({ top: 0, left: 0 });
              }
            }
          }}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition ${showMenu ? 'bg-nb-primary text-white shadow-lg' : 'bg-nb-surface text-nb-on-surface-variant hover:bg-nb-surface-high hover:text-nb-primary shadow-sm border border-nb-outline-variant/30'}`}
        >
          <Settings size={16} />
        </button>

        <div
          data-drag-handle
          onMouseEnter={() => setDragEnabled(true)}
          onMouseLeave={() => setDragEnabled(false)}
          className="w-8 h-8 rounded-full bg-nb-surface text-nb-on-surface-variant flex items-center justify-center cursor-grab active:cursor-grabbing shadow-sm border border-nb-outline-variant/30 hover:bg-nb-surface-high hover:text-nb-primary transition"
        >
          <GripVertical size={14} />
        </div>
      </div>

      {/* Main Image Content */}
      <div className={`relative flex justify-center transition-all duration-300 ${selected ? 'ring-2 ring-nb-primary/50' : ''}`}>
        <img
          src={resolvedSrc}
          alt={node.attrs.alt}
          style={{ width: node.attrs.width ?? "100%" }}
          className="h-auto block select-none pointer-events-none"
          draggable={false}
        />

        {/* Resize handle (Right edge) */}
        {selected && (
          <div
            contentEditable={false}
            onMouseDown={startResize}
            className="absolute top-0 right-0 bottom-0 w-2 cursor-ew-resize hover:bg-nb-primary/30 transition-colors z-50 group/resize"
          >
            <div className="absolute top-1/2 -translate-y-1/2 right-0 w-1.5 h-12 bg-nb-primary rounded-l-full opacity-0 group-hover/resize:opacity-100 transition-opacity" />
          </div>
        )}

        {/* Floating Menu */}
        {showMenu && (
          <div
            contentEditable={false}
            style={{ top: menuPos?.top, left: menuPos?.left }}
            className="absolute w-80 bg-nb-surface border border-nb-outline-variant shadow-nb-xl rounded-xl z-[300] p-4 animate-in fade-in zoom-in duration-200"
            onMouseDown={(e) => { e.stopPropagation(); }}
          >
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-nb-outline-variant/30">
              <ImageIcon size={14} className="text-nb-primary" />
              <span className="text-xs font-bold uppercase tracking-widest text-nb-on-surface-variant">Image Management</span>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-nb-on-surface-variant mb-1.5">Figure Caption</label>
                <input
                  type="text"
                  value={node.attrs.alt ?? ""}
                  onChange={(e) => updateAttributes({ alt: e.target.value })}
                  placeholder="Describe this image..."
                  className="w-full text-xs bg-nb-surface-low border border-nb-outline-variant/30 rounded-lg px-3 py-2 outline-none focus:border-nb-primary transition-all"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => deleteNode()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-[10px] font-bold uppercase"
                >
                  <Trash2 size={12} />
                  <span>Delete Image</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {node.attrs.alt && (
        <p className="mt-3 text-center text-xs font-medium text-nb-on-surface-variant italic">
          <span className="font-bold uppercase tracking-tighter mr-1.5 opacity-60">Fig.</span>
          {node.attrs.alt}
        </p>
      )}
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
  const [menuPos, setMenuPos] = useState<{top: number, left: number} | null>(null);
  const showMenu = menuPos !== null;
  const [isCursorInside, setIsCursorInside] = useState(false);
  const [dragEnabled, setDragEnabled] = useState(false);

  React.useEffect(() => {
    const check = () => {
      try {
        const pos = getPos();
        if (typeof pos !== 'number' || pos < 0) return;
        const { from, to } = editor.state.selection;
        setIsCursorInside(from >= pos && to <= pos + node.nodeSize);
      } catch (e) {
        // Node probably deleted
      }
    };
    check();
    editor.on('selectionUpdate', check);
    return () => { editor.off('selectionUpdate', check); };
  }, [editor, getPos, node.nodeSize]);

  React.useEffect(() => {
    if (!showMenu) return;
    const handleOutsideClick = () => setMenuPos(null);
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [showMenu]);

  const active = selected || isCursorInside;


  return (
    <NodeViewWrapper
      draggable={dragEnabled}
      className={`my-6 group relative max-w-4xl mx-auto transition ${showMenu ? 'z-[200]' : active ? 'z-[100]' : 'z-10'}`}>
      {/* External Controls (Left side) - Always Visible */}
      <div contentEditable={false} className="absolute -left-12 top-0 bottom-0 w-8 flex flex-col items-center justify-center gap-2 z-[70]">
        <button
          onMouseDown={(e) => { 
            e.stopPropagation(); 
            if (menuPos) {
              setMenuPos(null);
            } else {
              const blockElement = e.currentTarget.closest('.group');
              if (blockElement) {
                const rect = blockElement.getBoundingClientRect();
                setMenuPos({ top: e.clientY - rect.top, left: e.clientX - rect.left + 24 });
              } else {
                setMenuPos({ top: 0, left: 0 });
              }
            }
          }}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition ${showMenu ? 'bg-nb-primary text-white shadow-lg' : 'bg-nb-surface text-nb-on-surface-variant hover:bg-nb-surface-high hover:text-nb-primary shadow-sm border border-nb-outline-variant/30'}`}
        >
          <Settings size={16} />
        </button>

        <div
          data-drag-handle
          onMouseEnter={() => setDragEnabled(true)}
          onMouseLeave={() => setDragEnabled(false)}
          className="w-8 h-8 rounded-full bg-nb-surface text-nb-on-surface-variant flex items-center justify-center cursor-grab active:cursor-grabbing shadow-sm border border-nb-outline-variant/30 hover:bg-nb-surface-high hover:text-nb-primary transition"
        >
          <GripVertical size={14} />
        </div>
      </div>

      {/* Main Table Content */}
      <div className={`overflow-x-auto transition-all duration-300 ${active ? 'ring-2 ring-nb-primary/50' : ''}`}>
        <NodeViewContent
          as={"table" as any}
          className="border-collapse w-full table-fixed"
        />

        {/* Floating Menu */}
        {showMenu && (
          <div
            contentEditable={false}
            style={{ top: menuPos?.top, left: menuPos?.left }}
            className="absolute w-80 bg-nb-surface border border-nb-outline-variant shadow-nb-xl rounded-xl z-[300] p-4 animate-in fade-in zoom-in duration-200"
            onMouseDown={(e) => { e.stopPropagation(); }}
          >
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-nb-outline-variant/30">
              <TableIcon size={14} className="text-nb-secondary" />
              <span className="text-xs font-bold uppercase tracking-widest text-nb-on-surface-variant">Table Management</span>
            </div>

            <div className="space-y-5 text-nb-on-surface">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="block text-[8px] font-bold uppercase tracking-widest text-nb-on-surface-variant/60">Rows</span>
                  <div className="flex bg-nb-surface-low rounded-lg border border-nb-outline-variant/30 p-1">
                    <button onClick={() => editor.chain().focus().addRowBefore().run()} className="flex-1 p-1.5 hover:bg-white rounded transition-colors text-nb-secondary"><ChevronUp size={12} /></button>
                    <button onClick={() => editor.chain().focus().addRowAfter().run()} className="flex-1 p-1.5 hover:bg-white rounded transition-colors text-nb-secondary"><ChevronDown size={12} /></button>
                    <div className="w-px h-3 bg-nb-outline-variant/30 mx-0.5 self-center" />
                    <button onClick={() => editor.chain().focus().deleteRow().run()} className="flex-1 p-1.5 hover:bg-red-50 rounded transition-colors text-red-500"><Trash2 size={12} /></button>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="block text-[8px] font-bold uppercase tracking-widest text-nb-on-surface-variant/60">Cols</span>
                  <div className="flex bg-nb-surface-low rounded-lg border border-nb-outline-variant/30 p-1">
                    <button onClick={() => editor.chain().focus().addColumnBefore().run()} className="flex-1 p-1.5 hover:bg-white rounded transition-colors text-nb-secondary"><ChevronLeft size={12} /></button>
                    <button onClick={() => editor.chain().focus().addColumnAfter().run()} className="flex-1 p-1.5 hover:bg-white rounded transition-colors text-nb-secondary"><ChevronRight size={12} /></button>
                    <div className="w-px h-3 bg-nb-outline-variant/30 mx-0.5 self-center" />
                    <button onClick={() => editor.chain().focus().deleteColumn().run()} className="flex-1 p-1.5 hover:bg-red-50 rounded transition-colors text-red-500"><Trash2 size={12} /></button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-nb-on-surface-variant mb-1.5">Table Caption</label>
                <input
                  type="text"
                  value={node.attrs.caption ?? ""}
                  onChange={(e) => updateAttributes({ caption: e.target.value })}
                  placeholder="Describe this table..."
                  className="w-full text-xs bg-nb-surface-low border border-nb-outline-variant/30 rounded-lg px-3 py-2 outline-none focus:border-nb-secondary transition-all"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => editor.chain().focus().deleteTable().run()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-[10px] font-bold uppercase"
                >
                  <Trash2 size={12} />
                  <span>Delete Table</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {node.attrs.caption && (
        <p className="mt-3 text-center text-xs font-medium text-nb-on-surface-variant italic">
          <span className="font-bold uppercase tracking-tighter mr-1.5 opacity-60">Table.</span>
          {node.attrs.caption}
        </p>
      )}
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
  addProseMirrorPlugins() {
    return [PrismHighlightPlugin];
  },
});


function CodeBlockNodeView({ node, updateAttributes, deleteNode, editor, selected, getPos }: any) {
  const [menuPos, setMenuPos] = useState<{top: number, left: number} | null>(null);
  const showMenu = menuPos !== null;
  const [isCursorInside, setIsCursorInside] = useState(false);
  const [dragEnabled, setDragEnabled] = useState(false);

  React.useEffect(() => {
    const check = () => {
      try {
        const pos = getPos();
        if (typeof pos !== 'number' || pos < 0) return;
        const { from, to } = editor.state.selection;
        setIsCursorInside(from >= pos && to <= pos + node.nodeSize);
      } catch (e) {
        // Node probably deleted
      }
    };
    check();
    editor.on('selectionUpdate', check);
    return () => { editor.off('selectionUpdate', check); };
  }, [editor, getPos, node.nodeSize]);

  React.useEffect(() => {
    if (!showMenu) return;
    const handleOutsideClick = () => setMenuPos(null);
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [showMenu]);

  const active = selected || isCursorInside;


  return (
    <NodeViewWrapper
      draggable={dragEnabled}
      className={`my-6 group relative max-w-4xl mx-auto transition ${showMenu ? 'z-[200]' : active ? 'z-[100]' : 'z-10'}`}>
      {/* External Controls (Left side) - Always Visible */}
      <div contentEditable={false} className="absolute -left-12 top-0 bottom-0 w-8 flex flex-col items-center justify-center gap-2 z-[70]">
        <button
          onMouseDown={(e) => { 
            e.stopPropagation(); 
            if (menuPos) {
              setMenuPos(null);
            } else {
              const blockElement = e.currentTarget.closest('.group');
              if (blockElement) {
                const rect = blockElement.getBoundingClientRect();
                setMenuPos({ top: e.clientY - rect.top, left: e.clientX - rect.left + 24 });
              } else {
                setMenuPos({ top: 0, left: 0 });
              }
            }
          }}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition ${showMenu ? 'bg-nb-primary text-white shadow-lg' : 'bg-nb-surface text-nb-on-surface-variant hover:bg-nb-surface-high hover:text-nb-primary shadow-sm border border-nb-outline-variant/30'}`}
        >
          <Settings size={16} />
        </button>

        <div
          data-drag-handle
          onMouseEnter={() => setDragEnabled(true)}
          onMouseLeave={() => setDragEnabled(false)}
          className="w-8 h-8 rounded-full bg-nb-surface text-nb-on-surface-variant flex items-center justify-center cursor-grab active:cursor-grabbing shadow-sm border border-nb-outline-variant/30 hover:bg-nb-surface-high hover:text-nb-primary transition"
        >
          <GripVertical size={14} />
        </div>
      </div>

      {/* Main Code Content */}
      <div className={`rounded-xl overflow-hidden bg-nb-surface-low border border-nb-outline-variant/30 transition-all duration-300 ${active ? 'ring-2 ring-nb-primary/50' : ''}`}>
        <div className="flex items-center justify-between px-4 py-2 bg-nb-surface border-b border-nb-outline-variant/30">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-nb-primary">
              <Code2 size={12} />
            </div>
            <div className="relative group/select">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-nb-surface-low border border-nb-outline-variant/50 hover:border-nb-primary/50 hover:bg-nb-surface transition-all cursor-pointer">
                <select
                  value={node.attrs.language}
                  onChange={(e) => updateAttributes({ language: e.target.value })}
                  className="text-[10px] font-bold uppercase tracking-widest bg-transparent border-none outline-none text-nb-on-surface-variant cursor-pointer hover:text-nb-primary transition-colors appearance-none pr-4"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
                <ChevronDown size={10} className="absolute right-2 text-nb-on-surface-variant/40 group-hover/select:text-nb-primary transition-colors pointer-events-none" />
              </div>
            </div>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-tighter text-nb-on-surface-variant/40">
            Code Snippet
          </div>
        </div>
        
        <pre 
          spellCheck="false" 
          className={`p-6 text-[12px] leading-[1.8] overflow-x-auto border-none m-0 text-nb-on-surface language-${node.attrs.language}`}
        >
          <NodeViewContent as="div" className="font-mono" />
        </pre>


        {/* Floating Menu */}
        {showMenu && (
          <div
            contentEditable={false}
            style={{ top: menuPos?.top, left: menuPos?.left }}
            className="absolute w-80 bg-nb-surface border border-nb-outline-variant shadow-nb-xl rounded-xl z-[300] p-4 animate-in fade-in zoom-in duration-200"
            onMouseDown={(e) => { e.stopPropagation(); }}
          >
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-nb-outline-variant/30">
              <Code size={14} className="text-nb-primary" />
              <span className="text-xs font-bold uppercase tracking-widest text-nb-on-surface-variant">Snippet Management</span>
            </div>

            <div className="space-y-5">
              <div className="p-3 rounded-lg bg-nb-surface-low border border-nb-outline-variant/30">
                <p className="text-[10px] text-nb-on-surface-variant leading-relaxed">
                  Use the header dropdown to change the programming language for syntax highlighting.
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-nb-on-surface-variant mb-1.5">Snippet Caption</label>
                <input
                  type="text"
                  value={node.attrs.caption ?? ""}
                  onChange={(e) => updateAttributes({ caption: e.target.value })}
                  placeholder="What does this code do?"
                  className="w-full text-xs bg-nb-surface-low border border-nb-outline-variant/30 rounded-lg px-3 py-2 outline-none focus:border-nb-primary transition-all"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => deleteNode()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-[10px] font-bold uppercase"
                >
                  <Trash2 size={12} />
                  <span>Delete Snippet</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {node.attrs.caption && (
        <p className="mt-3 text-center text-xs font-medium text-nb-on-surface-variant italic">
          <span className="font-bold uppercase tracking-tighter mr-1.5 opacity-60">Snippet.</span>
          {node.attrs.caption}
        </p>
      )}
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

function RawLatexNodeView({ node, updateAttributes, deleteNode, selected }: any) {
  const [dragEnabled, setDragEnabled] = useState(false);
  const [menuPos, setMenuPos] = useState<{top: number, left: number} | null>(null);
  const showMenu = menuPos !== null;

  React.useEffect(() => {
    if (!showMenu) return;
    const handleOutsideClick = () => setMenuPos(null);
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [showMenu]);

  return (
    <NodeViewWrapper
      draggable={dragEnabled}
      className={`my-6 group relative max-w-4xl mx-auto transition ${showMenu ? 'z-[200]' : selected ? 'z-[100]' : 'z-10'}`}
    >
      {/* External Controls */}
      <div contentEditable={false} className="absolute -left-12 top-0 bottom-0 w-8 flex flex-col items-center justify-center gap-2 z-[70]">
        <button
          onMouseDown={(e) => { 
            e.stopPropagation(); 
            if (menuPos) {
              setMenuPos(null);
            } else {
              const blockElement = e.currentTarget.closest('.group');
              if (blockElement) {
                const rect = blockElement.getBoundingClientRect();
                setMenuPos({ top: e.clientY - rect.top, left: e.clientX - rect.left + 24 });
              } else {
                setMenuPos({ top: 0, left: 0 });
              }
            }
          }}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition ${showMenu ? 'bg-nb-primary text-white shadow-lg' : 'bg-nb-surface text-nb-on-surface-variant hover:bg-nb-surface-high hover:text-nb-primary shadow-sm border border-nb-outline-variant/30'}`}
        >
          <Settings size={16} />
        </button>

        <div
          data-drag-handle
          onMouseEnter={() => setDragEnabled(true)}
          onMouseLeave={() => setDragEnabled(false)}
          className="w-8 h-8 rounded-full bg-nb-surface text-nb-on-surface-variant flex items-center justify-center cursor-grab active:cursor-grabbing shadow-sm border border-nb-outline-variant/30 hover:bg-nb-surface-high hover:text-nb-primary transition"
        >
          <GripVertical size={14} />
        </div>
      </div>

      <div className={`rounded-xl overflow-hidden bg-nb-surface-low border border-nb-outline-variant transition-all duration-300 ${selected ? 'ring-2 ring-nb-primary/50' : ''}`}>
        <div className="flex items-center justify-between px-4 py-2 bg-nb-surface border-b border-nb-outline-variant/30">
          <div className="flex items-center gap-2">
            <Terminal size={12} className="text-nb-primary" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-nb-on-surface-variant">LaTeX</span>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-tighter text-nb-on-surface-variant/40">
            Raw Injection
          </div>
        </div>
        
        <pre 
          spellCheck="false" 
          className="p-6 text-[12px] leading-[1.8] overflow-x-auto border-none m-0 text-nb-on-surface language-latex"
        >
          <NodeViewContent as="div" className="font-mono" />
        </pre>


        {/* Floating Menu */}
        {showMenu && (
          <div
            contentEditable={false}
            style={{ top: menuPos?.top, left: menuPos?.left }}
            className="absolute w-80 bg-nb-surface border border-nb-outline-variant shadow-nb-xl rounded-xl z-[300] p-4 animate-in fade-in zoom-in duration-200"
            onMouseDown={(e) => { e.stopPropagation(); }}
          >
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-nb-outline-variant/30">
              <Terminal size={14} className="text-nb-primary" />
              <span className="text-xs font-bold uppercase tracking-widest text-nb-on-surface-variant">LaTeX Management</span>
            </div>

            <div className="space-y-4">
              <p className="text-[10px] text-nb-on-surface-variant leading-relaxed">
                This block is injected directly into the LaTeX output without escaping. Use it for TikZ, custom environments, or raw commands.
              </p>
              
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => deleteNode()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-[10px] font-bold uppercase"
                >
                  <Trash2 size={12} />
                  <span>Delete Block</span>
                </button>
              </div>
            </div>
          </div>
        )}
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
}

export default function UnifiedEditor({
  content, onChange, onImageUpload, author, filename, dbName = "notebook-pending", onEditorInit,
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

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
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
      Placeholder.configure({
        placeholder: "Start writing...",
      }),
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
        dragstart: () => { setIsDragging(true); return false; },
        dragend: () => { setIsDragging(false); return false; },
        // Snapping logic handled in handleDrop
        dragover: (view, event) => {
          // Ensure dragging state is true even if drag started outside (e.g. file drop)
          if (!isDragging) setIsDragging(true);

          // Auto-scroll logic
          const scrollContainer = view.dom.closest('.overflow-y-auto');
          if (!scrollContainer) return false;

          const rect = scrollContainer.getBoundingClientRect();
          const y = event.clientY;
          const threshold = 50; // pixels from top/bottom to start scrolling

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

        // Handle File Drops (Images)
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          for (const file of Array.from(files)) {
            if (file.type.startsWith("image")) {
              handleImageFile(file);
              return true;
            }
          }
        }

        // Allow default ProseMirror behavior for moved content (allows dropping anywhere)
        return false;
      },
    },
  });

  useEffect(() => {
    if (editor && onEditorInit) {
      onEditorInit(editor);
    }
  }, [editor, onEditorInit]);

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
          <EditorContent editor={editor} className="max-w-none h-full" />
        </div>
      </div>
    </div>
  );
}

/* ── Shared UI Components ────────────────────────────────────── */

function Sep({ light }: { light?: boolean }) {
  return <div className={`w-px h-6 self-center mx-2 shrink-0 ${light ? "bg-white/20" : "bg-nb-outline-variant/30"}`} />;
}
