import { useState, useEffect, useRef } from "react";
import { GitHubFile } from "@/lib/github";
import { Block } from "./App";
import "katex/dist/katex.min.css";
import Prism from "prismjs";
import "prismjs/components/prism-latex";
import "prismjs/themes/prism-tomorrow.css";

interface LocalFile extends Partial<GitHubFile> {
  name: string;
  content: string;
}

interface PreviewProps {
  blocks: Block[];
  latexContent: string;
  title?: string;
  author?: string;
  phase?: string;
  styContent?: string;
  files?: (GitHubFile | LocalFile)[];
}

export default function Preview({ blocks, latexContent, title = "", author = "", phase = "", styContent = "", files = [] }: PreviewProps) {
  const [viewMode, setViewMode] = useState<"live" | "raw">("live");
  const rawCodeRef = useRef<HTMLElement>(null);

  useEffect(() => {
     // Load LaTeXML CSS only if not already present
     const existingLink1 = document.querySelector('link[href*="LaTeXML.css"]');
     const existingLink2 = document.querySelector('link[href*="ltx-article.css"]');
     
     const link1 = document.createElement('link');
     if (!existingLink1) {
       link1.rel = 'stylesheet';
       link1.href = '/notebook/LaTeXML.css';
       document.head.appendChild(link1);
     }
     
     const link2 = document.createElement('link');
     if (!existingLink2) {
       link2.rel = 'stylesheet';
       link2.href = '/notebook/ltx-article.css';
       document.head.appendChild(link2);
     }

     return () => {
        if (!existingLink1 && link1.parentNode === document.head) document.head.removeChild(link1);
        if (!existingLink2 && link2.parentNode === document.head) document.head.removeChild(link2);
     };
  }, []);

  const getPhaseColor = (p: string) => {
    const colorMap: Record<string, string> = {
        "Define Problem": "#fecaca", // red-200
        "Generate Concepts": "#fed7aa", // orange-200
        "Develop Solution": "#fef08a", // yellow-200
        "Construct and Test": "#bbf7d0", // green-200
        "Evaluate Solution": "#bfdbfe"  // blue-200
    };
    return colorMap[p] || "#f4f4f5";
  };

  const renderBlocksToHtml = () => {
    const dateStr = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    const phaseColor = getPhaseColor(phase);

    let html = `
      <div class="ltx_page_content p-12 bg-white text-black min-h-full" style="font-family: 'Times New Roman', serif;">
        <div class="flex justify-between items-end border-b-2 border-black pb-2 mb-8 uppercase tracking-widest text-[9px] font-bold">
            <div class="flex flex-col">
                <span>VEX Engineering Notebook</span>
                <span>Team 1234A</span>
            </div>
            <div class="flex flex-col text-right">
                <span>Entry: ${title || "Draft"}</span>
                <span>Page: ${Math.floor(Math.random() * 100)}</span>
            </div>
        </div>

        <article class="ltx_document">
          <div class="ltx_section">
            <h1 class="ltx_title ltx_title_section text-4xl font-serif font-black mb-6 uppercase tracking-tight">${title || "Untitled Entry"}</h1>
            
            <div class="border-[3px] border-black mb-10 overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]" style="background-color: ${phaseColor};">
               <div class="grid grid-cols-2 divide-x-[3px] divide-black border-b-[3px] border-black">
                  <div class="p-3 flex flex-col">
                    <span class="text-[9px] font-black uppercase opacity-60 mb-1">Project / Component</span>
                    <span class="font-serif font-bold text-lg leading-tight">${title}</span>
                  </div>
                  <div class="p-3 flex flex-col">
                    <span class="text-[9px] font-black uppercase opacity-60 mb-1">Submission Date</span>
                    <span class="font-serif font-bold text-lg">${dateStr}</span>
                  </div>
               </div>
               <div class="grid grid-cols-2 divide-x-[3px] divide-black">
                  <div class="p-3 flex flex-col">
                    <span class="text-[9px] font-black uppercase opacity-60 mb-1">Lead Author / Engineer</span>
                    <span class="font-serif font-bold text-lg">${author}</span>
                  </div>
                  <div class="p-3 flex flex-col">
                    <span class="text-[9px] font-black uppercase opacity-60 mb-1">Design Process Phase</span>
                    <span class="font-serif font-bold text-lg">${phase}</span>
                  </div>
               </div>
            </div>

            <div class="ltx_para space-y-6">
    `;

    blocks.forEach(block => {
      switch (block.type) {
        case "text":
          let content = block.content;
          content = content.replace(/<h1>(.*?)<\/h1>/g, '<h2 class="ltx_title ltx_title_subsection text-2xl font-serif font-bold mt-10 mb-4 border-b border-gray-300 pb-2">$1</h2>');
          content = content.replace(/<h2>(.*?)<\/h2>/g, '<h3 class="ltx_title ltx_title_subsubsection text-xl font-serif font-bold mt-8 mb-3 italic">$1</h3>');
          content = content.replace(/<p>(.*?)<\/p>/g, '<p class="ltx_p text-lg leading-relaxed text-justify mb-4">$1</p>');
          content = content.replace(/<ul>/g, '<ul class="list-disc pl-8 my-4 space-y-2">');
          content = content.replace(/<ol>/g, '<ol class="list-decimal pl-8 my-4 space-y-2">');
          html += content;
          break;
        case "image":
          const imgBase64 = files.find(f => f.name === block.content.src) as LocalFile;
          const src = imgBase64?.content ? `data:image/png;base64,${imgBase64.content}` : `/notebook/resources/${block.content.src}`;
          html += `
            <figure class="ltx_figure border-[3px] border-black p-6 my-10 bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center">
              <img src="${src}" class="max-w-full h-auto ltx_graphics border border-gray-100" />
              <figcaption class="ltx_caption w-full mt-6 pt-4 border-t-2 border-black/10 font-serif italic text-sm flex justify-between items-center">
                <span><span class="ltx_tag font-black not-italic uppercase tracking-widest text-[10px] mr-2">Fig.</span>${block.content.caption}</span>
                <span class="text-[10px] bg-black text-white px-2 py-0.5 rounded uppercase font-black non-italic tracking-tighter">${block.content.initials || author}</span>
              </figcaption>
            </figure>
          `;
          break;
        case "table":
          let tableHtml = `
            <div class="ltx_table border-[3px] border-black my-12 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden bg-white">
              <table class="w-full border-collapse">
                <tbody class="divide-y-2 divide-black">
          `;
          block.content.rows.forEach((row: string[], idx: number) => {
            const isHeader = idx === 0;
            tableHtml += `<tr class="divide-x-2 divide-black ${isHeader ? 'bg-black text-white' : ''}">`;
            row.forEach(cell => {
              tableHtml += `<td class="p-3 text-sm font-serif ${isHeader ? 'font-bold uppercase tracking-widest' : 'text-gray-900'}">${cell}</td>`;
            });
            tableHtml += `</tr>`;
          });
          tableHtml += `
                </tbody>
              </table>
              <div class="bg-gray-100 border-t-2 border-black p-3 text-[10px] font-black uppercase italic ltx_caption text-center tracking-widest">
                Data Representation: ${block.content.caption || "Experimental Results"}
              </div>
            </div>
          `;
          html += tableHtml;
          break;
        case "code":
          html += `
            <div class="ltx_listing ltx_lstlisting border-l-[6px] border-black bg-gray-50 my-10 p-6 font-mono text-xs overflow-x-auto shadow-inner">
              <pre class="whitespace-pre"><code>${block.content.code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>
            </div>
          `;
          break;
      }
    });

    html += `
            </div>
            
            <div class="mt-20 pt-10 border-t-4 border-black border-double flex justify-between items-center opacity-40">
                <div class="flex flex-col gap-1">
                    <span class="text-[10px] font-black uppercase">Witness Sign-off</span>
                    <div class="w-48 border-b border-black h-8"></div>
                </div>
                <div class="text-[10px] font-black uppercase tracking-widest">
                    Build Journal - Team 1234A
                </div>
            </div>
          </div>
        </article>
      </div>
    `;

    return html;
  };

  useEffect(() => {
    if (viewMode === "raw" && rawCodeRef.current) {
       Prism.highlightElement(rawCodeRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, latexContent]);

  return (
    <div className="flex flex-col h-full border-l dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950">
      <div className="flex justify-between items-center p-4 border-b dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <h2 className="text-sm font-black uppercase tracking-widest dark:text-white flex items-center gap-2">
            Output Preview
        </h2>
        <div className="flex bg-gray-100 dark:bg-zinc-800 rounded-lg p-1 shadow-inner">
          <button
            className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-tighter rounded-md transition-all ${
              viewMode === "live" ? "bg-white dark:bg-zinc-700 shadow-md transform scale-105" : "hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-500"
            }`}
            onClick={() => setViewMode("live")}
          >
            Live Preview
          </button>
          <button
            className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-tighter rounded-md transition-all ${
              viewMode === "raw" ? "bg-white dark:bg-zinc-700 shadow-md transform scale-105" : "hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-500"
            }`}
            onClick={() => setViewMode("raw")}
          >
            Raw LaTeX
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex justify-center bg-zinc-200 dark:bg-zinc-950">
        {viewMode === "raw" ? (
          <div className="w-full max-w-4xl h-fit bg-[#1d1d1d] border-4 border-black rounded-none shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] font-mono text-[13px] leading-relaxed relative flex flex-col">
             <div className="bg-black/40 px-4 py-2 flex justify-between items-center border-b border-white/5">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Source_LaTeX</span>
                <div className="flex gap-1.5">
                   <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/40"></div>
                   <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20 border border-amber-500/40"></div>
                   <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/40"></div>
                </div>
             </div>
             <div className="p-8 overflow-x-auto">
                <pre className="whitespace-pre-wrap !bg-transparent !m-0 !p-0"><code ref={rawCodeRef} className="language-latex !bg-transparent !p-0">{latexContent}</code></pre>
             </div>
          </div>
        ) : (
          <div className="w-full flex justify-center py-4">
             <div 
               className="bg-white shadow-[20px_20px_0px_0px_rgba(0,0,0,0.1)] border border-gray-300" 
               style={{ width: "816px", minHeight: "1056px" }}
               dangerouslySetInnerHTML={{ __html: renderBlocksToHtml() }}
             />
          </div>
        )}
      </div>
    </div>
  );
}
