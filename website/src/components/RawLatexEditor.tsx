"use client";

import React, { useEffect, useRef } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-latex";


interface RawLatexEditorProps {
  filename: string;
  content: string;
  onChange: (content: string) => void;
  /** If true, show the permanent "no metadata" warning instead of the "manual switch" warning */
  isLegacyFallback?: boolean;
}

export default function RawLatexEditor({
  filename,
  content,
  onChange,
  isLegacyFallback = false,
}: RawLatexEditorProps) {
  const highlightRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync highlight overlay whenever content changes
  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.textContent = content;
      Prism.highlightElement(highlightRef.current);
    }
  }, [content]);

  // Sync scroll position between textarea and highlight overlay
  const syncScroll = () => {
    if (textareaRef.current && highlightRef.current?.parentElement) {
      highlightRef.current.parentElement.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.parentElement.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  return (
    <div className="flex flex-col h-full bg-nb-bg transition-colors duration-300">
      {/* Header */}
      <div className="flex items-center px-6 py-4 border-b border-nb-outline-variant bg-nb-surface shrink-0">
        <div className="flex items-center gap-2">
           <span className="text-xs font-semibold text-nb-on-surface-variant">Technical Source</span>
           <div className="px-1.5 py-0.5 rounded bg-nb-primary/10 border border-nb-primary/20">
              <span className="text-[9px] font-bold uppercase tracking-widest text-nb-primary">LaTeX SRC</span>
           </div>
        </div>
      </div>

      {/* Editor area — textarea overlaid on Prism highlight div */}
      <div className="flex-1 relative overflow-hidden bg-nb-bg p-8">
        {/* Technical Grid Background */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'linear-gradient(0deg, currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

        <div className="relative h-full w-full">
          {/* Highlight layer (behind textarea) */}
          <pre
            aria-hidden="true"
            className="absolute inset-0 p-0 m-0 overflow-auto text-[12px] leading-[1.8] font-mono whitespace-pre-wrap pointer-events-none select-none !bg-transparent"
          >
            <code
              ref={highlightRef}
              className="language-latex !bg-transparent !p-0 !text-[12px] !leading-[1.8] !font-mono"
            />
          </pre>

          {/* Editable textarea (transparent text, caret visible) */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => onChange(e.target.value)}
            onScroll={syncScroll}
            spellCheck={false}
            className="absolute inset-0 w-full h-full p-0 resize-none bg-transparent text-transparent caret-nb-primary font-mono text-[12px] leading-[1.8] outline-none border-none z-10 whitespace-pre-wrap"
          />
        </div>
      </div>
    </div>
  );
}
