import { useState, useEffect } from "react";
import { GitHubConfig, saveFile, deleteFile } from "@/lib/github";
import BlockEditor from "./BlockEditor";
import EditorTextarea from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-latex';
import { Block, FileMetadata } from "./App";
import { AlertCircle, Download, FileText, Trash2 } from "lucide-react";

interface EditorProps {
  config: GitHubConfig | null;
  isLocalMode: boolean;
  initialBlocks?: Block[];
  metadataMissing?: boolean;
  initialTitle?: string;
  initialAuthor?: string;
  initialPhase?: string;
  filename?: string;
  onSaved: (filename: string, content: string) => void;
  onDeleted?: (filename: string) => void;
  onContentChange: (latex: string) => void;
  onImageUpload?: (path: string, base64: string) => void;
}

export default function Editor({
  config,
  isLocalMode,
  initialBlocks = [],
  metadataMissing = false,
  initialTitle = "",
  initialAuthor = "",
  initialPhase = "",
  filename = "",
  onSaved,
  onDeleted,
  onContentChange,
  onImageUpload,
}: EditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [author, setAuthor] = useState(initialAuthor);
  const [phase, setPhase] = useState(initialPhase);
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [isSaving, setIsSaving] = useState(false);
  const [currentFilename, setCurrentFilename] = useState(filename);
  const [isRawMode, setIsRawMode] = useState(metadataMissing);

  useEffect(() => {
    setTitle(initialTitle);
    setAuthor(initialAuthor);
    setPhase(initialPhase);
    setBlocks(initialBlocks);
    setCurrentFilename(filename);
    setIsRawMode(metadataMissing);
  }, [initialTitle, initialAuthor, initialPhase, initialBlocks, metadataMissing, filename]);

  const blocksToLatex = (bbs: Block[]) => {
    return bbs.map(b => {
      switch (b.type) {
        case "text":
          // Clean HTML from TipTap back to LaTeX
          return b.content
            .replace(/<p>(.*?)<\/p>/g, "$1\n\n")
            .replace(/<strong>(.*?)<\/strong>/g, "\\textbf{$1}")
            .replace(/<em>(.*?)<\/em>/g, "\\textit{$1}")
            .replace(/<br\s*\/?>/g, "\n")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .trim();
        case "image":
          return `\\image{${b.content.src}}{${b.content.caption || "Image"}}{${b.content.initials || author || "Initials"}}`;
        case "table":
          const cols = "|c".repeat(b.content.cols) + "|";
          const tableRows = b.content.rows.map((r: string[]) => r.join(" & ")).join(" \\\\ \\hline \n");
          return `\\customtable{${cols}}{
  ${tableRows}
}{${b.content.caption || "Table Caption"}}`;
        case "code":
          return `\\begin{lstlisting}[language=${b.content.lang || "cpp"}]
${b.content.code}
\\end{lstlisting}`;
        default:
          return "";
      }
    }).join("\n\n");
  };

  const generateFullLatex = (t: string, a: string, p: string, bbs: Block[]) => {
    const dateStr = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    const contentLatex = blocksToLatex(bbs);
    const metadata: FileMetadata = { blocks: bbs };
    
    return `\\newentry{${t}}{${dateStr}}{${a}}{${p}}

${contentLatex}

% METADATA: ${JSON.stringify(metadata)}
`;
  };

  useEffect(() => {
    if (title || author || phase || blocks.length > 0) {
        onContentChange(generateFullLatex(title, author, phase, blocks));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, author, phase, blocks]);

  const handleSave = async () => {
    if (!title) {
      alert("Please provide a title");
      return;
    }

    setIsSaving(true);
    const dateStr = new Date().toISOString().split("T")[0];
    const fileToSave = currentFilename || `${dateStr}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.tex`;

    try {
      const latexString = generateFullLatex(title, author, phase, blocks);
      if (isLocalMode && config) {
         const savePath = currentFilename || `${config.entriesDir}/${fileToSave}`;
         setCurrentFilename(savePath);
         onSaved(savePath, latexString);
         alert("Saved locally.");
      } else if (isLocalMode || !config) {
         setCurrentFilename(fileToSave);
         onSaved(fileToSave, latexString);
         alert("Saved to local storage memory.");
      } else {
        await saveFile(
          config,
          `${config.entriesDir}/${fileToSave}`,
          latexString,
          `Update entry ${fileToSave}`
        );
        setCurrentFilename(fileToSave);
        onSaved(fileToSave, latexString);
        alert("Saved to GitHub successfully!");
      }
    } catch (error) {
      console.error("Save failed", error);
      alert("Failed to save entry");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
     const latexString = generateFullLatex(title, author, phase, blocks);
     const dateStr = new Date().toISOString().split("T")[0];
     const fileToSave = currentFilename || `${dateStr}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.tex`;

     const blob = new Blob([latexString], { type: 'text/plain' });
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = fileToSave;
     a.click();
     URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    if (!currentFilename) return;
    if (!confirm(`Are you sure you want to delete ${currentFilename}?`)) return;

    if (isLocalMode && config) {
      if (onDeleted) onDeleted(currentFilename);
      alert("Deleted locally.");
    } else if (isLocalMode || !config) {
      if (onDeleted) onDeleted(currentFilename);
      alert("Deleted from local storage memory.");
    } else {
      setIsSaving(true);
      try {
        await deleteFile(config, currentFilename, `Delete entry ${currentFilename}`);
        if (onDeleted) onDeleted(currentFilename);
        alert("Deleted from GitHub successfully!");
      } catch (error) {
        console.error("Delete failed", error);
        alert("Failed to delete entry");
      } finally {
        setIsSaving(false);
      }
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6 h-full overflow-y-auto dark:bg-zinc-950">
      <div className="flex justify-between items-center bg-white dark:bg-zinc-950 sticky top-0 z-10 pb-4 border-b dark:border-zinc-800">
        <h2 className="text-2xl font-black dark:text-white flex items-center gap-2">
            <FileText className="text-blue-500" />
            Editor
        </h2>
        <div className="flex bg-gray-100 dark:bg-zinc-900 rounded-lg p-1 text-xs">
            <button
                className={`px-4 py-1.5 rounded-md transition ${!isRawMode ? 'bg-white dark:bg-zinc-700 shadow-sm text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                onClick={() => setIsRawMode(false)}
            >
                Visual Blocks
            </button>
            <button
                className={`px-4 py-1.5 rounded-md transition ${isRawMode ? 'bg-white dark:bg-zinc-700 shadow-sm text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                onClick={() => setIsRawMode(true)}
            >
                Raw LaTeX (Read Only)
            </button>
        </div>
      </div>

      {metadataMissing && !isRawMode && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 p-4 rounded-lg flex items-start gap-3">
              <AlertCircle className="text-amber-500 shrink-0" />
              <div>
                  <p className="text-sm font-bold text-amber-800 dark:text-amber-400">Metadata Missing</p>
                  <p className="text-xs text-amber-700 dark:text-amber-500">This file doesn't have block-based metadata. Use the <strong>Raw LaTeX</strong> view to see existing content, or start adding blocks here to create new structure.</p>
              </div>
          </div>
      )}

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col gap-2">
                <label className="text-xs uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider">Entry Title</label>
                <input
                    type="text"
                    className="bg-transparent border-b-2 border-gray-200 dark:border-zinc-800 focus:border-blue-500 outline-none p-2 text-lg font-bold dark:text-white transition-colors"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Design of Claw Mechanism"
                />
            </div>
            <div className="flex flex-col gap-2">
                <label className="text-xs uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider">Author</label>
                <input
                    type="text"
                    className="bg-transparent border-b-2 border-gray-200 dark:border-zinc-800 focus:border-blue-500 outline-none p-2 dark:text-white transition-colors"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="Student Name"
                />
            </div>
            <div className="flex flex-col gap-2">
                <label className="text-xs uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider">Design Phase</label>
                <select
                    className="bg-transparent border-b-2 border-gray-200 dark:border-zinc-800 focus:border-blue-500 outline-none p-2 dark:text-white transition-colors appearance-none"
                    value={phase}
                    onChange={(e) => setPhase(e.target.value)}
                >
                    <option value="">Select Phase...</option>
                    <option value="Define Problem">Define Problem</option>
                    <option value="Generate Concepts">Generate Concepts</option>
                    <option value="Develop Solution">Develop Solution</option>
                    <option value="Construct and Test">Construct and Test</option>
                    <option value="Evaluate Solution">Evaluate Solution</option>
                </select>
            </div>
        </div>

        <div className="min-h-[500px]">
            {isRawMode ? (
                <div className="border dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 grayscale">
                    <div className="bg-gray-50 dark:bg-zinc-800 px-4 py-2 border-b dark:border-zinc-800 text-[10px] text-gray-400 flex justify-between">
                        <span>READ ONLY PREVIEW</span>
                        <span>{filename || 'New Entry'}</span>
                    </div>
                    <EditorTextarea
                        value={generateFullLatex(title, author, phase, blocks)}
                        onValueChange={() => {}}
                        highlight={code => Prism.highlight(code, Prism.languages.latex, 'latex')}
                        padding={20}
                        className="font-mono text-xs dark:text-gray-400 pointer-events-none opacity-60"
                        readOnly
                    />
                </div>
            ) : (
                <BlockEditor blocks={blocks} onChange={setBlocks} />
            )}
        </div>
      </div>

      <div className="flex gap-4 sticky bottom-0 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md py-4 border-t dark:border-zinc-800 mt-auto">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all disabled:opacity-50 flex-1"
        >
          {isSaving ? "Saving..." : isLocalMode ? "Commit Locally" : "Push to GitHub"}
        </button>
        <button
          onClick={handleDownload}
          className="bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-4 py-3 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all flex items-center gap-2"
        >
          <Download size={18} /> .tex
        </button>
        {currentFilename && (
          <button
            onClick={handleDelete}
            disabled={isSaving}
            className="text-red-500 bg-red-50 dark:bg-red-900/10 px-4 py-3 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/20 transition-all"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

