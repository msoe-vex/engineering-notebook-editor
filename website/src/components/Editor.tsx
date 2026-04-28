"use client";

import React, { useState, useEffect } from "react";
import UnifiedEditor from "./UnifiedEditor";
import { saveAs } from "file-saver";
import { Save, Trash2, Download, AlertCircle, Loader2, User, Target } from "lucide-react";

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
    .replace(/&/g,  "\\&")
    .replace(/%/g,  "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g,  "\\#")
    .replace(/_/g,  "\\_")
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
        if (mark.type === "bold")   t = `\\textbf{${t}}`;
        if (mark.type === "italic") t = `\\textit{${t}}`;
        if (mark.type === "code")   t = `\\texttt{${t}}`;
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
      const lang = node.attrs?.language;
      const code = (node.content || []).map((n: any) => n.text ?? "").join("");
      const opt  = lang && lang !== "plaintext" ? `[language=${lang}]` : "";
      return `\\begin{lstlisting}${opt}\n${code}\n\\end{lstlisting}\n\n`;
    }

    case "image": {
      // Prefer the disk file path; fall back if only a data-URL is available
      const filePath = node.attrs?.filePath;
      const src      = node.attrs?.src ?? "";
      const imgSrc   = filePath
        ? filePath
        : src.startsWith("data:") ? "resources/embedded_image.png" : src;
      const caption  = node.attrs?.alt   ?? "Figure";
      const initials = node.attrs?.title ?? "";
      return `\\image{${imgSrc}}{${caption}}{${initials}}\n\n`;
    }

    case "table": {
      const rows = node.content ?? [];
      if (!rows.length) return "";
      const colCount = (rows[0]?.content ?? []).length;
      const colSpec  = "|l".repeat(colCount) + "|";
      const caption  = node.attrs?.caption ?? "Design Data";

      const body = rows.map((row: any) => {
        const cells = (row.content ?? []).map((cell: any) =>
          (cell.content ?? []).map(convertNodeToLatex).join("").replace(/\n+$/, "").trim()
        );
        return cells.join(" & ") + " \\\\ \\hline";
      }).join("\n");

      return `\\begin{figure}[h]\n\\centering\n\\begin{tabular}{${colSpec}}\n\\hline\n${body}\n\\end{tabular}\n\\caption{${caption}}\n\\end{figure}\n\n`;
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
  /** Called after save with the raw TipTap JSON string so App can rebuild metadata.json */
  onMetadataRebuild?: (entryPath: string, tiptapJson: string, info?: { title: string; author: string; phase: string; createdAt?: string }) => void;
  /** Called when user confirms switching to raw LaTeX mode */
  onSwitchToRawLatex?: () => void;
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
    const metadata = JSON.stringify({ 
      content: cnt,
      title: t,
      author: a,
      phase: p,
      createdAt: initialCreatedAt || new Date().toISOString()
    });
    let latex = `% METADATA: ${metadata}\n`;
    const dateObj = (initialCreatedAt ? new Date(initialCreatedAt) : new Date());
    const dateStr = dateObj.toISOString().split('T')[0];
    latex += `\\newentry{${t}}{${dateStr}}{${a}}{${p}}\n\n`;
    latex += convertJsonToLatex(cnt);
    return latex;
  };

  // Notify parent of content changes. Callbacks are intentionally omitted from
  // deps — they're new arrow function instances on every App render, and adding
  // them would cause an infinite loop.
  useEffect(() => {
    if (onContentChange) onContentChange(generateLatex(content, title, author, phase));
    if (onTitleChange)   onTitleChange(title);
    if (onAuthorChange)  onAuthorChange(author);
    if (onPhaseChange)   onPhaseChange(phase);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, title, author, phase]);


  const handleSave = async () => {
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
    <div className="flex flex-col h-full bg-nb-surface dark:bg-nb-dark-bg">
      {/* ── Editor Header ────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-nb-surface-mid dark:border-nb-dark-outline-variant bg-nb-surface-lowest dark:bg-nb-dark-surface shrink-0">
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
               <input
                 type="text"
                 value={title}
                 onChange={(e) => { setTitle(e.target.value); onTitleChange?.(e.target.value); }}
                 placeholder="Project Title"
                 className="w-full text-2xl font-black tracking-tighter bg-transparent text-nb-secondary dark:text-nb-dark-on-surface outline-none placeholder:text-nb-outline-variant dark:placeholder:text-nb-dark-outline"
               />
               <div className="flex items-center gap-3 mt-1">
                 <div className="flex items-center gap-1.5 group">
                   <User size={10} className="text-nb-on-surface-variant/40 group-focus-within:text-nb-tertiary transition-colors" />
                   <input
                     type="text"
                     value={author}
                     onChange={(e) => { setAuthor(e.target.value); onAuthorChange?.(e.target.value); }}
                     placeholder="Lead Engineer"
                     className="text-[11px] font-bold text-nb-on-surface-variant dark:text-nb-dark-on-variant bg-transparent outline-none border-b border-transparent focus:border-nb-tertiary transition-all w-32 placeholder:font-normal"
                   />
                 </div>
                 <div className="w-px h-3 bg-nb-outline-variant/30 dark:bg-nb-dark-outline/30" />
                 <div className="flex items-center gap-1.5">
                   <Target size={10} className="text-nb-on-surface-variant/40" />
                   <select
                     value={phase}
                     onChange={(e) => { setPhase(e.target.value); onPhaseChange?.(e.target.value); }}
                     className="text-[10px] font-black uppercase tracking-wider text-nb-on-surface-variant dark:text-nb-dark-on-variant bg-transparent outline-none cursor-pointer hover:text-nb-tertiary transition-colors"
                   >
                     <option value="" className="bg-nb-surface dark:bg-nb-dark-surface text-nb-on-surface dark:text-nb-dark-on-surface">Phase...</option>
                    {PHASES.map(p => (
                       <option key={p} value={p} className="bg-nb-surface dark:bg-nb-dark-surface text-nb-on-surface dark:text-nb-dark-on-surface">
                         {p}
                       </option>
                     ))}
                   </select>
                 </div>
               </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 bg-nb-tertiary hover:bg-nb-tertiary-dim disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-nb-tertiary/20 active:scale-[0.98]"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                <span className="hidden sm:inline">{isSaving ? "Saving" : "Save"}</span>
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2.5 rounded-xl border border-nb-outline-variant dark:border-nb-dark-outline text-nb-on-surface-variant hover:text-nb-primary transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── TipTap Workspace ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-nb-surface-low dark:bg-nb-dark-bg p-6 lg:p-10">
        <div className="max-w-4xl mx-auto">
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
            className="bg-nb-surface-lowest dark:bg-nb-dark-surface rounded-2xl p-7 shadow-nb-lg max-w-sm w-full border border-nb-outline-variant dark:border-nb-dark-outline animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-nb-primary/10 flex items-center justify-center shrink-0">
                <Trash2 size={20} className="text-nb-primary" />
              </div>
              <h3 className="font-black text-sm uppercase tracking-widest text-nb-secondary dark:text-nb-dark-on-surface">Delete Entry?</h3>
            </div>
            <p className="text-sm text-nb-on-surface-variant dark:text-nb-dark-on-variant leading-relaxed mb-8">
              Are you sure you want to delete this notebook entry? This cannot be undone once committed to GitHub.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-nb-outline-variant dark:border-nb-dark-outline text-xs font-black uppercase tracking-widest text-nb-on-surface-variant hover:bg-nb-surface-low dark:hover:bg-nb-dark-surface-low transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); onDeleted(filename); }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-nb-primary text-white text-xs font-black uppercase tracking-widest hover:bg-nb-primary-dim transition-all shadow-md shadow-nb-primary/20 active:scale-[0.98]"
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
