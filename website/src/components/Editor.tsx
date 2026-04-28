"use client";

import React, { useState, useEffect } from "react";
import UnifiedEditor from "./UnifiedEditor";
import { saveAs } from "file-saver";
import { Save, Trash2, Download, AlertCircle } from "lucide-react";

/* ─────────────────────────────────────────────────────────────────
   JSON → LaTeX converter (ProseMirror document tree traversal)
   ───────────────────────────────────────────────────────────────── */

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

      const body = rows.map((row: any) => {
        const cells = (row.content ?? []).map((cell: any) =>
          (cell.content ?? []).map(convertNodeToLatex).join("").replace(/\n+$/, "").trim()
        );
        return cells.join(" & ") + " \\\\ \\hline";
      }).join("\n");

      return `\\begin{figure}[h]\n\\centering\n\\begin{tabular}{${colSpec}}\n\\hline\n${body}\n\\end{tabular}\n\\caption{Design Data}\n\\end{figure}\n\n`;
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
  metadataMissing?: boolean;
  onSaved: (path: string, content: string) => void;
  onDeleted: (path: string) => void;
  onContentChange?: (latex: string) => void;
  onTitleChange?: (title: string) => void;
  onAuthorChange?: (author: string) => void;
  onPhaseChange?: (phase: string) => void;
  onImageUpload?: (path: string, base64: string) => void;
}

export default function Editor({ 
  config, 
  filename, 
  isLocalMode, 
  initialTitle = "", 
  initialAuthor = "", 
  initialPhase = "", 
  initialContent = "",
  metadataMissing = false,
  onSaved, 
  onDeleted, 
  onContentChange,
  onImageUpload,
  onTitleChange,
  onAuthorChange,
  onPhaseChange
}: EditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [author, setAuthor] = useState(initialAuthor);
  const [phase, setPhase] = useState(initialPhase);
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);

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
    const metadata = JSON.stringify({ content: cnt });
    let latex = `% METADATA: ${metadata}\n`;
    latex += `\\newentry{${t}}{${new Date().toLocaleDateString()}}{${a}}{${p}}\n\n`;
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
    
    if (isLocalMode) {
       onSaved(filename, latex);
       setIsSaving(false);
       return;
    }

    try {
      const response = await fetch("/api/github/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...config,
          path: filename,
          content: latex,
          message: `Update ${filename}`,
        }),
      });

      if (response.ok) {
        onSaved(filename, latex);
      } else {
        alert("Failed to save to GitHub");
      }
    } catch (error) {
      console.error("Save error:", error);
      alert("Error saving file");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
     const latex = generateLatex(content, title, author, phase);
     const blob = new Blob([latex], { type: "text/plain;charset=utf-8" });
     saveAs(blob, filename);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950 overflow-y-auto">
      <div className="flex justify-between items-center p-6 border-b dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur sticky top-0 z-40">
        <div className="flex flex-col">
          <h1 className="text-xl font-black uppercase tracking-tighter dark:text-white">Engineering Editor</h1>
          <span className="text-[10px] font-mono text-gray-400 truncate max-w-[300px]">{filename}</span>
        </div>
        
        <div className="flex gap-3">
          <button onClick={handleDownload} className="p-2.5 text-gray-400 hover:text-black dark:hover:text-white transition-all bg-gray-50 dark:bg-zinc-800 rounded-xl" title="Download .tex">
            <Download size={20} />
          </button>
          
          <button onClick={() => onDeleted(filename)} className="p-2.5 text-gray-400 hover:text-red-500 transition-all bg-gray-50 dark:bg-zinc-800 rounded-xl" title="Delete Entry">
            <Trash2 size={20} />
          </button>

          <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest shadow-xl shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50">
            <Save size={18} />
            {isSaving ? "Saving..." : "Commit Changes"}
          </button>
        </div>
      </div>

      <div className="max-w-4xl w-full mx-auto p-10 pb-32">
        {metadataMissing && (
           <div className="mb-10 bg-amber-50 dark:bg-amber-900/10 border-2 border-amber-200 dark:border-amber-800/50 p-6 rounded-2xl flex items-start gap-4">
              <AlertCircle className="text-amber-500 shrink-0 mt-1" size={24} />
              <div className="space-y-1">
                  <p className="text-sm font-black uppercase tracking-widest text-amber-800 dark:text-amber-400">Legacy File Detected</p>
                  <p className="text-sm text-amber-700/80 dark:text-amber-500/80 leading-relaxed">This file has manual LaTeX content. You can overwrite it by starting to type below, or view the source on the right.</p>
              </div>
           </div>
        )}

        <div className="space-y-12">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-zinc-500 ml-1">Notebook Entry Title</label>
              <input 
                type="text" 
                value={title} 
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ENTRY TITLE..."
                className="w-full text-5xl font-serif font-black border-none outline-none bg-transparent placeholder:text-gray-200 dark:placeholder:text-zinc-800 leading-tight dark:text-white"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-8 border-y-2 border-dashed border-gray-100 dark:border-zinc-900 py-8">
              <div className="space-y-2">
                 <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-zinc-500 ml-1">Lead Author</label>
                 <input 
                    type="text" 
                    value={author} 
                    onChange={(e) => setAuthor(e.target.value)}
                    className="w-full font-serif font-bold text-xl outline-none bg-transparent dark:text-zinc-100"
                    placeholder="Engineering Lead..."
                 />
              </div>
              <div className="space-y-2">
                 <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-zinc-500 ml-1">Process Phase</label>
                 <select 
                    value={phase} 
                    onChange={(e) => setPhase(e.target.value)}
                    className="w-full font-serif font-bold text-xl outline-none bg-transparent appearance-none cursor-pointer dark:text-zinc-100 pr-8"
                 >
                    <option value="Define Problem">Define Problem</option>
                    <option value="Generate Concepts">Generate Concepts</option>
                    <option value="Develop Solution">Develop Solution</option>
                    <option value="Construct and Test">Construct and Test</option>
                    <option value="Evaluate Solution">Evaluate Solution</option>
                 </select>
              </div>
            </div>

            <div className="pt-4 min-h-[600px]">
              <UnifiedEditor
                key={filename}
                filename={filename}
                content={content}
                onChange={setContent}
                onImageUpload={onImageUpload}
                author={author}
              />
            </div>
        </div>
      </div>
    </div>
  );
}
