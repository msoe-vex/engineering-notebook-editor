"use client";

import React from "react";
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
  Pencil,
} from "lucide-react";

const lowlight = createLowlight(common);

export const LANGUAGES = [
  "plaintext", "cpp", "c", "python", "javascript",
  "typescript", "java", "bash", "sql", "rust", "go", "csharp",
];

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
  author?: string;
  filename: string;
}

export default function UnifiedEditor({
  content, onChange, onImageUpload, author, filename,
}: UnifiedEditorProps) {
  const parseContent = (raw: string) => {
    if (!raw) return "";
    try { return JSON.parse(raw); } catch { return raw; }
  };

  const handleImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string; // data:image/png;base64,...
      const base64  = dataUrl.split(",")[1];
      const ext     = file.name.split(".").pop() || "png";
      const stem    = filename.split("/").pop()?.replace(".tex", "") || "image";
      const newPath = `resources/${stem}_${Date.now()}.${ext}`;

      // insertContent bypasses the typed setImage command so we can store
      // our custom filePath attribute alongside the display src.
      editor?.chain().focus().insertContent({
        type: "image",
        attrs: {
          src:      dataUrl,
          alt:      "",
          title:    author ?? "",
          filePath: newPath,
        },
      }).run();

      // Save binary to disk (if handler provided)
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
    <div className="w-full space-y-4">
      {/* ── Main Toolbar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1 p-2.5 bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl sticky top-4 z-20 shadow-md backdrop-blur-md">
        <Btn onClick={() => editor.chain().focus().toggleBold().run()}        active={editor.isActive("bold")}   title="Bold">   <Bold size={16} /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleItalic().run()}      active={editor.isActive("italic")} title="Italic"> <Italic size={16} /></Btn>
        <Sep />
        <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Section">    <Heading1 size={16} /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Subsection"> <Heading2 size={16} /></Btn>
        <Sep />
        <Btn onClick={() => editor.chain().focus().toggleBulletList().run()}  active={editor.isActive("bulletList")}  title="Bullet list">  <List size={16} /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Ordered list"> <ListOrdered size={16} /></Btn>
        <Sep />
        <Btn onClick={() => editor.chain().focus().toggleCodeBlock({ language: "cpp" }).run()} active={editor.isActive("codeBlock")} title="Code block"> <Code size={16} /></Btn>
        <Btn onClick={insertImage}                                                                                                    title="Upload image"><ImageIcon size={16} /></Btn>
        <Btn onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}                      title="Insert table"><TableIcon size={16} /></Btn>
        <div className="flex-1" />
        <Btn onClick={() => editor.chain().focus().undo().run()} title="Undo"><Undo size={16} /></Btn>
        <Btn onClick={() => editor.chain().focus().redo().run()} title="Redo"><Redo size={16} /></Btn>
      </div>

      {/* ── Table Controls (contextual) ──────────────────────────── */}
      {isInTable && (
        <div className="flex flex-wrap items-center gap-1.5 p-2 bg-blue-600 rounded-xl">
          <span className="text-[10px] font-black uppercase tracking-wider text-blue-200 ml-2 mr-1">Table</span>
          <Sep light />
          <Btn sm light onClick={() => editor.chain().focus().addRowBefore().run()}    title="Add row above">  <ChevronUp    size={14} /></Btn>
          <Btn sm light onClick={() => editor.chain().focus().addRowAfter().run()}     title="Add row below">  <ChevronDown  size={14} /></Btn>
          <Btn sm light danger onClick={() => editor.chain().focus().deleteRow().run()} title="Delete row">    <Trash2       size={14} /><span className="text-[10px] ml-1">Row</span></Btn>
          <Sep light />
          <Btn sm light onClick={() => editor.chain().focus().addColumnBefore().run()} title="Add col left">   <ChevronLeft  size={14} /></Btn>
          <Btn sm light onClick={() => editor.chain().focus().addColumnAfter().run()}  title="Add col right">  <ChevronRight size={14} /></Btn>
          <Btn sm light danger onClick={() => editor.chain().focus().deleteColumn().run()} title="Delete col"> <Trash2       size={14} /><span className="text-[10px] ml-1">Col</span></Btn>
          <Sep light />
          <Btn sm light danger onClick={() => editor.chain().focus().deleteTable().run()} title="Delete table"><Trash2       size={14} /><span className="text-[10px] ml-1">Delete Table</span></Btn>
        </div>
      )}

      {/* ── Editor Workspace ─────────────────────────────────────── */}
      <div
        className="p-12 bg-white dark:bg-zinc-950 rounded-[2rem] border-2 border-gray-100 dark:border-zinc-900 cursor-text shadow-xl shadow-black/5 hover:border-blue-500/10 transition-all duration-500"
        onClick={() => editor.chain().focus().run()}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

/* ── Shared UI Components ────────────────────────────────────── */

function Btn({ children, onClick, active, title, sm, danger, light }: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  title?: string;
  sm?: boolean;
  danger?: boolean;
  light?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1 rounded-xl transition-all
        ${sm ? "px-3 py-1.5 text-[11px]" : "p-3"}
        ${danger  ? "text-red-400 hover:bg-red-500/20"
        : active  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
        : light   ? "text-white/80 hover:bg-white/10 hover:text-white"
                  : "text-gray-500 dark:text-zinc-500 hover:bg-gray-100 dark:hover:bg-zinc-900 hover:text-black dark:hover:text-white"}`}
    >
      {children}
    </button>
  );
}

function Sep({ light }: { light?: boolean }) {
  return <div className={`w-px h-6 self-center mx-2 shrink-0 ${light ? "bg-white/20" : "bg-gray-100 dark:bg-zinc-800"}`} />;
}
