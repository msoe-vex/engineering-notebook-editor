"use client";

import React, { useEffect, useRef } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-latex";
import { AlertTriangle } from "lucide-react";

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
      <div className="flex items-center px-6 py-4 border-b border-nb-outline-variant bg-nb-surface shrink-0 gap-4">
        <div className="flex gap-1.5 shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-nb-primary/40 border border-nb-primary/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-nb-tertiary/40 border border-nb-tertiary/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-nb-outline/20 border border-nb-outline/40" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-nb-on-surface-variant">
            Technical Source
          </span>
          <div className="px-1.5 py-0.5 rounded bg-nb-primary/10 border border-nb-primary/20">
            <span className="text-[9px] font-black uppercase tracking-widest text-nb-primary">LaTeX</span>
          </div>
        </div>
        <span className="text-[10px] font-mono text-nb-on-surface-variant truncate ml-auto max-w-[300px] opacity-40">
          {filename}
        </span>
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-3 px-6 py-3 bg-amber-900/10 border-b border-amber-800/20 shrink-0">
        <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[11px] font-medium text-amber-500/80 leading-relaxed uppercase tracking-wider">
          {isLegacyFallback
            ? "Legacy Entry: No metadata detected. Changes are permanent and manual."
            : "Raw Access: Metadata stripped. Rich editor disabled for this file."}
        </p>
      </div>

      {/* Editor area — textarea overlaid on Prism highlight div */}
      <div className="flex-1 relative overflow-hidden bg-nb-surface">
        {/* Highlight layer (behind textarea) */}
        <pre
          aria-hidden="true"
          className="absolute inset-0 p-6 m-0 overflow-auto text-[13px] leading-relaxed font-mono whitespace-pre pointer-events-none select-none !bg-transparent"
        >
          <code
            ref={highlightRef}
            className="language-latex !bg-transparent !p-0 !text-[13px] !leading-relaxed !font-mono"
          />
        </pre>

        {/* Editable textarea (transparent text, caret visible) */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          spellCheck={false}
          className="absolute inset-0 w-full h-full p-6 resize-none bg-transparent text-transparent caret-nb-primary font-mono text-[13px] leading-relaxed outline-none border-none z-10"
        />
      </div>
    </div>
  );
}
