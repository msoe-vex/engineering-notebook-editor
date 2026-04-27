"use client";

import React, { useState, useEffect } from "react";
import BlockEditor from "./BlockEditor";
import { Block } from "./App";
import { saveAs } from "file-saver";
import { Save, Trash2, Download, AlertCircle } from "lucide-react";

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
  initialBlocks: Block[];
  metadataMissing?: boolean;
  onSaved: (path: string, content: string) => void;
  onDeleted: (path: string) => void;
  onContentChange?: (latex: string) => void;
  onBlocksChange?: (blocks: Block[]) => void;
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
  initialBlocks = [],
  metadataMissing = false,
  onSaved, 
  onDeleted, 
  onContentChange,
  onBlocksChange,
  onImageUpload,
  onTitleChange,
  onAuthorChange,
  onPhaseChange
}: EditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [author, setAuthor] = useState(initialAuthor);
  const [phase, setPhase] = useState(initialPhase);
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [isSaving, setIsSaving] = useState(false);

  // Only reset local state when we switch to a different file
  useEffect(() => {
    setTitle(initialTitle);
    setAuthor(initialAuthor);
    setPhase(initialPhase);
    setBlocks(initialBlocks);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename]);

  const generateLatex = (bks: Block[], t: string, a: string, p: string) => {
    let latex = `% METADATA: ${JSON.stringify({ blocks: bks })}\n`;
    latex += `\\newentry{${t}}{${new Date().toLocaleDateString()}}{${a}}{${p}}\n\n`;

    bks.forEach(block => {
      switch (block.type) {
        case "text":
          let text = block.content;
          text = text.replace(/<p>(.*?)<\/p>/g, "$1\n\n");
          text = text.replace(/<h1>(.*?)<\/h1>/g, "\\subsection{$1}\n");
          text = text.replace(/<h2>(.*?)<\/h2>/g, "\\subsubsection{$1}\n");
          text = text.replace(/<strong>(.*?)<\/strong>/g, "\\textbf{$1}");
          text = text.replace(/<em>(.*?)<\/em>/g, "\\textit{$1}");
          latex += text + "\n";
          break;
        case "image":
          latex += `\\image{${block.content.src}}{${block.content.caption}}{${block.content.initials || author}}\n\n`;
          break;
        case "table":
          let tableContent = "";
          block.content.rows.forEach((row: string[]) => {
            tableContent += row.join(" & ") + " \\\\ \\hline\n";
          });
          latex += `\\customtable{${"|l".repeat(block.content.cols)}|}{${tableContent}}{${block.content.caption}}\n\n`;
          break;
        case "code":
          latex += `\\begin{lstlisting}[language=${block.content.lang}]\n${block.content.code}\n\\end{lstlisting}\n\n`;
          break;
      }
    });

    return latex;
  };

  useEffect(() => {
    if (onContentChange) {
      onContentChange(generateLatex(blocks, title, author, phase));
    }
    if (onBlocksChange) onBlocksChange(blocks);
    if (onTitleChange) onTitleChange(title);
    if (onAuthorChange) onAuthorChange(author);
    if (onPhaseChange) onPhaseChange(phase);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, title, author, phase]);

  const handleSave = async () => {
    setIsSaving(true);
    const latex = generateLatex(blocks, title, author, phase);
    
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
     const latex = generateLatex(blocks, title, author, phase);
     const blob = new Blob([latex], { type: "text/plain;charset=utf-8" });
     saveAs(blob, filename);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950 overflow-y-auto">
      {/* Header / Actions */}
      <div className="flex justify-between items-center p-6 border-b dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur sticky top-0 z-40">
        <div className="flex flex-col">
          <h1 className="text-xl font-black uppercase tracking-tighter dark:text-white">Visual Editor</h1>
          <span className="text-[10px] font-mono text-gray-400 truncate max-w-[300px]">{filename}</span>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={handleDownload}
            className="p-2.5 text-gray-400 hover:text-black dark:hover:text-white transition-all bg-gray-50 dark:bg-zinc-800 rounded-xl"
            title="Download .tex"
          >
            <Download size={20} />
          </button>
          
          <button
            onClick={() => onDeleted(filename)}
            className="p-2.5 text-gray-400 hover:text-red-500 transition-all bg-gray-50 dark:bg-zinc-800 rounded-xl"
            title="Delete Entry"
          >
            <Trash2 size={20} />
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest shadow-xl shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50"
          >
            <Save size={18} />
            {isSaving ? "Saving..." : "Commit"}
          </button>
        </div>
      </div>

      <div className="max-w-4xl w-full mx-auto p-10 pb-32">
        {metadataMissing && (
           <div className="mb-10 bg-amber-50 dark:bg-amber-900/10 border-2 border-amber-200 dark:border-amber-800/50 p-6 rounded-2xl flex items-start gap-4">
              <AlertCircle className="text-amber-500 shrink-0 mt-1" size={24} />
              <div className="space-y-1">
                  <p className="text-sm font-black uppercase tracking-widest text-amber-800 dark:text-amber-400">Legacy File Detected</p>
                  <p className="text-sm text-amber-700/80 dark:text-amber-500/80 leading-relaxed">This file was created outside the block editor. Existing content is visible in the <strong>Source LaTeX</strong> panel on the right. Adding blocks here will initialize a new structured version.</p>
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
                    <option value="Define Problem" className="dark:bg-zinc-900 dark:text-white">Define Problem</option>
                    <option value="Generate Concepts" className="dark:bg-zinc-900 dark:text-white">Generate Concepts</option>
                    <option value="Develop Solution" className="dark:bg-zinc-900 dark:text-white">Develop Solution</option>
                    <option value="Construct and Test" className="dark:bg-zinc-900 dark:text-white">Construct and Test</option>
                    <option value="Evaluate Solution" className="dark:bg-zinc-900 dark:text-white">Evaluate Solution</option>
                 </select>
              </div>
           </div>

           <div className="pt-4">
              <BlockEditor 
                blocks={blocks} 
                onChange={setBlocks} 
                onImageUpload={onImageUpload}
              />
           </div>
        </div>
      </div>
    </div>
  );
}
