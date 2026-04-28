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
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="flex items-center px-5 py-3 border-b border-white/5 bg-black/40 shrink-0 gap-3">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/30 border border-red-500/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/30 border border-amber-500/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/30 border border-green-500/50" />
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">
          Raw LaTeX
        </span>
        <span className="text-[10px] font-mono text-zinc-600 truncate ml-auto max-w-[200px]">
          {filename}
        </span>
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-3 px-5 py-3 bg-amber-900/20 border-b border-amber-700/30 shrink-0">
        <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-400 leading-relaxed">
          {isLegacyFallback
            ? "This file has no structured metadata. You are editing raw LaTeX — changes made here cannot be migrated to the rich editor."
            : "You have switched to raw LaTeX mode. The METADATA tag has been removed. The rich editor is not available for this session."}
        </p>
      </div>

      {/* Editor area — textarea overlaid on Prism highlight div */}
      <div className="flex-1 relative overflow-hidden">
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
          className="absolute inset-0 w-full h-full p-6 resize-none bg-transparent text-transparent caret-white font-mono text-[13px] leading-relaxed outline-none border-none z-10"
          style={{ caretColor: "#fff" }}
        />
      </div>
    </div>
  );
}
