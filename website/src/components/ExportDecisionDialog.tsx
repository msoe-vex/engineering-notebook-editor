"use client";

import React from "react";
import { Download, X, FileJson, Archive, Check } from "lucide-react";

interface ExportDecisionDialogProps {
  isOpen: boolean;
  onConfirm: (mode: "data-only" | "full") => void;
  onCancel: () => void;
}

export default function ExportDecisionDialog({
  isOpen,
  onConfirm,
  onCancel,
}: ExportDecisionDialogProps) {
  const [selectedMode, setSelectedMode] = React.useState<"data-only" | "full">("full");

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 backdrop-blur-md px-4 animate-in fade-in duration-300"
      onClick={onCancel}
    >
      {/* Outer Card: enforces rounded corners and masks the scrollbar */}
      <div
        className="relative w-full max-w-lg bg-nb-surface border border-nb-outline-variant/40 rounded-[32px] shadow-[0_24px_50px_-12px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Offset Wrapper: pushes the scroll container and its scrollbar 16px (pr-4) away from the right border and 16px (py-4) vertically to prevent rounded corner clipping */}
        <div className="py-4 pr-4 pl-1 w-full">
          {/* Scroll Container: explicit max-height ensures the browser ALWAYS triggers the scrollbar internally */}
          <div className="overflow-y-auto max-h-[80vh] w-full p-6 pr-4 pt-8">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-nb-outline-variant/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-nb-primary/10 text-nb-primary flex items-center justify-center shadow-inner">
                  <Download size={20} className="animate-bounce-slow" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-nb-on-surface uppercase tracking-widest">
                    Export Notebook
                  </h3>
                  <p className="text-[10px] text-nb-on-surface-variant font-black uppercase tracking-widest mt-0.5 opacity-70">
                    Choose packaging structure
                  </p>
                </div>
              </div>
              <button
                onClick={onCancel}
                className="p-2.5 rounded-xl hover:bg-nb-surface-low text-nb-on-surface-variant/40 hover:text-nb-on-surface transition-all duration-200 cursor-pointer active:scale-90"
              >
                <X size={18} />
              </button>
            </div>

            {/* Options Content */}
            <div className="flex flex-col gap-4 mt-6">
              
              {/* Full LaTeX Project Option (First & Default) */}
              <div
                onClick={() => setSelectedMode("full")}
                className={`flex items-start gap-4 p-5 rounded-2xl border transition-all duration-200 cursor-pointer select-none group relative ${
                  selectedMode === "full"
                    ? "bg-nb-primary/5 border-nb-primary shadow-[0_8px_20px_-6px_rgba(var(--nb-primary-rgb),0.15)]"
                    : "border-nb-outline-variant/20 hover:border-nb-outline-variant/60 hover:bg-nb-surface-low/40"
                }`}
              >
                <div className={`p-3 rounded-xl transition-colors duration-200 ${
                  selectedMode === "full" ? "bg-nb-primary text-white" : "bg-nb-surface-low text-nb-on-surface-variant group-hover:text-nb-on-surface"
                }`}>
                  <Archive size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-nb-on-surface uppercase tracking-wide">
                      Full Project
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-nb-primary bg-nb-primary/10 px-2 py-0.5 rounded-full border border-nb-primary/15">
                      Best for Backups (Default)
                    </span>
                  </div>
                  <p className="text-xs text-nb-on-surface-variant mt-2 leading-relaxed font-medium">
                    Best for complete backups. Includes all raw entry data, dynamic LaTeX sources, custom stylesheets, font files, and the compiled PDF.
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    <span className="text-[9px] font-bold text-nb-on-surface-variant bg-nb-surface-low/80 border border-nb-outline-variant/10 px-2 py-0.5 rounded">main.tex</span>
                    <span className="text-[9px] font-bold text-nb-on-surface-variant bg-nb-surface-low/80 border border-nb-outline-variant/10 px-2 py-0.5 rounded">notebook.sty</span>
                    <span className="text-[9px] font-bold text-nb-on-surface-variant bg-nb-surface-low/80 border border-nb-outline-variant/10 px-2 py-0.5 rounded">latex/</span>
                    <span className="text-[9px] font-bold text-nb-on-surface-variant bg-nb-surface-low/80 border border-nb-outline-variant/10 px-2 py-0.5 rounded">main.pdf</span>
                  </div>
                </div>
              </div>

              {/* Data Only Option (Second) */}
              <div
                onClick={() => setSelectedMode("data-only")}
                className={`flex items-start gap-4 p-5 rounded-2xl border transition-all duration-200 cursor-pointer select-none group relative ${
                  selectedMode === "data-only"
                    ? "bg-nb-primary/5 border-nb-primary shadow-[0_8px_20px_-6px_rgba(var(--nb-primary-rgb),0.15)]"
                    : "border-nb-outline-variant/20 hover:border-nb-outline-variant/60 hover:bg-nb-surface-low/40"
                }`}
              >
                <div className={`p-3 rounded-xl transition-colors duration-200 ${
                  selectedMode === "data-only" ? "bg-nb-primary text-white" : "bg-nb-surface-low text-nb-on-surface-variant group-hover:text-nb-on-surface"
                }`}>
                  <FileJson size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-nb-on-surface uppercase tracking-wide">
                      Data Only
                    </span>
                  </div>
                  <p className="text-xs text-nb-on-surface-variant mt-2 leading-relaxed font-medium">
                    Saves entries (and images), team, and phases info. A lightweight payload perfect for exporting raw data without style templates.
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    <span className="text-[9px] font-bold text-nb-on-surface-variant bg-nb-surface-low/80 border border-nb-outline-variant/10 px-2 py-0.5 rounded">data/entries/</span>
                    <span className="text-[9px] font-bold text-nb-on-surface-variant bg-nb-surface-low/80 border border-nb-outline-variant/10 px-2 py-0.5 rounded">data/assets/</span>
                    <span className="text-[9px] font-bold text-nb-on-surface-variant bg-nb-surface-low/80 border border-nb-outline-variant/10 px-2 py-0.5 rounded">notebook.index.json</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Footer Actions */}
            <div className="flex justify-end gap-3 mt-6 border-t border-nb-outline-variant/10 pt-4">
              <button
                onClick={onCancel}
                className="px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-nb-outline-variant/30 text-nb-on-surface-variant hover:bg-nb-surface-low hover:text-nb-on-surface transition-all duration-200 cursor-pointer active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={() => onConfirm(selectedMode)}
                className="px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-nb-primary text-white hover:bg-nb-primary-dim shadow-lg shadow-nb-primary/20 hover:shadow-nb-primary/30 transition-all duration-200 cursor-pointer active:scale-95 flex items-center gap-2"
              >
                <Download size={14} />
                Export Notebook
              </button>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}
