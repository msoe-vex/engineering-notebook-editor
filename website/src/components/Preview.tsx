"use client";
import { useEffect, useRef, useState } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-latex";
import { Copy, Check, FileText, Code } from "lucide-react";

// Fix Prism LaTeX highlighting for escaped percents
if (Prism.languages.latex) {
  const { comment, ...rest } = Prism.languages.latex;
  Prism.languages.latex = { ...rest, comment };
  Prism.languages.tex = Prism.languages.latex;
  Prism.languages.context = Prism.languages.latex;
}

interface PreviewProps {
  latexContent: string;
  pdfUrl?: string;
}

export default function Preview({ latexContent, pdfUrl }: PreviewProps) {
  const rawCodeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (rawCodeRef.current && !pdfUrl) {
      Prism.highlightElement(rawCodeRef.current);
    }
  }, [latexContent, pdfUrl]);

  return (
    <div className="flex flex-col h-full bg-nb-bg transition-colors duration-300 overflow-hidden relative group">
      <div className="flex-1 overflow-hidden relative">
        {pdfUrl ? (
          <iframe
            src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`}
            className="w-full h-full border-none bg-nb-surface-low"
            title="PDF Preview"
          />
        ) : (
          <div className="h-full overflow-y-auto p-8 custom-scrollbar relative">
            <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'linear-gradient(0deg, currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
            
            <pre className="whitespace-pre-wrap !bg-transparent !m-0 !p-0 text-[12px] leading-[1.8] font-mono text-nb-on-surface relative z-10">
              <code ref={rawCodeRef} className="language-latex !bg-transparent !p-0">
                {latexContent}
              </code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
