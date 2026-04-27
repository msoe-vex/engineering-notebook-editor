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
     const cssFiles = ['LaTeXML.css', 'ltx-article.css', 'ltx-listings.css'];
     const links: HTMLLinkElement[] = [];

     cssFiles.forEach(file => {
        if (!document.querySelector(`link[href*="${file}"]`)) {
           const link = document.createElement('link');
           link.rel = 'stylesheet';
           link.href = `/notebook/${file}`;
           document.head.appendChild(link);
           links.push(link);
        }
     });

     return () => {
        links.forEach(link => {
           if (link.parentNode === document.head) document.head.removeChild(link);
        });
     };
  }, []);

  const getPhaseColor = (p: string) => {
    const colorMap: Record<string, string> = {
        "Define Problem": "#fecaca",
        "Generate Concepts": "#fed7aa",
        "Develop Solution": "#fef08a",
        "Construct and Test": "#bbf7d0",
        "Evaluate Solution": "#bfdbfe"
    };
    return colorMap[p] || "#f4f4f5";
  };

  const renderBlocksToHtml = () => {
    const dateStr = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    const phaseColor = getPhaseColor(phase);

    let html = `
      <div class="ltx_page_main ltx_role_article" style="background: #e2e8f0; padding: 2rem; min-height: 100%;">
        <div class="ltx_page_content ltx_centering bg-white shadow-2xl mx-auto" style="width: 816px; min-height: 1056px; padding: 4rem;">
            <article class="ltx_document">
                <section class="ltx_section">
                    <h2 class="ltx_title ltx_title_section" style="border-bottom: 2px solid black; padding-bottom: 0.5rem; margin-bottom: 2rem;">VEX Engineering Notebook Entry</h2>

                    <div class="ltx_para" style="margin-bottom: 3rem; background: ${phaseColor}; border: 3px solid black; padding: 1.5rem; box-shadow: 8px 8px 0px 0px rgba(0,0,0,1);">
                        <p class="ltx_p">
                           <span class="ltx_text ltx_font_bold">Title:</span> ${title || "Untitled Entry"}<br/>
                           <span class="ltx_text ltx_font_bold">Date:</span> ${dateStr}<br/>
                           <span class="ltx_text ltx_font_bold">Author:</span> ${author}<br/>
                           <span class="ltx_text ltx_font_bold">Phase:</span> ${phase}
                        </p>
                    </div>

                    <div class="ltx_para">
    `;

    blocks.forEach(block => {
      switch (block.type) {
        case "text":
          let content = block.content;
          content = content.replace(/<h1>(.*?)<\/h1>/g, '<section class="ltx_subsection"><h3 class="ltx_title ltx_title_subsection">$1</h3>');
          content = content.replace(/<h2>(.*?)<\/h2>/g, '<section class="ltx_subsubsection"><h4 class="ltx_title ltx_title_subsubsection">$1</h4>');
          content = content.replace(/<p>(.*?)<\/p>/g, '<p class="ltx_p">$1</p>');
          content = content.replace(/<ul>/g, '<ul class="ltx_list">');
          content = content.replace(/<li>/g, '<li class="ltx_item">');
          html += content;
          break;
        case "image":
          const imgBase64 = files.find(f => f.name === block.content.src) as LocalFile;
          const src = imgBase64?.content ? `data:image/png;base64,${imgBase64.content}` : `/notebook/resources/${block.content.src}`;
          html += `
            <figure class="ltx_figure ltx_centering" style="margin: 3rem 0; border: 3px solid black; padding: 1.5rem; background: white; box-shadow: 8px 8px 0px 0px rgba(0,0,0,1);">
              <img src="${src}" class="ltx_graphics" style="max-width: 100%; height: auto; border: 1px solid #eee;" />
              <figcaption class="ltx_caption ltx_centering" style="margin-top: 1rem; font-style: italic; border-top: 1px solid #ddd; padding-top: 1rem;">
                <span class="ltx_tag ltx_tag_figure">Figure: </span>${block.content.caption}
                <span style="float: right; font-style: normal; font-size: 10px; font-weight: 900; text-transform: uppercase; color: #aaa;">${block.content.initials || author}</span>
              </figcaption>
            </figure>
          `;
          break;
        case "table":
          let tableHtml = `
            <figure class="ltx_table ltx_centering" style="margin: 4rem 0; border: 3px solid black; background: white; box-shadow: 8px 8px 0px 0px rgba(0,0,0,1); overflow: hidden;">
              <table class="ltx_tabular ltx_centering ltx_align_middle" style="width: 100%; border-collapse: collapse;">
                <tbody class="ltx_tbody">
          `;
          block.content.rows.forEach((row: string[], idx: number) => {
            const isHeader = idx === 0;
            tableHtml += `<tr class="ltx_tr" style="${isHeader ? 'background: black; color: white;' : 'border-top: 2px solid black;'}">`;
            row.forEach(cell => {
              tableHtml += `<td class="ltx_td" style="padding: 1rem; border-left: 2px solid black; ${isHeader ? 'font-weight: bold; text-transform: uppercase;' : ''}">${cell}</td>`;
            });
            tableHtml += `</tr>`;
          });
          tableHtml += `
                </tbody>
              </table>
              <figcaption class="ltx_caption ltx_centering" style="background: #f8f8f8; padding: 0.5rem; border-top: 2px solid black; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em;">
                <span class="ltx_tag ltx_tag_table">Table: </span>${block.content.caption || "Design Data"}
              </figcaption>
            </figure>
          `;
          html += tableHtml;
          break;
        case "code":
          html += `
            <div class="ltx_listing ltx_lstlisting" style="margin: 3rem 0; padding: 1.5rem; background: #fafafa; border-left: 6px solid black; font-family: monospace; font-size: 12px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);">
              <code>${block.content.code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code>
            </div>
          `;
          break;
      }
    });

    html += `
                    </div>
                </section>
            </article>
        </div>
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

      <div className="flex-1 overflow-y-auto flex flex-col items-center bg-zinc-200 dark:bg-zinc-950 p-8">
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
          <div 
             className="w-full flex-1 light" 
             style={{ color: "black", backgroundColor: "white" }} 
             dangerouslySetInnerHTML={{ __html: renderBlocksToHtml() }}
          />
        )}
      </div>
    </div>
  );
}
