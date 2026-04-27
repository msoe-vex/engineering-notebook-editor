import { useState, useEffect, useRef } from "react";
import { GitHubFile } from "@/lib/github";
import { Block } from "./App";
import "katex/dist/katex.min.css";

interface LocalFile extends Partial<GitHubFile> {
  name: string;
  content: string;
}

interface PreviewProps {
  blocks: Block[];
  title?: string;
  author?: string;
  phase?: string;
  styContent?: string;
  files?: (GitHubFile | LocalFile)[];
}

export default function Preview({ blocks, title = "", author = "", phase = "", styContent = "", files = [] }: PreviewProps) {
  const [viewMode, setViewMode] = useState<"latex" | "rendered">("rendered");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
     // Load LaTeXML CSS
     const link = document.createElement('link');
     link.rel = 'stylesheet';
     link.href = '/notebook/LaTeXML.css';
     document.head.appendChild(link);
     
     const link2 = document.createElement('link');
     link2.rel = 'stylesheet';
     link2.href = '/notebook/ltx-article.css';
     document.head.appendChild(link2);

     return () => {
        document.head.removeChild(link);
        document.head.removeChild(link2);
     };
  }, []);

  const getPhaseColor = (p: string) => {
    const colorMap: Record<string, string> = {
        "Define Problem": "#FFB3B3",
        "Generate Concepts": "#FFD9B3",
        "Develop Solution": "#FFFFB3",
        "Construct and Test": "#B3FFB3",
        "Evaluate Solution": "#B3D9FF"
    };
    return colorMap[p] || "#E0E0E0";
  };

  const renderBlocksToHtml = () => {
    const dateStr = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    const phaseColor = getPhaseColor(phase);

    let html = `
      <div class="ltx_page_main">
        <div class="ltx_header">
            <div class="flex justify-between text-[10px] text-gray-400 border-b pb-1 mb-4 uppercase tracking-tighter">
                <span>VEX Engineering Notebook</span>
                <span>Team 1234A</span>
            </div>
        </div>

        <article class="ltx_document">
          <div class="ltx_section">
            <h1 class="ltx_title ltx_title_section text-3xl font-bold mb-4 border-b-2 border-black pb-2">${title || "Untitled Entry"}</h1>
            
            <div class="border-2 border-black mb-8 overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" style="background-color: ${phaseColor};">
               <div class="grid grid-cols-2 divide-x-2 divide-black border-b-2 border-black">
                  <div class="p-2 flex flex-col">
                    <span class="text-[8px] font-bold uppercase opacity-50">Project Title</span>
                    <span class="font-bold">${title}</span>
                  </div>
                  <div class="p-2 flex flex-col">
                    <span class="text-[8px] font-bold uppercase opacity-50">Date</span>
                    <span class="font-bold">${dateStr}</span>
                  </div>
               </div>
               <div class="grid grid-cols-2 divide-x-2 divide-black">
                  <div class="p-2 flex flex-col">
                    <span class="text-[8px] font-bold uppercase opacity-50">Author</span>
                    <span class="font-bold">${author}</span>
                  </div>
                  <div class="p-2 flex flex-col">
                    <span class="text-[8px] font-bold uppercase opacity-50">Phase</span>
                    <span class="font-bold">${phase}</span>
                  </div>
               </div>
            </div>

            <div class="ltx_para">
    `;

    blocks.forEach(block => {
      switch (block.type) {
        case "text":
          // Check for Section/Subsection markers
          let content = block.content;
          content = content.replace(/<h1>(.*?)<\/h1>/g, '<h2 class="ltx_title ltx_title_subsection text-xl font-bold mt-6 mb-2">$1</h2>');
          content = content.replace(/<h2>(.*?)<\/h2>/g, '<h3 class="ltx_title ltx_title_subsubsection text-lg font-bold mt-4 mb-2">$1</h3>');
          content = content.replace(/<p>(.*?)<\/p>/g, '<p class="ltx_p mb-4 text-justify">$1</p>');
          html += content;
          break;
        case "image":
          const imgBase64 = files.find(f => f.name === block.content.src) as LocalFile;
          const src = imgBase64 ? `data:image/png;base64,${imgBase64.content}` : `/notebook/resources/${block.content.src}`;
          html += `
            <figure class="ltx_figure border-2 border-black p-4 my-6 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center">
              <img src="${src}" class="max-w-full h-auto ltx_graphics" />
              <figcaption class="ltx_caption mt-4 font-bold italic text-sm">
                <span class="ltx_tag">Figure: </span>${block.content.caption} 
                <span class="float-right text-[10px] uppercase opacity-40 non-italic ml-4">${block.content.initials || author}</span>
              </figcaption>
            </figure>
          `;
          break;
        case "table":
          let tableHtml = `
            <div class="ltx_table border-2 border-black my-8 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
              <table class="w-full divide-y-2 divide-black">
                <tbody class="divide-y divide-gray-200">
          `;
          block.content.rows.forEach((row: string[]) => {
            tableHtml += `<tr class="divide-x divide-gray-200">`;
            row.forEach(cell => {
              tableHtml += `<td class="p-2 text-sm">${cell}</td>`;
            });
            tableHtml += `</tr>`;
          });
          tableHtml += `
                </tbody>
              </table>
              <div class="bg-black text-white p-2 text-xs font-bold uppercase italic ltx_caption text-center">
                Table: ${block.content.caption || "Table Data"}
              </div>
            </div>
          `;
          html += tableHtml;
          break;
        case "code":
          html += `
            <div class="ltx_listing ltx_lstlisting border-l-4 border-blue-500 bg-gray-50 my-6 p-4 font-mono text-xs overflow-x-auto">
              <pre class="whitespace-pre"><code>${block.content.code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>
            </div>
          `;
          break;
      }
    });

    html += `
            </div>
          </div>
        </article>
      </div>
    `;

    return html;
  };

  useEffect(() => {
    if (viewMode === "rendered" && containerRef.current) {
       containerRef.current.innerHTML = renderBlocksToHtml();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, title, author, phase, viewMode]);

  return (
    <div className="flex flex-col gap-4 p-4 h-full border-l dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950">
      <div className="flex justify-between items-center border-b dark:border-zinc-800 pb-4">
        <h2 className="text-xl font-bold dark:text-white flex items-center gap-2">
            Preview
        </h2>
        <div className="flex bg-gray-200 dark:bg-zinc-800 rounded p-1">
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
              viewMode === "latex" ? "bg-white dark:bg-zinc-600 shadow" : "hover:bg-gray-300 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300"
            }`}
            onClick={() => setViewMode("latex")}
          >
            LaTeX Output
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto border dark:border-zinc-800 p-4 bg-gray-100 dark:bg-zinc-950 rounded flex justify-center h-full">
        {viewMode === "latex" ? (
          <div className="w-full bg-white dark:bg-zinc-900 border dark:border-zinc-800 p-8 rounded shadow-lg max-w-3xl mx-auto font-mono text-xs whitespace-pre-wrap dark:text-gray-300">
             {`\\newentry{${title}}{...}{${author}}{${phase}}\n\n` + blocks.map(b => b.type).join('\n')}
             <p className="mt-8 pt-8 border-t italic text-gray-400">Total LaTeX content is shown in the left editor panel under 'Raw LaTeX' mode.</p>
          </div>
        ) : (
          <div ref={containerRef} className="w-full flex justify-center bg-gray-100 dark:bg-zinc-950 overflow-x-auto py-8">
             <div className="bg-white text-black p-8 shadow-lg max-w-3xl mx-auto border relative" style={{ minHeight: "1056px", width: "816px", fontFamily: "'Times New Roman', serif" }}>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}

