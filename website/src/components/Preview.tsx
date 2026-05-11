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
  const [view, setView] = useState<'pdf' | 'source'>(pdfUrl ? 'pdf' : 'source');
  const rawCodeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (pdfUrl) setView('pdf');
  }, [pdfUrl]);

  useEffect(() => {
    if (rawCodeRef.current) {
      Prism.highlightElement(rawCodeRef.current);
    }
  }, [latexContent, view]);

  const handleCopy = () => {
    navigator.clipboard.writeText(latexContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-nb-bg transition-colors duration-300 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3 border-b border-nb-outline-variant bg-nb-surface shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex bg-nb-surface-low p-0.5 rounded-lg border border-nb-outline-variant mr-2">
            <button
              onClick={() => setView('pdf')}
              disabled={!pdfUrl}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${view === 'pdf' ? 'bg-nb-primary text-nb-on-primary shadow-sm' : 'text-nb-on-surface-variant hover:text-nb-on-surface cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed'}`}
            >
              <FileText size={14} />
              PDF Preview
            </button>
            <button
              onClick={() => setView('source')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${view === 'source' ? 'bg-nb-primary text-nb-on-primary shadow-sm' : 'text-nb-on-surface-variant hover:text-nb-on-surface cursor-pointer'}`}
            >
              <Code size={14} />
              Source
            </button>
          </div>
        </div>
        
        {view === 'source' && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-nb-surface-low border border-nb-outline-variant text-xs font-bold text-nb-on-surface-variant hover:bg-nb-surface-mid transition-all active:scale-[0.98] cursor-pointer"
          >
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            {copied ? "Copied!" : "Copy Latex"}
          </button>
        )}
      </div>
      <div className="flex-1 overflow-hidden relative">
        {view === 'pdf' && pdfUrl ? (
          <iframe
            src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`}
            className="w-full h-full border-none bg-nb-surface-low"
            title="PDF Preview"
          />
        ) : (
          <div className="h-full overflow-y-auto p-8 custom-scrollbar">
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
