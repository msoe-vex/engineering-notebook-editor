"use client";

import React, { useState } from "react";
import {
  useEditor, EditorContent,
  NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Image as TiptapImage } from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import {
  Bold, Italic, List, ListOrdered, Code,
  Heading1, Heading2, Image as ImageIcon,
  Table as TableIcon, Undo, Redo, Trash2,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Pencil, AlertTriangle, FileCode, Check
} from "lucide-react";

const lowlight = createLowlight(common);

export const LANGUAGES = [
  "plaintext", "cpp", "c", "python", "javascript",
  "typescript", "java", "bash", "sql", "rust", "go", "csharp",
];

const ToolbarButton = ({ 
  onClick, 
  active, 
  children, 
  title 
}: { 
  onClick: () => void; 
  active?: boolean; 
  children: React.ReactNode; 
  title?: string 
}) => (
  <button
    onClick={onClick}
    title={title}
    className={`p-2 rounded-lg transition-all flex items-center justify-center ${
      active 
        ? "bg-nb-tertiary text-white shadow-sm shadow-nb-tertiary/20" 
        : "text-nb-on-surface-variant hover:bg-nb-surface-mid dark:hover:bg-nb-dark-surface-high hover:text-nb-secondary dark:hover:text-nb-dark-on-surface"
    }`}
  >
    {children}
  </button>
);

/* ─────────────────────────────────────────────────────────────────
   Image Node View  — caption/initials are editable inline
   ───────────────────────────────────────────────────────────────── */

const ImageWithCaption = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      alt:      { default: "" },
      title:    { default: "" }, // author initials
      filePath: { default: null }, // disk path for LaTeX (may differ from display src)
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});

function ImageNodeView({ node, updateAttributes, deleteNode }: any) {
  return (
    <NodeViewWrapper
      className="my-8 rounded-2xl border-2 border-gray-100 dark:border-zinc-800 hover:border-blue-400/40 dark:hover:border-blue-500/30 transition-all bg-gray-50 dark:bg-zinc-900/50 p-4 group relative"
      data-drag-handle
    >
      {/* Image */}
      <div className="rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-md">
        <img
          src={node.attrs.src}
          alt={node.attrs.alt}
          className="w-full h-auto block select-none pointer-events-none"
          draggable={false}
        />
      </div>

      {/* Editable fields — must be contentEditable=false so TipTap doesn't intercept */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        contentEditable={false}
        suppressContentEditableWarning
        className="mt-4 space-y-3"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Caption row */}
        <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-xl px-3 py-2">
          <Pencil size={12} className="text-blue-500 shrink-0" />
          <input
            type="text"
            value={node.attrs.alt ?? ""}
            onChange={(e) => updateAttributes({ alt: e.target.value })}
            placeholder="Figure caption (required)…"
            className="flex-1 text-sm font-medium bg-transparent outline-none placeholder:text-blue-300 dark:placeholder:text-blue-900 text-gray-800 dark:text-gray-200"
          />
        </div>

        {/* Initials row */}
        <div className="flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 shrink-0">Author Initials</span>
          <input
            type="text"
            value={node.attrs.title ?? ""}
            onChange={(e) => updateAttributes({ title: e.target.value })}
            placeholder="AS"
            className="w-20 text-xs font-mono bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-2 py-1 outline-none focus:border-blue-400 transition-colors"
          />
          {node.attrs.filePath && (
            <span className="text-[10px] text-gray-400 font-mono truncate">{node.attrs.filePath}</span>
          )}
        </div>
      </div>

      {/* Delete button */}
      <button
        contentEditable={false}
        onMouseDown={(e) => { e.stopPropagation(); deleteNode(); }}
        onClick={(e) => e.stopPropagation()}
        className="absolute -top-3 -right-3 p-2 bg-red-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all hover:scale-110 active:scale-95"
        title="Delete image"
      >
        <Trash2 size={13} />
      </button>
    </NodeViewWrapper>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Code Block Node View — per-block language selector inline
   ───────────────────────────────────────────────────────────────── */

const CustomCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView);
  },
});

function CodeBlockNodeView({ node, updateAttributes }: any) {
  return (
    <NodeViewWrapper className="my-6 rounded-xl overflow-hidden border border-zinc-800 shadow-lg">
      {/* Header bar */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        contentEditable={false}
        suppressContentEditableWarning
        className="flex items-center gap-2 px-4 py-2 bg-zinc-800/80 border-b border-zinc-700"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/70" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
          <div className="w-3 h-3 rounded-full bg-green-500/70" />
        </div>
        <div className="flex-1" />
        <select
          value={node.attrs.language ?? "plaintext"}
          onChange={(e) => updateAttributes({ language: e.target.value })}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="text-xs font-mono bg-zinc-700 text-zinc-200 border border-zinc-600 rounded-lg px-3 py-1 outline-none cursor-pointer hover:bg-zinc-600 transition-colors"
        >
          {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* Code content */}
      <pre className="p-5 bg-zinc-950 text-sm leading-relaxed overflow-x-auto">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <NodeViewContent as={"code" as any} className="font-mono" />
      </pre>
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
  onSwitchToRawLatex?: () => void;
  author?: string;
  filename: string;
}

export default function UnifiedEditor({
  content, onChange, onImageUpload, onSwitchToRawLatex, author, filename,
}: UnifiedEditorProps) {
  const parseContent = (raw: string) => {
    if (!raw) return "";
    try { return JSON.parse(raw); } catch { return raw; }
  };

  const handleImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64  = dataUrl.split(",")[1];
      const ext     = file.name.split(".").pop() || "png";
      // ISO-8601 timestamp filename (colons → hyphens for filesystem safety)
      const ts      = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
      const newPath = `notebook/resources/${ts}.${ext}`;

      editor?.chain().focus().insertContent({
        type: "image",
        attrs: {
          src:      dataUrl,
          alt:      "",
          title:    author ?? "",
          filePath: newPath,
        },
      }).run();

      if (onImageUpload) onImageUpload(newPath, base64);
    };
    reader.readAsDataURL(file);
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      ImageWithCaption.configure({ inline: false, allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      CustomCodeBlock.configure({ lowlight }),
    ],
    content: parseContent(content),
    onUpdate: ({ editor }) => {
      onChange(JSON.stringify(editor.getJSON()));
    },
    editorProps: {
      attributes: { class: "focus:outline-none min-h-[600px] max-w-none" },
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
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (files) {
          for (const file of Array.from(files)) {
            if (file.type.startsWith("image")) { handleImageFile(file); return true; }
          }
        }
        return false;
      },
    },
  });

  const [showRawConfirm, setShowRawConfirm] = useState(false);

  const isInTable = editor?.isActive("tableCell") || editor?.isActive("tableHeader") || false;

  const insertImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleImageFile(file);
    };
    input.click();
  };

  if (!editor) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* ── TipTap Toolbar ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5 p-2 border border-nb-outline-variant dark:border-nb-dark-outline rounded-xl bg-nb-surface-lowest dark:bg-nb-dark-surface-high/50 sticky top-0 z-30 shadow-nb-sm">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold"
        >
          <Bold size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic"
        >
          <Italic size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive("heading", { level: 1 })}
          title="Heading 1"
        >
          <Heading1 size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          title="Heading 2"
        >
          <Heading2 size={16} />
        </ToolbarButton>
        
        <div className="w-px h-6 bg-nb-outline-variant/30 dark:bg-nb-dark-outline/30 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet List"
        >
          <List size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Ordered List"
        >
          <ListOrdered size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive("codeBlock")}
          title="Code Block"
        >
          <Code size={16} />
        </ToolbarButton>
        
        <div className="w-px h-6 bg-nb-outline-variant/30 dark:bg-nb-dark-outline/30 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          title="Insert Table"
        >
          <TableIcon size={16} />
        </ToolbarButton>

        <label className="p-2 rounded-lg cursor-pointer text-nb-on-surface-variant hover:bg-nb-surface-mid dark:hover:bg-nb-dark-surface-high transition-all" title="Upload Image">
          <ImageIcon size={16} />
          <input
            type="file"
            className="hidden"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImageFile(file);
            }}
          />
        </label>

        <div className="flex-1" />

        <button
          onClick={() => setShowRawConfirm(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-nb-primary hover:bg-nb-primary/5 border border-transparent hover:border-nb-primary/20 transition-all"
          title="Switch to Raw LaTeX"
        >
          <FileCode size={14} />
          Switch to Raw
        </button>
      </div>

      {/* ── Table Controls (contextual) ──────────────────────────── */}
      {isInTable && (
        <div className="flex flex-wrap items-center gap-1.5 p-2 bg-nb-tertiary rounded-xl shadow-nb-sm animate-in slide-in-from-top-2 duration-200">
          <span className="text-[10px] font-black uppercase tracking-wider text-white/70 ml-2 mr-1">Table Editor</span>
          <div className="w-px h-4 bg-white/20 mx-1" />
          <ToolbarButton onClick={() => editor.chain().focus().addRowBefore().run()} title="Add row above"><ChevronUp size={14} className="text-white"/></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().addRowAfter().run()} title="Add row below"><ChevronDown size={14} className="text-white"/></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().deleteRow().run()} title="Delete row"><Trash2 size={14} className="text-white/60 hover:text-white"/></ToolbarButton>
          <div className="w-px h-4 bg-white/20 mx-1" />
          <ToolbarButton onClick={() => editor.chain().focus().addColumnBefore().run()} title="Add col left"><ChevronLeft size={14} className="text-white"/></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().addColumnAfter().run()} title="Add col right"><ChevronRight size={14} className="text-white"/></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().deleteColumn().run()} title="Delete col"><Trash2 size={14} className="text-white/60 hover:text-white"/></ToolbarButton>
          <div className="w-px h-4 bg-white/20 mx-1" />
          <ToolbarButton onClick={() => editor.chain().focus().deleteTable().run()} title="Delete table"><Trash2 size={14} className="text-white/60 hover:text-white"/></ToolbarButton>
        </div>
      )}

      {/* ── Main Editor Area ───────────────────────────────────────── */}
      <div className="bg-nb-surface-lowest dark:bg-nb-dark-surface rounded-2xl border border-nb-outline-variant dark:border-nb-dark-outline shadow-nb-sm min-h-[600px] p-8 md:p-12 relative">
        {/* Author indicator in corner */}
        <div className="absolute top-6 right-8 text-[9px] font-mono font-black uppercase tracking-[0.3em] text-nb-outline-variant pointer-events-none">
          Draft by: {author || "Unknown"}
        </div>
        <EditorContent editor={editor} className="max-w-none" />
      </div>

      {/* ── Raw LaTeX Confirm Dialog ────────────────────────────────── */}
      {showRawConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-nb-secondary/60 backdrop-blur-md px-4" onClick={() => setShowRawConfirm(false)}>
          <div
            className="bg-nb-surface-lowest dark:bg-nb-dark-surface rounded-2xl p-7 shadow-nb-lg max-w-sm w-full border border-nb-outline-variant dark:border-nb-dark-outline animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-nb-primary/10 flex items-center justify-center shrink-0">
                <FileCode size={20} className="text-nb-primary" />
              </div>
              <h3 className="font-black text-sm uppercase tracking-widest text-nb-secondary dark:text-nb-dark-on-surface">Switch to Raw Mode?</h3>
            </div>
            
            <div className="space-y-4 mb-8">
              <p className="text-sm text-nb-on-surface-variant dark:text-nb-dark-on-variant leading-relaxed">
                This will strip all rich metadata and lock this file into a raw text editor.
              </p>
              <div className="flex items-start gap-2.5 p-3 bg-nb-primary/5 border border-nb-primary/20 rounded-xl">
                <AlertTriangle size={14} className="text-nb-primary mt-0.5 shrink-0" />
                <p className="text-[11px] text-nb-primary leading-normal font-bold">
                  Warning: You cannot go back to rich editing once you switch.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowRawConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-nb-outline-variant dark:border-nb-dark-outline text-xs font-black uppercase tracking-widest text-nb-on-surface-variant hover:bg-nb-surface-low dark:hover:bg-nb-dark-surface-low transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowRawConfirm(false); onSwitchToRawLatex?.(); }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-nb-primary text-white text-xs font-black uppercase tracking-widest hover:bg-nb-primary-dim transition-all shadow-md shadow-nb-primary/20 active:scale-[0.98]"
              >
                Confirm Switch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Shared UI Components ────────────────────────────────────── */

function Sep({ light }: { light?: boolean }) {
  return <div className={`w-px h-6 self-center mx-2 shrink-0 ${light ? "bg-white/20" : "bg-gray-100 dark:bg-zinc-800"}`} />;
}
