import { useState, useEffect } from "react";
import { GitHubConfig, saveFile, deleteFile } from "@/lib/github";
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Image } from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import EditorTextarea from 'react-simple-code-editor';
import Prism from 'prismjs';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore Types missing for prism components
import 'prismjs/components/prism-latex';

const lowlight = createLowlight(common);

interface EditorProps {
  config: GitHubConfig | null;
  isLocalMode: boolean;
  initialContent?: string;
  initialTitle?: string;
  initialAuthor?: string;
  initialPhase?: string;
  filename?: string;
  onSaved: (filename: string, content: string) => void;
  onDeleted?: (filename: string) => void;
  onContentChange: (content: string) => void;
  onImageUpload?: (path: string, base64: string) => void;
}

export default function Editor({
  config,
  isLocalMode,
  initialContent = "",
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
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [currentFilename, setCurrentFilename] = useState(filename);
  const [isRawMode, setIsRawMode] = useState(!!filename);

  const generateLatex = (t: string, a: string, p: string, c: string, tiptapState?: string) => {
    const dateStr = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    let latex = `\\newentry{${t}}{${dateStr}}{${a}}{${p}}

${c}
`;
    if (tiptapState) {
       latex += `\n% TIPTAP_STATE: ${tiptapState}\n`;
    }
    return latex;
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    onContentChange(generateLatex(e.target.value, author, phase, content, getTiptapState()));
  };

  const handleAuthorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAuthor(e.target.value);
    onContentChange(generateLatex(title, e.target.value, phase, content, getTiptapState()));
  };

  const handlePhaseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPhase(e.target.value);
    onContentChange(generateLatex(title, author, e.target.value, content, getTiptapState()));
  };

  const latexToHtml = (latex: string) => {
    // Basic conversion to show in WYSIWYG
    let html = latex
      .replace(/\\textbf{(.*?)}/g, "<strong>$1</strong>")
      .replace(/\\image{(.*?)}{(.*?)}{(.*?)}/g, '<img src="$1" alt="$2" title="$3" />')
      .replace(/\\begin\{lstlisting\}(\[.*?\])?([\s\S]*?)\\end\{lstlisting\}/g, "<pre><code>$2</code></pre>")
      // Crude table parsing (just strips tags for now to prevent breaking, real parser would be complex)
      .replace(/\\customtable\{[^}]*\}\{([\s\S]*?)\}\{([\s\S]*?)\}/g, "<div>[Table: $2]</div>\n<pre>$1</pre>");

    // Split by lines and wrap in paragraphs
    html = html.split('\n\n').map(p => `<p>${p}</p>`).join('');
    return html;
  };

  const htmlToLatex = (html: string) => {
    // Basic conversion from WYSIWYG HTML to LaTeX
    // This is a naive implementation, a robust one would traverse the DOM
    const latex = html
      .replace(/<strong>(.*?)<\/strong>/g, "\\textbf{$1}")
      .replace(/<b>(.*?)<\/b>/g, "\\textbf{$1}")
      .replace(/<em>(.*?)<\/em>/g, "\\textit{$1}")
      .replace(/<i>(.*?)<\/i>/g, "\\textit{$1}")
      .replace(/<img src="(.*?)" alt="(.*?)" title="(.*?)"[^>]*>/g, "\\image{$1}{$2}{$3}")
      .replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, "\\begin{lstlisting}[language=C++, caption={Code Snippet}]\n$1\n\\end{lstlisting}")
      .replace(/<p>(.*?)<\/p>/g, "$1\n\n")
      .replace(/<br\s*\/?>/g, "\n");

    return latex.trim();
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        }
      }),
      Image,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      CodeBlockLowlight.configure({
        lowlight,
      }),
    ],
    content: latexToHtml(initialContent),
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const latex = htmlToLatex(html);
      setContent(latex);
      onContentChange(generateLatex(title, author, phase, latex));
    },
  });

  // Re-sync editor if initialContent changes drastically (e.g., loaded new file)
  useEffect(() => {
    if (editor && initialContent !== content) {
      // Check if initialContent contains TipTap state json
      const stateMatch = initialContent.match(/% TIPTAP_STATE: (.*)/);
      let contentWithoutState = initialContent;
      let loadedState = false;

      if (stateMatch) {
         try {
            const stateObj = JSON.parse(stateMatch[1]);
            contentWithoutState = initialContent.replace(/\n% TIPTAP_STATE: .*/, '');
            if (!isRawMode) {
               editor.commands.setContent(stateObj);
            }
            loadedState = true;
         } catch (e) {
            console.error("Failed to parse tiptap state", e);
         }
      }

      if (!loadedState && !isRawMode) {
         editor.commands.setContent(latexToHtml(contentWithoutState));
      }

      // Using a timeout to defer state update to avoid cascading render lint error
      setTimeout(() => setContent(contentWithoutState), 0);

      // Update raw mode toggle default when a new file loads
      setTimeout(() => setIsRawMode(!!filename && !loadedState), 0); // Open in visual if state exists
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContent, editor, filename]);

  const getTiptapState = () => {
    if (editor && !isRawMode) {
       return JSON.stringify(editor.getJSON());
    }
    return undefined;
  };

  const updateContentAndNotify = (newContent: string) => {
    setContent(newContent);
    onContentChange(generateLatex(title, author, phase, newContent, getTiptapState()));
    if (editor) {
      editor.commands.setContent(latexToHtml(newContent));
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text");
    if (text.includes("\t") && text.includes("\n")) {
      e.preventDefault();
      const rows = text.split("\n").filter((r) => r.trim());
      const cells = rows.map((r) => r.split("\t"));
      if (cells.length > 0) {
        const cols = cells[0].length;
        const latexTable = `\\customtable{${"|c".repeat(cols)}|}{
${cells.map((c) => "  " + c.join(" & ")).join(" \\\\ \\hline \n")}
}{Table Caption}`;

        const target = e.target as HTMLTextAreaElement;
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const newContent =
          content.substring(0, start) +
          latexTable +
          content.substring(end, content.length);

        updateContentAndNotify(newContent);

        setTimeout(() => {
          target.selectionStart = target.selectionEnd = start + latexTable.length;
        }, 0);
      }
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      if (!ev.target?.result) return;
      const base64String = (ev.target.result as string).split(",")[1];
      const imgFilename = file.name.replace(/\\s+/g, "-");

      if (!isLocalMode && config) {
        try {
          await saveFile(
            config,
            `${config.resourcesDir}/${imgFilename}`,
            atob(base64String), // We decode base64 because our saveFile function re-encodes it
            `Upload image ${imgFilename}`
          );

          const latexImage = `\\image{${imgFilename}}{Image Caption}{${author || "Initials"}}`;
          updateContentAndNotify(content + "\n" + latexImage + "\n");
          alert("Image uploaded successfully!");
        } catch (error) {
          console.error("Failed to upload image", error);
          alert("Failed to upload image");
        }
      } else {
         // Local mode fallback - store base64 so it can be previewed
         if (onImageUpload) {
           onImageUpload(`notebook/resources/${imgFilename}`, base64String);
         }
         const latexImage = `\\image{${imgFilename}}{Image Caption}{${author || "Initials"}}`;
         updateContentAndNotify(content + "\n" + latexImage + "\n");
         alert(`Image stored in local memory for preview. Don't forget to manually place it in your resources folder later!`);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!title) {
      alert("Please provide a title");
      return;
    }

    setIsSaving(true);
    const dateStr = new Date().toISOString().split("T")[0];
    const fileToSave = currentFilename || `${dateStr}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.tex`;

    try {
      const latexString = generateLatex(title, author, phase, content);
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
     const latexString = generateLatex(title, author, phase, content);
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
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto dark:bg-zinc-950">
      <h2 className="text-xl font-bold dark:text-white">Editor</h2>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium dark:text-gray-200">Title</label>
        <input
          type="text"
          className="border dark:border-zinc-700 p-2 rounded dark:bg-zinc-900 dark:text-white"
          value={title}
          onChange={handleTitleChange}
        />
      </div>

      <div className="flex gap-4">
        <div className="flex flex-col gap-2 flex-1">
          <label className="text-sm font-medium dark:text-gray-200">Author</label>
          <input
            type="text"
            className="border dark:border-zinc-700 p-2 rounded dark:bg-zinc-900 dark:text-white"
            value={author}
            onChange={handleAuthorChange}
          />
        </div>
        <div className="flex flex-col gap-2 flex-1">
          <label className="text-sm font-medium dark:text-gray-200">Phase</label>
          <select
            className="border dark:border-zinc-700 p-2 rounded dark:bg-zinc-900 dark:text-white"
            value={phase}
            onChange={handlePhaseChange}
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

      <div className="flex flex-col gap-2 flex-1 min-h-[400px] border dark:border-zinc-700 rounded overflow-hidden flex flex-col">
        <div className="flex justify-between items-center bg-gray-50 dark:bg-zinc-800 border-b dark:border-zinc-700 p-2">
          <div className="flex items-center gap-4">
             <label className="text-sm font-medium dark:text-gray-200">Content</label>
             <div className="flex bg-gray-200 dark:bg-zinc-700 rounded text-xs p-1">
                <button
                  className={`px-2 py-1 rounded ${!isRawMode ? 'bg-white dark:bg-zinc-600 shadow' : 'hover:bg-gray-300 dark:hover:bg-zinc-500'}`}
                  onClick={() => setIsRawMode(false)}
                >
                  Visual
                </button>
                <button
                  className={`px-2 py-1 rounded ${isRawMode ? 'bg-white dark:bg-zinc-600 shadow' : 'hover:bg-gray-300 dark:hover:bg-zinc-500'}`}
                  onClick={() => setIsRawMode(true)}
                >
                  Raw LaTeX
                </button>
             </div>
          </div>
          {!isRawMode && (
            <div className="flex items-center gap-2">
              <select
                className="text-xs bg-gray-200 dark:bg-zinc-700 dark:text-gray-200 px-2 py-1 rounded outline-none border-r border-gray-300 pr-4"
                onChange={(e) => {
                  const level = parseInt(e.target.value);
                  type Level = 1 | 2 | 3;
                  if (level === 0) editor?.chain().focus().setParagraph().run();
                  else editor?.chain().focus().toggleHeading({ level: level as Level }).run();
                }}
                value={editor?.isActive('heading') ? editor.getAttributes('heading').level : 0}
              >
                <option value={0}>Normal Text</option>
                <option value={1}>Section</option>
                <option value={2}>Subsection</option>
                <option value={3}>Sub-subsection</option>
              </select>
              <button
                className={`text-xs px-2 py-1 rounded cursor-pointer ${editor?.isActive('bold') ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 dark:bg-zinc-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-zinc-600'}`}
                onClick={() => editor?.chain().focus().toggleBold().run()}
              >
                Bold
              </button>
              <button
                className={`text-xs px-2 py-1 rounded cursor-pointer ${editor?.isActive('italic') ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 dark:bg-zinc-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-zinc-600'}`}
                onClick={() => editor?.chain().focus().toggleItalic().run()}
              >
                Italic
              </button>
              <button
                className={`text-xs px-2 py-1 rounded cursor-pointer ${editor?.isActive('codeBlock') ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 dark:bg-zinc-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-zinc-600'}`}
                onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
              >
                Code
              </button>
              <label className="text-xs bg-gray-200 dark:bg-zinc-700 dark:text-gray-200 px-2 py-1 rounded cursor-pointer hover:bg-gray-300 dark:hover:bg-zinc-600">
                Upload Image
                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
              </label>
              <button
                className="text-xs bg-gray-200 dark:bg-zinc-700 dark:text-gray-200 px-2 py-1 rounded cursor-pointer hover:bg-gray-300 dark:hover:bg-zinc-600"
                onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
              >
                Table
              </button>
            </div>
          )}
        </div>
        {isRawMode ? (
          <div className="flex-1 overflow-y-auto bg-white dark:bg-zinc-900 p-4">
            <EditorTextarea
              value={content}
              onValueChange={(code) => updateContentAndNotify(code)}
              highlight={code => Prism.highlight(code, Prism.languages.latex, 'latex')}
              padding={10}
              className="font-mono text-sm dark:text-gray-200 outline-none w-full min-h-full"
              textareaClassName="outline-none"
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 prose dark:prose-invert max-w-none prose-sm outline-none cursor-text dark:bg-zinc-900 bg-white" onClick={() => editor?.commands.focus()}>
            <EditorContent editor={editor} />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700 transition disabled:opacity-50 flex-1"
        >
          {isSaving ? "Saving..." : isLocalMode ? "Save Locally" : "Save to GitHub"}
        </button>
        <button
          onClick={handleDownload}
          className="bg-gray-600 text-white p-2 rounded hover:bg-gray-700 transition"
        >
          Download .tex
        </button>
        {currentFilename && (
          <button
            onClick={handleDelete}
            disabled={isSaving}
            className="bg-red-600 text-white p-2 rounded hover:bg-red-700 transition disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
