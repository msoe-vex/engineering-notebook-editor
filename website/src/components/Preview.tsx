"use client";
import { useEffect, useRef } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-latex";

// Fix Prism LaTeX highlighting for escaped percents
if (Prism.languages.latex) {
  const { comment, ...rest } = Prism.languages.latex;
  Prism.languages.latex = { ...rest, comment };
  Prism.languages.tex = Prism.languages.latex;
  Prism.languages.context = Prism.languages.latex;
}


import { Copy, Check } from "lucide-react";
import { useState } from "react";

interface PreviewProps {
  latexContent: string;
}

export default function Preview({ latexContent }: PreviewProps) {
  const rawCodeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (rawCodeRef.current) {
      Prism.highlightElement(rawCodeRef.current);
    }
  }, [latexContent]);

  const handleCopy = () => {
    navigator.clipboard.writeText(latexContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-nb-bg transition-colors duration-300">
      <div className="flex items-center justify-between px-6 py-4 border-b border-nb-outline-variant bg-nb-surface shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-nb-on-surface-variant">Generated Latex</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-nb-surface-low border border-nb-outline-variant text-xs font-bold text-nb-on-surface-variant hover:bg-nb-surface-mid transition-all active:scale-[0.98]"
        >
          {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          {copied ? "Copied!" : "Copy Latex"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-8 relative">
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'linear-gradient(0deg, currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <pre className="whitespace-pre-wrap !bg-transparent !m-0 !p-0 text-[12px] leading-[1.8] font-mono text-nb-on-surface relative z-10">
          <code ref={rawCodeRef} className="language-latex !bg-transparent !p-0">
            {latexContent}
          </code>
        </pre>
      </div>
    </div>
  );
}
