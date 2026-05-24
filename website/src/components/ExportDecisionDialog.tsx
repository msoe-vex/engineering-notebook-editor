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
  const [selectedMode, setSelectedMode] = React.useState<"data-only" | "full">("data-only");

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 animate-in fade-in duration-300"
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-lg bg-nb-surface border border-nb-outline-variant/30 rounded-[28px] shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-nb-outline-variant/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-nb-primary/10 text-nb-primary flex items-center justify-center">
              <Download size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black text-nb-on-surface uppercase tracking-widest">
                Export Notebook Data
              </h3>
              <p className="text-[10px] text-nb-on-surface-variant font-bold uppercase tracking-wider mt-0.5">
                Choose packaging structure
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 rounded-xl hover:bg-nb-surface-low text-nb-on-surface-variant/40 hover:text-nb-on-surface transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Options Content */}
        <div className="p-6 flex flex-col gap-4">
          
          {/* Data Only Option */}
          <div
            onClick={() => setSelectedMode("data-only")}
            className={`flex items-start gap-4 p-5 rounded-2xl border transition-all cursor-pointer select-none ${
              selectedMode === "data-only"
                ? "bg-nb-primary/5 border-nb-primary shadow-sm"
                : "border-nb-outline-variant/30 hover:border-nb-outline-variant/70 hover:bg-nb-surface-low/50"
            }`}
          >
            <div className={`p-3 rounded-xl ${
              selectedMode === "data-only" ? "bg-nb-primary text-white" : "bg-nb-surface-low text-nb-on-surface-variant"
            }`}>
              <FileJson size={20} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-nb-on-surface uppercase tracking-wide">
                  Data-only Export
                </span>
                {selectedMode === "data-only" && (
                  <span className="text-[9px] font-black uppercase tracking-widest text-nb-primary bg-nb-primary/10 px-2 py-0.5 rounded-full">
                    Recommended
                  </span>
                )}
              </div>
              <p className="text-xs text-nb-on-surface-variant mt-2 leading-relaxed">
                Contains only raw entry contents (TipTap JSON), image assets, and metadata manifest index. Perfect for transfer or backups.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                <span className="text-[9px] font-bold text-nb-on-surface-variant bg-nb-surface-mid px-2 py-0.5 rounded">data/entries/</span>
                <span className="text-[9px] font-bold text-nb-on-surface-variant bg-nb-surface-mid px-2 py-0.5 rounded">data/assets/</span>
                <span className="text-[9px] font-bold text-nb-on-surface-variant bg-nb-surface-mid px-2 py-0.5 rounded">notebook.index.json</span>
              </div>
            </div>
          </div>

          {/* Full LaTeX Project Option */}
          <div
            onClick={() => setSelectedMode("full")}
            className={`flex items-start gap-4 p-5 rounded-2xl border transition-all cursor-pointer select-none ${
              selectedMode === "full"
                ? "bg-nb-primary/5 border-nb-primary shadow-sm"
                : "border-nb-outline-variant/30 hover:border-nb-outline-variant/70 hover:bg-nb-surface-low/50"
            }`}
          >
            <div className={`p-3 rounded-xl ${
              selectedMode === "full" ? "bg-nb-primary text-white" : "bg-nb-surface-low text-nb-on-surface-variant"
            }`}>
              <Archive size={20} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-nb-on-surface uppercase tracking-wide">
                  Full LaTeX Project
                </span>
              </div>
              <p className="text-xs text-nb-on-surface-variant mt-2 leading-relaxed">
                Includes all entry data plus generated LaTeX sources (`latex/`), the `main.tex` template, custom styling `notebook.sty`, fonts, and compiled PDF.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                <span className="text-[9px] font-bold text-nb-on-surface-variant bg-nb-surface-mid px-2 py-0.5 rounded">main.tex</span>
                <span className="text-[9px] font-bold text-nb-on-surface-variant bg-nb-surface-mid px-2 py-0.5 rounded">notebook.sty</span>
                <span className="text-[9px] font-bold text-nb-on-surface-variant bg-nb-surface-mid px-2 py-0.5 rounded">latex/</span>
                <span className="text-[9px] font-bold text-nb-on-surface-variant bg-nb-surface-mid px-2 py-0.5 rounded">fonts/</span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-6 pt-4 border-t border-nb-outline-variant/20 flex justify-end gap-3 bg-nb-surface-low/20">
          <button
            onClick={onCancel}
            className="px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-nb-outline-variant/30 text-nb-on-surface-variant hover:bg-nb-surface-low transition-all cursor-pointer active:scale-95"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selectedMode)}
            className="px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-nb-primary text-white hover:bg-nb-primary-dim shadow-lg shadow-nb-primary/20 transition-all cursor-pointer active:scale-95 flex items-center gap-2"
          >
            <Download size={14} />
            Export Project
          </button>
        </div>
      </div>
    </div>
  );
}
