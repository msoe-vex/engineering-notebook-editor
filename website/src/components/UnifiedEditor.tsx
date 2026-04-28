"use client";

import React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Image } from "@tiptap/extension-image";
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
} from "lucide-react";

const lowlight = createLowlight(common);

const LANGUAGES = [
  "plaintext", "cpp", "c", "python", "javascript",
  "typescript", "java", "bash", "sql", "rust", "go", "csharp",
];

interface UnifiedEditorProps {
  content: string; // ProseMirror JSON string
  onChange: (content: string) => void;
  author?: string;
}

export default function UnifiedEditor({ content, onChange, author }: UnifiedEditorProps) {
  // Parse initial content: try JSON (new format), fallback to HTML string or empty
  const parseContent = (raw: string) => {
    if (!raw) return "";
    try { return JSON.parse(raw); } catch { return raw; } // raw HTML for legacy files
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Image.configure({ inline: false, allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      CodeBlockLowlight.configure({ lowlight }),
    ],
    content: parseContent(content),
    onUpdate: ({ editor }) => {
      onChange(JSON.stringify(editor.getJSON()));
    },
    editorProps: {
      attributes: { class: "focus:outline-none min-h-[500px] max-w-none" },
    },
  });

  const isInTable    = editor?.isActive("tableCell") || editor?.isActive("tableHeader") || false;
  const isInCode     = editor?.isActive("codeBlock") || false;
  const currentLang  = editor?.getAttributes("codeBlock")?.language || "plaintext";

  const insertImage = () => {
    const src = window.prompt("Image URL or filename (e.g. resources/photo.png):");
    if (!src) return;
    const alt   = window.prompt("Caption:", "Figure") || "Figure";
    const title = window.prompt("Author initials:", author || "") || "";
    editor?.chain().focus().setImage({ src, alt, title }).run();
  };

  const insertTable = () => {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  if (!editor) return null;

  return (
    <div className="w-full space-y-2">

      {/* ── Main Toolbar ────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1 p-2 bg-gray-50 dark:bg-zinc-900 border dark:border-zinc-800 rounded-xl sticky top-0 z-10">
        <Btn onClick={() => editor.chain().focus().toggleBold().run()}        active={editor.isActive("bold")}               title="Bold">        <Bold size={15} /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleItalic().run()}      active={editor.isActive("italic")}             title="Italic">      <Italic size={15} /></Btn>
        <Sep />
        <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Section"><Heading1 size={15} /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Subsection"><Heading2 size={15} /></Btn>
        <Sep />
        <Btn onClick={() => editor.chain().focus().toggleBulletList().run()}  active={editor.isActive("bulletList")}         title="Bullet list"> <List size={15} /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}        title="Ordered list"><ListOrdered size={15} /></Btn>
        <Sep />
        <Btn onClick={() => editor.chain().focus().toggleCodeBlock().run()}   active={editor.isActive("codeBlock")}          title="Code block">  <Code size={15} /></Btn>
        <Btn onClick={insertImage}  title="Insert image"> <ImageIcon size={15} /></Btn>
        <Btn onClick={insertTable}  title="Insert table"> <TableIcon size={15} /></Btn>
        <div className="flex-1" />
        <Btn onClick={() => editor.chain().focus().undo().run()} title="Undo"><Undo size={15} /></Btn>
        <Btn onClick={() => editor.chain().focus().redo().run()} title="Redo"><Redo size={15} /></Btn>
      </div>

      {/* ── Table Toolbar (contextual) ───────────────────────────── */}
      {isInTable && (
        <div className="flex flex-wrap items-center gap-1 p-1.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 rounded-lg">
          <span className="text-[10px] font-black uppercase tracking-wider text-blue-500 dark:text-blue-400 mr-1 px-1">Table</span>
          <Sep />
          <Btn sm onClick={() => editor.chain().focus().addRowBefore().run()}  title="Add row above">  <ChevronUp   size={13} /><span className="text-[10px] ml-0.5">Row ↑</span></Btn>
          <Btn sm onClick={() => editor.chain().focus().addRowAfter().run()}   title="Add row below">  <ChevronDown size={13} /><span className="text-[10px] ml-0.5">Row ↓</span></Btn>
          <Btn sm danger onClick={() => editor.chain().focus().deleteRow().run()}     title="Delete row">    <Trash2 size={13} /><span className="text-[10px] ml-0.5">Row</span></Btn>
          <Sep />
          <Btn sm onClick={() => editor.chain().focus().addColumnBefore().run()} title="Add column left">  <ChevronLeft  size={13} /><span className="text-[10px] ml-0.5">Col ←</span></Btn>
          <Btn sm onClick={() => editor.chain().focus().addColumnAfter().run()}  title="Add column right"> <ChevronRight size={13} /><span className="text-[10px] ml-0.5">Col →</span></Btn>
          <Btn sm danger onClick={() => editor.chain().focus().deleteColumn().run()}  title="Delete column"> <Trash2 size={13} /><span className="text-[10px] ml-0.5">Col</span></Btn>
          <Sep />
          <Btn sm danger onClick={() => editor.chain().focus().deleteTable().run()}   title="Delete table">  <Trash2 size={13} /><span className="text-[10px] ml-0.5">Delete Table</span></Btn>
        </div>
      )}

      {/* ── Code Block Language Selector (contextual) ───────────── */}
      {isInCode && (
        <div className="flex items-center gap-2 p-1.5 bg-zinc-800 border border-zinc-700 rounded-lg">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 px-1">Language</span>
          <select
            value={currentLang}
            onChange={(e) => editor.chain().focus().updateAttributes("codeBlock", { language: e.target.value }).run()}
            className="text-xs bg-zinc-700 text-zinc-100 border border-zinc-600 rounded px-2 py-0.5 outline-none cursor-pointer"
          >
            {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      )}

      {/* ── Editor Canvas ────────────────────────────────────────── */}
      <div className="p-6 bg-white dark:bg-zinc-950 rounded-xl border dark:border-zinc-800 cursor-text"
           onClick={() => editor.chain().focus().run()}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

/* ── Shared sub-components ────────────────────────────────────── */
function Btn({ children, onClick, active, title, sm, danger }: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  title?: string;
  sm?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex items-center gap-0.5 rounded transition-colors ${sm ? "px-2 py-1 text-[11px]" : "p-2"}
        ${danger  ? "text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30"
        : active  ? "bg-gray-200 dark:bg-zinc-700 text-black dark:text-white"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"}`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-5 bg-gray-200 dark:bg-zinc-700 self-center mx-0.5 shrink-0" />;
}
