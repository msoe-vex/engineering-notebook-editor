"use client";
import { useEffect, useRef } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-latex";
import "prismjs/themes/prism-tomorrow.css";

interface PreviewProps {
  latexContent: string;
}

export default function Preview({ latexContent }: PreviewProps) {
  const rawCodeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (rawCodeRef.current) {
      Prism.highlightElement(rawCodeRef.current);
    }
  }, [latexContent]);

  return (
    <div className="flex flex-col h-full border-l dark:border-zinc-800 bg-zinc-950">
      <div className="flex items-center px-4 py-3 border-b border-white/5 bg-black/40">
        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Source LaTeX</span>
        <div className="flex gap-1.5 ml-auto">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/40"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20 border border-amber-500/40"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/40"></div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <pre className="whitespace-pre-wrap !bg-transparent !m-0 !p-0 text-[13px] leading-relaxed font-mono">
          <code ref={rawCodeRef} className="language-latex !bg-transparent !p-0">
            {latexContent}
          </code>
        </pre>
      </div>
    </div>
  );
}
