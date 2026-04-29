"use client";

import React, { useState, useEffect } from "react";
import UnifiedEditor from "./UnifiedEditor";
import { saveAs } from "file-saver";
import { Save, Trash2, Download, AlertCircle, Loader2, User, Target, X, FileCode } from "lucide-react";

const PHASES = [
  "Define Problem",
  "Generate Concepts",
  "Develop Solution",
  "Construct and Test",
  "Evaluate Solution",
];

const escapeLaTeX = (text: string) =>
  text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const convertNodeToLatex = (node: any): string => {
  if (!node) return "";
  const children = () => (node.content || []).map(convertNodeToLatex).join("");

  switch (node.type) {
    case "doc":
      return children();

    case "text": {
      let t = escapeLaTeX(node.text ?? "");
      for (const mark of (node.marks ?? [])) {
        if (mark.type === "bold") t = `\\textbf{${t}}`;
        if (mark.type === "italic") t = `\\textit{${t}}`;
        if (mark.type === "code") t = `\\texttt{${t}}`;
      }
      return t;
    }

    case "hardBreak":
      return "\\\\\n";

    case "paragraph": {
      const inner = children();
      return inner.trim() ? `${inner}\n\n` : "\n";
    }

    case "heading": {
      const level = node.attrs?.level ?? 2;
      const cmd = level === 1 ? "subsection*" : "subsubsection*";
      return `\\${cmd}{${children()}}\n\n`;
    }

    case "bulletList":
      return `\\begin{itemize}\n${children()}\\end{itemize}\n\n`;

    case "orderedList":
      return `\\begin{enumerate}\n${children()}\\end{enumerate}\n\n`;

    case "listItem": {
      // listItem wraps content in a paragraph; extract raw text
      const parts = (node.content || []).map((child: any) => {
        if (child.type === "paragraph") {
          return (child.content || []).map(convertNodeToLatex).join("");
        }
        return convertNodeToLatex(child);
      });
      return `  \\item ${parts.join("\n").trim()}\n`;
    }

    case "codeBlock": {
      const lang = node.attrs?.language ?? "plaintext";
      const code = (node.content || []).map((n: any) => n.text ?? "").join("");
      const caption = node.attrs?.caption ?? "";
      return `\\notebook_codeblock{${lang}}{${code}}{${caption}}\n\n`;
    }

    case "image": {
      const filePath = node.attrs?.filePath;
      const src = node.attrs?.src ?? "";
      const imgSrc = filePath
        ? filePath
        : src.startsWith("data:") ? "resources/embedded_image.png" : src;
      const caption = node.attrs?.alt ?? "Figure";
      const initials = node.attrs?.title ?? "";
      const width = node.attrs?.width ?? "100%";
      return `\\notebook_image{${imgSrc}}{${caption}}{${initials}}{${width}}\n\n`;
    }

    case "table": {
      const rows = node.content ?? [];
      if (!rows.length) return "";
      const colCount = (rows[0]?.content ?? []).length;
      const colSpec = "|l".repeat(colCount) + "|";
      const caption = node.attrs?.caption ?? "Design Data";

      const body = rows.map((row: any) => {
        const cells = (row.content ?? []).map((cell: any) =>
          (cell.content ?? []).map(convertNodeToLatex).join("").replace(/\n+$/, "").trim()
        );
        return cells.join(" & ") + " \\\\ \\hline";
      }).join("\n");

      return `\\notebook_table{${colSpec}}{${body}}{${caption}}\n\n`;
    }

    // tableRow / tableCell / tableHeader — just recurse
    case "tableRow":
    case "tableCell":
    case "tableHeader":
      return children();

    case "blockquote":
      return `\\begin{quote}\n${children()}\\end{quote}\n\n`;

    case "horizontalRule":
      return "\\noindent\\rule{\\linewidth}{0.4pt}\n\n";

    default:
      return children();
  }
};

const convertJsonToLatex = (jsonString: string): string => {
  if (!jsonString) return "";
  try {
    const doc = JSON.parse(jsonString);
    return convertNodeToLatex(doc).replace(/\n{3,}/g, "\n\n").trim() + "\n";
  } catch {
    // Legacy: plain HTML or raw text — strip tags as fallback
    return jsonString.replace(/<[^>]*>/g, "").trim() + "\n";
  }
};

/* ─────────────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────────────── */


interface EditorProps {
  config: {
    owner: string;
    repo: string;
    token: string;
    entriesDir: string;
  };
  filename: string;
  isLocalMode?: boolean;
  initialTitle?: string;
  initialAuthor?: string;
  initialPhase?: string;
  initialContent: string;
  initialCreatedAt?: string;
  metadataMissing?: boolean;
  onSaved: (path: string, latexContent: string) => void;
  onDeleted: (path: string) => void;
  onContentChange?: (latex: string) => void;
  onTitleChange?: (title: string) => void;
  onAuthorChange?: (author: string) => void;
  onPhaseChange?: (phase: string) => void;
  onImageUpload?: (path: string, base64: string) => void;
  onMetadataRebuild?: (entryPath: string, tiptapJson: string, info?: { title: string; author: string; phase: string; createdAt?: string }) => void;
  /** Called when user confirms switching to raw LaTeX mode */
  onSwitchToRawLatex?: () => void;
  onClose?: () => void;
}

export default function Editor({
  config,
  filename,
  isLocalMode,
  initialTitle = "",
  initialAuthor = "",
  initialPhase = "",
  initialContent = "",
  initialCreatedAt = "",
  metadataMissing = false,
  onSaved,
  onDeleted,
  onContentChange,
  onImageUpload,
  onTitleChange,
  onAuthorChange,
  onPhaseChange,
  onMetadataRebuild,
  onSwitchToRawLatex,
  onClose,
}: EditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [author, setAuthor] = useState(initialAuthor);
  const [phase, setPhase] = useState(initialPhase);
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Reset local state only when the file changes, not on every parent re-render.
  // Reading the initial* props inside is fine — we just don't want them as triggers.
  useEffect(() => {
    setTitle(initialTitle);
    setAuthor(initialAuthor);
    setPhase(initialPhase);
    setContent(initialContent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename]);

  const generateLatex = (cnt: string, t: string, a: string, p: string) => {
    let dateObj = initialCreatedAt ? new Date(initialCreatedAt) : new Date();

    // Fallback for mangled timestamps (e.g. 2026-04-28T17-36-32)
    if (isNaN(dateObj.getTime()) && initialCreatedAt) {
      const repaired = initialCreatedAt.replace(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/, "$1T$2:$3:$4");
      dateObj = new Date(repaired);
    }

    // Final fallback to now if still invalid
    if (isNaN(dateObj.getTime())) {
      dateObj = new Date();
    }

    const metadata = JSON.stringify({
      content: cnt,
      title: t,
      author: a,
      phase: p,
      createdAt: initialCreatedAt || dateObj.toISOString()
    });
    let latex = `% METADATA: ${metadata}\n`;
    const dateStr = dateObj.toISOString().split('T')[0];
    latex += `\\notebook_entry{${t}}{${dateStr}}{${a}}{${p}}\n\n`;
    latex += convertJsonToLatex(cnt);
    return latex;
  };

  const validate = () => {
    const errors: string[] = [];
    if (!title.trim()) errors.push("Project Title is required.");
    if (!author.trim()) errors.push("Author is required.");
    if (!phase) errors.push("Project Phase is required.");

    try {
      const doc = JSON.parse(content);
      const checkCaptions = (node: any) => {
        if (node.type === "image" && !node.attrs?.alt?.trim()) errors.push("All images must have a caption.");
        if (node.type === "table" && !node.attrs?.caption?.trim()) errors.push("All tables must have a caption.");
        if (node.type === "codeBlock" && !node.attrs?.caption?.trim()) errors.push("All code blocks must have a caption.");
        (node.content ?? []).forEach(checkCaptions);
      };
      checkCaptions(doc);
    } catch { /* ignore */ }

    return { valid: errors.length === 0, errors };
  };

  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Notify parent of content changes. Callbacks are intentionally omitted from
  // deps — they're new arrow function instances on every App render, and adding
  // them would cause an infinite loop.
  useEffect(() => {
    if (onContentChange) onContentChange(generateLatex(content, title, author, phase));
    if (onTitleChange) onTitleChange(title);
    if (onAuthorChange) onAuthorChange(author);
    if (onPhaseChange) onPhaseChange(phase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, title, author, phase]);


  const handleSave = async () => {
    const { valid, errors } = validate();
    if (!valid) {
      setValidationErrors(errors);
      return;
    }

    setValidationErrors([]);
    setIsSaving(true);
    const latex = generateLatex(content, title, author, phase);

    // Notify parent so it can rebuild metadata.json from TipTap JSON
    if (onMetadataRebuild) {
      onMetadataRebuild(filename, content, { title, author, phase, createdAt: initialCreatedAt });
    }

    // Execute the parent's save handler
    await onSaved(filename, latex);
    setIsSaving(false);
  };

  const handleDownload = () => {
    const latex = generateLatex(content, title, author, phase);
    const blob = new Blob([latex], { type: "text/plain;charset=utf-8" });
    saveAs(blob, filename);
  };

  return (
    <div className="flex flex-col h-full bg-nb-surface">
      {/* ── Editor Header ────────────────────────────────────────── */}
      <div className="px-6 py-5 border-b border-nb-outline-variant bg-nb-surface-low shrink-0">
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-4">
          
          {/* Row 1: Metadata (Center Aligned) */}
          <div className="w-full flex flex-col items-center text-center">
            <input
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); onTitleChange?.(e.target.value); }}
              placeholder="Entry Title..."
              className="w-full text-2xl font-bold bg-transparent text-nb-on-surface outline-none placeholder:text-nb-outline-variant text-center mb-4"
            />
            
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-2 group">
                <User size={14} className="text-nb-tertiary" />
                <input
                  type="text"
                  value={author}
                  onChange={(e) => { setAuthor(e.target.value); onAuthorChange?.(e.target.value); }}
                  placeholder="Author"
                  className="text-xs font-semibold text-nb-on-surface-variant bg-transparent outline-none border-b border-nb-outline-variant/30 focus:border-nb-tertiary transition-all w-32 text-center"
                />
              </div>
              
              <div className="hidden md:block w-px h-4 bg-nb-outline-variant/30" />
              
              <div className="flex items-center gap-2 group">
                <Target size={14} className="text-nb-tertiary" />
                <select
                  value={phase}
                  onChange={(e) => { setPhase(e.target.value); onPhaseChange?.(e.target.value); }}
                  className="text-[10px] font-bold uppercase tracking-widest text-nb-on-surface-variant bg-transparent outline-none cursor-pointer hover:text-nb-tertiary transition-colors"
                >
                  <option value="" className="bg-nb-surface text-nb-on-surface">Select Phase</option>
                  {PHASES.map(p => (
                    <option key={p} value={p} className="bg-nb-surface text-nb-on-surface">
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Row 2: Action Buttons (Center Aligned) */}
          <div className="flex flex-wrap items-center justify-center gap-2 relative">
            {!isLocalMode && (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-1.5 bg-nb-primary text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md shadow-nb-primary/20 hover:bg-nb-primary-dim transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                <span>Save to Drive</span>
              </button>
            )}

            {validationErrors.length > 0 && (
              <div className="absolute top-full mt-2 z-[80] w-64 bg-red-50 border border-red-200 rounded-xl p-3 shadow-nb-lg animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center gap-2 mb-2 text-red-600">
                  <AlertCircle size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Missing Requirements</span>
                </div>
                <ul className="space-y-1">
                  {validationErrors.map((err, i) => (
                    <li key={i} className="text-[10px] text-red-700 list-disc list-inside font-medium">{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-nb-outline-variant text-xs font-bold text-nb-on-surface-variant hover:bg-nb-surface-mid transition-all active:scale-[0.98]"
            >
              <X size={14} />
              <span>Close</span>
            </button>
            
            <div className="hidden sm:block w-px h-4 bg-nb-outline-variant/30 mx-1" />

            <button
              onClick={onSwitchToRawLatex}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-nb-on-surface-variant/80 hover:text-nb-on-surface hover:bg-nb-surface-mid transition-all"
            >
              <FileCode size={14} />
              <span>Raw LaTeX</span>
            </button>

            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-nb-on-surface-variant/40 hover:text-nb-primary hover:bg-nb-primary/5 transition-all"
            >
              <Trash2 size={14} />
              <span>Delete</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── TipTap Workspace ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-nb-surface scrollbar-hide">
        <div className="max-w-4xl mx-auto px-12 py-16 min-h-full">
          <UnifiedEditor
            key={filename}
            filename={filename}
            content={content}
            onChange={setContent}
            onImageUpload={onImageUpload}
            onSwitchToRawLatex={onSwitchToRawLatex}
            author={author}
          />
        </div>
      </div>

      {/* ── Delete confirmation ───────────────────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-nb-secondary/60 backdrop-blur-md px-4" onClick={() => setShowDeleteConfirm(false)}>
          <div
            className="bg-nb-surface rounded-2xl p-7 shadow-nb-lg max-w-sm w-full border border-nb-outline-variant animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-nb-primary/10 flex items-center justify-center shrink-0">
                <Trash2 size={20} className="text-nb-primary" />
              </div>
              <h3 className="font-bold text-sm uppercase tracking-widest text-nb-secondary">Delete Entry?</h3>
            </div>
            
            <p className="text-sm text-nb-on-surface-variant leading-relaxed mb-8">
              This will permanently remove the entry from your notebook. This action cannot be undone once committed.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-nb-outline-variant text-xs font-bold uppercase tracking-widest text-nb-on-surface-variant hover:bg-nb-surface-low transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); onDeleted(filename); }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-nb-primary text-white text-xs font-bold uppercase tracking-widest hover:bg-nb-primary-dim transition-all shadow-md shadow-nb-primary/20"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
