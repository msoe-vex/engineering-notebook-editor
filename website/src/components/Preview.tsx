import { useState, useEffect, useRef } from "react";
import { GitHubFile } from "@/lib/github";
import "katex/dist/katex.min.css";
// import Latex from "react-latex-next"; // Replacing react-latex-next with latex.js

interface LocalFile extends Partial<GitHubFile> {
  name: string;
  content: string;
}

interface PreviewProps {
  latexContent: string;
  styContent?: string;
  files?: (GitHubFile | LocalFile)[];
}

export default function Preview({ latexContent, styContent = "", files = [] }: PreviewProps) {
  const [viewMode, setViewMode] = useState<"latex" | "rendered" | "compiled">("rendered");
  const containerRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (viewMode === "latex" && codeRef.current) {
       import('prismjs').then((Prism) => {
         // eslint-disable-next-line @typescript-eslint/ban-ts-comment
         // @ts-ignore Types missing for prism components
         import('prismjs/components/prism-latex').then(() => {
           if (codeRef.current) Prism.highlightElement(codeRef.current);
         });
       });
    } else if (viewMode === "rendered" && containerRef.current) {
      // Extract colors from sty file
      const colorMap: Record<string, string> = {
         "PhaseDefine": "#FFB3B3",
         "PhaseGenerate": "#FFD9B3",
         "PhaseDevelop": "#FFFFB3",
         "PhaseConstruct": "#B3FFB3",
         "PhaseEvaluate": "#B3D9FF",
         "PhaseDefault": "#E0E0E0"
      };

      const colorRegex = /\\definecolor{(.*?)}{HTML}{(.*?)}/g;
      let match;
      while ((match = colorRegex.exec(styContent)) !== null) {
          colorMap[match[1]] = `#${match[2]}`;
      }

      const getPhaseColor = (phaseName: string) => {
         if (phaseName === "Define Problem") return colorMap["PhaseDefine"];
         if (phaseName === "Generate Concepts") return colorMap["PhaseGenerate"];
         if (phaseName === "Develop Solution") return colorMap["PhaseDevelop"];
         if (phaseName === "Construct and Test") return colorMap["PhaseConstruct"];
         if (phaseName === "Evaluate Solution") return colorMap["PhaseEvaluate"];
         return colorMap["PhaseDefault"];
      };

      const renderAccurateHtml = () => {
         // Strip unescaped LaTeX comments
         const contentWithoutComments = latexContent.replace(/(?<!\\)%.*/g, "");

         let html = contentWithoutComments
           // Remove standard preamble for just the snippet
           .replace(/\\newentry{(.*?)}{(.*?)}{(.*?)}{(.*?)}/g, (m, title, date, author, phase) => {
               const color = getPhaseColor(phase);
               return `<div class="text-3xl font-bold mb-1 border-b pb-2 mb-4">${title}</div>
               <div class="border-2 border-black mb-6" style="background-color: ${color};">
                  <div class="flex justify-between p-2">
                     <div><strong>Project Title:</strong> ${title}</div>
                     <div><strong>Date:</strong> ${date}</div>
                  </div>
                  <div class="flex justify-between p-2 border-t border-gray-300">
                     <div><strong>Author:</strong> ${author}</div>
                     <div><strong>Phase:</strong> ${phase}</div>
                  </div>
               </div>`;
           })
           // Fallbacks
           .replace(/\\chapter{(.*?)}/g, `<div class="bg-gray-200 text-2xl font-bold p-4 mb-4 border-b-2 border-black">$1</div>`)
           .replace(/\\textbf{Author:}\s*(.*?)\s*\\\\/g, `<div class="font-bold mb-1">Author: $1</div>`)
           .replace(/\\textbf{Phase:}\s*(.*?)\s*\n/g, `<div class="font-bold mb-4">Phase: $1</div>`)

           .replace(/\\textbf{(.*?)}/g, `<strong>$1</strong>`)
           .replace(/\\textit{(.*?)}/g, `<em>$1</em>`)
           .replace(/\\\\/g, `<br/>`)
           .replace(/\\image{(.*?)}{(.*?)}{(.*?)}/g, (match, filename, caption, initials) => {
              // Try to find the image in local files first
              let src = `[Image missing in preview: ${filename}]`;
              let isMissing = true;

              const imgFile = files.find(f => f.name === filename) as LocalFile;
              if (imgFile && imgFile.content) {
                 src = `<img src="data:image/png;base64,${imgFile.content}" alt="${caption}" class="max-w-full h-auto mx-auto" />`;
                 isMissing = false;
              } else {
                 // Try looking up the raw URL for remote files (not implemented here yet)
                 // This would require grabbing download_url from the tree
                 const remoteFile = files.find(f => f.name === filename);
                 if (remoteFile && remoteFile.download_url) {
                    src = `<img src="${remoteFile.download_url}" alt="${caption}" class="max-w-full h-auto mx-auto" />`;
                    isMissing = false;
                 }
              }

              if (isMissing) {
                return `<figure class="my-4 border p-2 bg-white shadow-sm text-center"><div class="bg-gray-100 p-8 text-gray-500 italic mb-2">${src}</div><figcaption class="text-sm font-medium">${caption} (Initials: ${initials})</figcaption></figure>`;
              }
              return `<figure class="my-4 border p-2 bg-white shadow-sm text-center">${src}<figcaption class="text-sm font-medium mt-2">${caption} (Initials: ${initials})</figcaption></figure>`;
           })
           .replace(/\\customtable\{[^}]*\}\{([\s\S]*?)\}\{([\s\S]*?)\}/g, (match, content, caption) => {
              const rows = content.trim().split(/\\\\|\n/).filter((r: string) => r.trim() && !r.includes('\\hline'));
              let tableHtml = `<table class="min-w-full divide-y divide-gray-200 border my-4"><caption class="caption-bottom mt-2 text-sm text-gray-600">${caption}</caption><tbody class="divide-y divide-gray-200 bg-white">`;
              rows.forEach((row: string) => {
                 tableHtml += `<tr>`;
                 row.split('&').forEach((cell: string) => {
                    tableHtml += `<td class="whitespace-nowrap px-4 py-2 text-sm text-gray-900 border-x">${cell.trim()}</td>`;
                 });
                 tableHtml += `</tr>`;
              });
              tableHtml += `</tbody></table>`;
              return tableHtml;
           })
           .replace(/\\begin\{lstlisting\}(\[.*?\])?([\s\S]*?)\\end\{lstlisting\}/g, (match, opts, code) => {
              // Extract language if possible
              const langMatch = opts?.match(/language=(.*?)[,\]]/);
              const langClass = langMatch ? `language-${langMatch[1].toLowerCase()}` : '';
              return `<pre class="bg-gray-100 border border-gray-300 p-4 rounded overflow-x-auto my-4 font-mono text-sm text-gray-800"><code class="hljs ${langClass}">${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`;
           });

           // Wrap paragraphs
           html = html.split('\n\n').map((p) => {
              if (p.trim().startsWith('<div') || p.trim().startsWith('<figure') || p.trim().startsWith('<table') || p.trim().startsWith('<pre')) {
                 return p;
              }
              return p.trim() ? `<p class="mb-4 text-justify">${p}</p>` : '';
           }).join('');

         containerRef.current!.innerHTML = `<div class="bg-white text-black p-8 shadow-lg max-w-3xl mx-auto border relative" style="min-height: 1056px; width: 816px; font-family: 'Times New Roman', serif;">
            <!-- Header imitation -->
            <div class="absolute top-0 left-0 right-0 p-4 text-xs text-gray-500 flex justify-between border-b border-gray-300">
                <span>1234A - Team Awesome</span>
                <span>Page 1</span>
            </div>
            <div class="mt-8">
              ${html}
            </div>
         </div>`;
      };

      renderAccurateHtml();
    }
  }, [latexContent, viewMode, styContent, files]);

  return (
    <div className="flex flex-col gap-4 p-4 h-full border-l">
      <div className="flex justify-between items-center border-b pb-4">
        <h2 className="text-xl font-bold dark:text-white">Preview</h2>
        <div className="flex bg-gray-200 dark:bg-zinc-800 rounded p-1">
          <button
            className={`px-3 py-1 text-sm rounded ${
              viewMode === "latex" ? "bg-white dark:bg-zinc-600 shadow" : "hover:bg-gray-300 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300"
            }`}
            onClick={() => setViewMode("latex")}
          >
            LaTeX Code
          </button>
          <button
            className={`px-3 py-1 text-sm rounded ${
              viewMode === "rendered" ? "bg-white dark:bg-zinc-600 shadow" : "hover:bg-gray-300 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300"
            }`}
            onClick={() => setViewMode("rendered")}
          >
            Live HTML Preview
          </button>
          <button
            className={`px-3 py-1 text-sm rounded ${
              viewMode === "compiled" ? "bg-white dark:bg-zinc-600 shadow" : "hover:bg-gray-300 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300"
            }`}
            onClick={() => setViewMode("compiled")}
          >
            Compiled PDF (Statically Generated)
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto border p-4 bg-gray-100 dark:bg-zinc-950 rounded flex justify-center h-full">
        {viewMode === "latex" ? (
          <pre className="font-mono text-sm whitespace-pre-wrap dark:text-gray-200 max-w-full">
             <code ref={codeRef} className="language-latex">{latexContent}</code>
          </pre>
        ) : viewMode === "rendered" ? (
          <div ref={containerRef} className="w-full overflow-x-auto flex justify-center"></div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
             <span className="text-4xl mb-4">📄</span>
             <p>This view displays the <code>index.html</code> file generated by LaTeXML.</p>
             <p className="text-xs mt-2 max-w-md text-center">To see this locally, make sure you run the <code>build.bat</code> or <code>build.sh</code> script in the <code>/notebook</code> folder, and then host it via a static file server or link directly to the GitHub Pages URL here.</p>
             {/* In a real deployment, this would be an iframe pointing to the hosted LaTeXML output */}
             <iframe src="/notebook/index.html" className="mt-4 w-full flex-1 border rounded shadow-inner" title="LaTeXML Compiled Preview"></iframe>
          </div>
        )}
      </div>
    </div>
  );
}
