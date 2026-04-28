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
import Placeholder from "@tiptap/extension-placeholder";
import { common, createLowlight } from "lowlight";
import {
  Bold, Italic, List, ListOrdered, Code,
  Heading1, Heading2, Image as ImageIcon,
  Table as TableIcon, Undo, Redo, Trash2,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Pencil, AlertTriangle, FileCode, Check, Code2
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
    className={`p-1.5 rounded transition-all flex items-center justify-center ${active
      ? "bg-nb-primary/10 text-nb-primary shadow-sm"
      : "text-nb-on-surface-variant hover:bg-nb-surface-low hover:text-nb-secondary"
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
      alt: { default: "" },
      title: { default: "" }, // author initials
      filePath: { default: null }, // disk path for LaTeX
      caption: { default: "" }, // unify with table/code
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});

function ImageNodeView({ node, updateAttributes, deleteNode }: any) {
  return (
    <NodeViewWrapper className="my-10 group relative">
      <div className="rounded-2xl border border-nb-outline-variant/40 overflow-hidden bg-nb-surface shadow-nb-sm group-hover:shadow-nb-md transition-shadow">
        {/* Header bar */}
        <div
          contentEditable={false}
          className="flex items-center gap-2 px-3 py-2 bg-nb-tertiary text-white border-b border-nb-outline-variant/20"
        >
          <div className="w-5 h-5 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <ImageIcon size={10} />
          </div>
          <span className="text-xs font-semibold">Image Resource</span>

          <div className="flex items-center gap-3 ml-auto mr-2">
            {node.attrs.filePath && (
              <span className="text-[9px] font-mono opacity-60 hidden sm:inline">{node.attrs.filePath.split('/').pop()}</span>
            )}
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold uppercase tracking-widest opacity-60">By</span>
              <input
                type="text"
                value={node.attrs.title ?? ""}
                onChange={(e) => updateAttributes({ title: e.target.value })}
                placeholder="Initials"
                className="w-12 text-[10px] font-mono font-bold bg-white/10 border border-white/20 rounded px-1.5 py-0.5 outline-none focus:bg-white/20 text-white placeholder:text-white/30"
              />
            </div>
          </div>

          <button
            onClick={() => deleteNode()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-red-500 transition-colors text-[9px] font-bold uppercase tracking-widest"
          >
            <Trash2 size={12} />
            <span>Remove</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-1 bg-nb-bg flex justify-center">
          <img
            src={node.attrs.src}
            alt={node.attrs.alt}
            className="max-w-full h-auto block select-none pointer-events-none rounded-lg"
            draggable={false}
          />
        </div>

        {/* Caption area */}
        <div
          contentEditable={false}
          className="px-5 py-4 bg-nb-surface-mid/30 border-t border-nb-outline-variant/30 flex items-center gap-3"
        >
          <div className="w-8 h-8 rounded-lg bg-nb-tertiary/10 flex items-center justify-center shrink-0">
            <ImageIcon size={14} className="text-nb-tertiary" />
          </div>
          <div className="flex-1">
            <label className="block text-[8px] font-bold uppercase tracking-widest text-nb-on-surface-variant mb-1">Figure Caption</label>
            <input
              type="text"
              value={node.attrs.alt ?? ""}
              onChange={(e) => updateAttributes({ alt: e.target.value })}
              placeholder="Descriptive figure caption…"
              className="w-full text-xs font-medium bg-transparent outline-none placeholder:text-nb-on-surface-variant/40 text-nb-on-surface"
            />
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Table Node View — with integrated controls
   ───────────────────────────────────────────────────────────────── */

const TableWithCaption = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      caption: { default: "" },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(TableNodeView);
  },
});

function TableNodeView({ node, updateAttributes, deleteNode, editor }: any) {
  return (
    <NodeViewWrapper className="my-10 group relative">
      <div className="rounded-2xl border border-nb-outline-variant/40 overflow-hidden bg-nb-surface shadow-nb-sm group-hover:shadow-nb-md transition-shadow">
        {/* Integrated Header Controls */}
        <div
          contentEditable={false}
          className="flex flex-wrap items-center gap-2 px-3 py-2 bg-nb-secondary text-white border-b border-nb-outline-variant/20"
        >
          <div className="w-5 h-5 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <TableIcon size={10} />
          </div>
          <span className="text-xs font-semibold mr-2">Table Block</span>

          <div className="flex items-center gap-0.5 bg-white/10 rounded-lg p-0.5 mr-2">
            <button onClick={() => editor.chain().focus().addRowBefore().run()} className="p-1.5 hover:bg-white/20 rounded-md transition-colors" title="Add Row Above"><ChevronUp size={14} /></button>
            <button onClick={() => editor.chain().focus().addRowAfter().run()} className="p-1.5 hover:bg-white/20 rounded-md transition-colors" title="Add Row Below"><ChevronDown size={14} /></button>
            <div className="w-px h-3 bg-white/20 mx-0.5" />
            <button onClick={() => editor.chain().focus().deleteRow().run()} className="p-1.5 hover:bg-red-500/40 rounded-md transition-colors" title="Delete Row"><Trash2 size={13} /></button>
          </div>

          <div className="flex items-center gap-0.5 bg-white/10 rounded-lg p-0.5">
            <button onClick={() => editor.chain().focus().addColumnBefore().run()} className="p-1.5 hover:bg-white/20 rounded-md transition-colors" title="Add Column Left"><ChevronLeft size={14} /></button>
            <button onClick={() => editor.chain().focus().addColumnAfter().run()} className="p-1.5 hover:bg-white/20 rounded-md transition-colors" title="Add Column Right"><ChevronRight size={14} /></button>
            <div className="w-px h-3 bg-white/20 mx-0.5" />
            <button onClick={() => editor.chain().focus().deleteColumn().run()} className="p-1.5 hover:bg-red-500/40 rounded-md transition-colors" title="Delete Column"><Trash2 size={13} /></button>
          </div>

          <button
            onClick={() => deleteNode()}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-red-500 transition-colors text-[9px] font-bold uppercase tracking-widest"
          >
            <Trash2 size={12} />
            <span>Remove</span>
          </button>
        </div>

        {/* Table Content */}
        <div className="p-1 bg-nb-surface-low overflow-x-auto">
          <NodeViewContent as="div" className="border-collapse w-full" />
        </div>

        {/* Caption area */}
        <div
          contentEditable={false}
          className="px-5 py-4 bg-nb-surface-mid/30 border-t border-nb-outline-variant/30 flex items-center gap-3"
        >
          <div className="w-8 h-8 rounded-lg bg-nb-secondary/10 flex items-center justify-center shrink-0">
            <TableIcon size={14} className="text-nb-secondary" />
          </div>
          <div className="flex-1">
            <label className="block text-[8px] font-bold uppercase tracking-widest text-nb-on-surface-variant mb-1">Table Caption</label>
            <input
              type="text"
              value={node.attrs.caption ?? ""}
              onChange={(e) => updateAttributes({ caption: e.target.value })}
              placeholder="Description of the table content…"
              className="w-full text-xs font-medium bg-transparent outline-none placeholder:text-nb-on-surface-variant/40 text-nb-on-surface"
            />
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Code Block Node View — per-block language selector inline
   ───────────────────────────────────────────────────────────────── */

const CustomCodeBlock = CodeBlockLowlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      language: { default: "plaintext" },
      caption: { default: "" },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView);
  },
});

function CodeBlockNodeView({ node, updateAttributes, deleteNode }: any) {
  return (
    <NodeViewWrapper className="my-10 group relative">
      <div className="rounded-2xl border border-nb-outline-variant/40 overflow-hidden bg-nb-surface shadow-nb-sm group-hover:shadow-nb-md transition-shadow">
        {/* Header bar */}
        <div
          contentEditable={false}
          className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-white border-b border-white/5"
        >
          <div className="w-5 h-5 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
            <Code2 size={10} className="text-nb-primary" />
          </div>
          <span className="text-xs font-semibold">Code Snippet</span>

          <select
            value={node.attrs.language ?? "plaintext"}
            onChange={(e) => updateAttributes({ language: e.target.value })}
            className="ml-auto text-[9px] font-bold uppercase tracking-widest bg-white/10 text-white border border-white/20 rounded px-2 py-1 outline-none cursor-pointer hover:bg-white/20 transition-colors mr-2"
          >
            {LANGUAGES.map((l) => <option key={l} value={l} className="bg-zinc-900">{l}</option>)}
          </select>

          <button
            onClick={() => deleteNode()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-red-500 transition-colors text-[9px] font-bold uppercase tracking-widest"
          >
            <Trash2 size={12} />
            <span>Remove</span>
          </button>
        </div>

        {/* Content */}
        <div className="bg-nb-bg">
          <pre className="p-6 text-sm leading-relaxed overflow-x-auto border-none rounded-none m-0">
            <NodeViewContent as="div" className="font-mono" />
          </pre>
        </div>

        {/* Caption area */}
        <div
          contentEditable={false}
          className="px-5 py-4 bg-nb-surface-mid/30 border-t border-nb-outline-variant/30 flex items-center gap-3"
        >
          <div className="w-8 h-8 rounded-lg bg-nb-primary/10 flex items-center justify-center shrink-0">
            <Code2 size={14} className="text-nb-primary" />
          </div>
          <div className="flex-1">
            <label className="block text-[8px] font-bold uppercase tracking-widest text-nb-on-surface-variant mb-1">Snippet Caption</label>
            <input
              type="text"
              value={node.attrs.caption ?? ""}
              onChange={(e) => updateAttributes({ caption: e.target.value })}
              placeholder="What does this code do?…"
              className="w-full text-xs font-medium bg-transparent outline-none placeholder:text-nb-on-surface-variant/40 text-nb-on-surface"
            />
          </div>
        </div>
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
      const base64 = dataUrl.split(",")[1];
      const ext = file.name.split(".").pop() || "png";
      // ISO-8601 timestamp filename (colons → hyphens for filesystem safety)
      const ts = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
      const newPath = `notebook/resources/${ts}.${ext}`;

      editor?.chain().focus().insertContent({
        type: "image",
        attrs: {
          src: dataUrl,
          alt: "",
          title: author ?? "",
          filePath: newPath,
        },
      }).run();

      if (onImageUpload) onImageUpload(newPath, base64);
    };
    reader.readAsDataURL(file);
  };

  const [, setSelectionUpdate] = useState(0);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      ImageWithCaption.configure({ inline: false, allowBase64: true }),
      TableWithCaption.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      CustomCodeBlock.configure({ lowlight }),
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
      <div className="flex flex-wrap items-center gap-1.5 p-2 border border-nb-outline-variant rounded-xl bg-nb-surface sticky top-0 z-30 shadow-nb-sm">
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

        <div className="w-px h-6 bg-nb-outline-variant/30 mx-1" />

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

        <div className="w-px h-6 bg-nb-outline-variant/30 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive("codeBlock")}
          title="Code Block"
        >
          <Code size={16} />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          title="Insert Table"
        >
          <TableIcon size={16} />
        </ToolbarButton>

        <label className="p-2 rounded-lg cursor-pointer text-nb-on-surface-variant hover:bg-nb-surface-mid transition-all" title="Upload Image">
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
      </div>

      <div className="relative group/editor">
        {/* Table Controls (Now embedded in NodeView, keeping this for fallback/external interaction) */}
        {isInTable && !editor.isActive('table') && (
          <div className="absolute -top-12 left-0 right-0 flex flex-wrap items-center justify-center gap-2 p-1.5 bg-nb-primary text-white rounded-lg shadow-nb-lg z-20 animate-in fade-in slide-in-from-bottom-2 duration-200">
            {/* ... fallback controls ... */}
          </div>
        )}

        {/* ── Main Editor Area ───────────────────────────────────────── */}
        <div className="bg-nb-surface min-h-[600px] relative">
          <EditorContent editor={editor} className="max-w-none" />
        </div>
      </div>

      {/* ── Raw LaTeX Confirm Dialog ────────────────────────────────── */}
      {showRawConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-nb-secondary/60 backdrop-blur-md px-4" onClick={() => setShowRawConfirm(false)}>
          <div
            className="bg-nb-surface rounded-2xl p-7 shadow-nb-lg max-w-sm w-full border border-nb-outline-variant animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-nb-primary/10 flex items-center justify-center shrink-0">
                <FileCode size={20} className="text-nb-primary" />
              </div>
              <h3 className="font-bold text-sm uppercase tracking-widest text-nb-secondary">Switch to Raw Mode?</h3>
            </div>

            <div className="space-y-4 mb-8">
              <p className="text-sm text-nb-on-surface-variant leading-relaxed">
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
                className="flex-1 px-4 py-2.5 rounded-xl border border-nb-outline-variant text-xs font-bold uppercase tracking-widest text-nb-on-surface-variant hover:bg-nb-surface-low transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowRawConfirm(false); onSwitchToRawLatex?.(); }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-nb-primary text-white text-xs font-bold uppercase tracking-widest hover:bg-nb-primary-dim transition-all shadow-md shadow-nb-primary/20 active:scale-[0.98]"
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
  return <div className={`w-px h-6 self-center mx-2 shrink-0 ${light ? "bg-white/20" : "bg-nb-outline-variant/30"}`} />;
}
