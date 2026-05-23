"use client";

import { AlertTriangle, X } from "lucide-react";
import { EntryImportMode } from "@/lib/store/types";

interface ImportDecisionDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onChoose: (mode: EntryImportMode | null) => void;
}

export default function ImportDecisionDialog({
  isOpen,
  title,
  message,
  onChoose,
}: ImportDecisionDialogProps) {
  if (!isOpen) return null;

  const buttonClass =
    "px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 cursor-pointer border border-transparent";

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 animate-in fade-in duration-300"
      onClick={() => onChoose(null)}
    >
      <div
        className="relative w-full max-w-lg bg-nb-surface border border-nb-outline-variant/30 rounded-[24px] shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-300"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <AlertTriangle size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-black text-nb-on-surface uppercase tracking-widest">{title}</h3>
              <div className="h-0.5 w-8 bg-nb-outline-variant/30 mt-1" />
            </div>
            <button
              onClick={() => onChoose(null)}
              className="p-2 rounded-xl hover:bg-nb-surface-low text-nb-on-surface-variant/40 hover:text-nb-on-surface transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          <p className="text-xs text-nb-on-surface-variant font-medium leading-relaxed mb-6">
            {message}
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <button
              onClick={() => onChoose("keep")}
              className={`${buttonClass} bg-nb-surface-low text-nb-on-surface-variant hover:bg-nb-primary/10 hover:text-nb-primary`}
            >
              Keep
            </button>
            <button
              onClick={() => onChoose("replace")}
              className={`${buttonClass} bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-500/20`}
            >
              Replace
            </button>
            <button
              onClick={() => onChoose("clear")}
              className={`${buttonClass} bg-nb-primary text-white hover:bg-nb-primary-dim shadow-lg shadow-nb-primary/20`}
            >
              Clear
            </button>
            <button
              onClick={() => onChoose(null)}
              className={`${buttonClass} border-nb-outline-variant/30 bg-transparent text-nb-on-surface-variant hover:bg-nb-surface-low`}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
