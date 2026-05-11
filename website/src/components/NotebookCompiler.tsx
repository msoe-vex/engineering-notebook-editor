"use client";

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import Preview from "./Preview";
import { compileNotebook, CompileResult } from "@/lib/busytex";
import { showNotification } from "./Notification";
import { Play, Loader2, Calendar, FileText, ArrowLeft, RefreshCcw } from "lucide-react";

export default function NotebookCompiler({ onClose }: { onClose: () => void }) {
  const { metadata, saveCompiledPdf, getCompiledPdfUrl } = useWorkspace();
  const [isCompiling, setIsCompiling] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(true);

  const loadLastPdf = useCallback(async () => {
    setIsLoadingPdf(true);
    try {
      const url = await getCompiledPdfUrl();
      if (url) setPdfUrl(url);
    } catch (e) {
      console.error("Failed to load last compiled PDF", e);
    } finally {
      setIsLoadingPdf(false);
    }
  }, [getCompiledPdfUrl]);

  useEffect(() => {
    loadLastPdf();
  }, [loadLastPdf]);

  const handleCompile = async () => {
    if (isCompiling) return;
    setIsCompiling(true);
    try {
      const result: CompileResult = await compileNotebook();
      if (result.success && result.pdf) {
        // save to store
        await saveCompiledPdf(result.pdf);

        // create local URL for preview
        const blob = new Blob([result.pdf.slice()], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);

        showNotification("Notebook compiled successfully!", "success");
      } else {
        showNotification("Compilation failed. Check console for logs.", "error");
        console.error(result.log);
      }
    } catch (e) {
      console.error("Compilation error:", e);
      showNotification("An error occurred during compilation.", "error");
    } finally {
      setIsCompiling(false);
    }
  };

  const lastCompiledDate = metadata.lastCompiled
    ? new Date(metadata.lastCompiled).toLocaleString()
    : "Never";

  return (
    <div className="flex flex-col h-full bg-nb-bg animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between px-6 h-16 border-b border-nb-outline-variant bg-nb-surface shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-nb-surface-low text-nb-on-surface-variant transition-colors cursor-pointer"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-lg font-black text-nb-on-surface leading-tight tracking-tight">Compiled Notebook</h2>
            <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-nb-on-surface-variant/60">
              <Calendar size={10} />
              <span>Last Compiled: {lastCompiledDate}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleCompile}
            disabled={isCompiling}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all shadow-lg active:scale-[0.98] ${isCompiling
                ? 'bg-nb-surface-low text-nb-on-surface-variant cursor-not-allowed border border-nb-outline-variant'
                : 'bg-nb-primary text-white hover:bg-nb-primary-dim shadow-nb-primary/20 cursor-pointer'
              }`}
          >
            {isCompiling ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Compiling...</span>
              </>
            ) : (
              <>
                <Play size={16} fill="currentColor" />
                <span>Compile Notebook</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {isLoadingPdf ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-nb-bg/50 backdrop-blur-sm z-10">
            <Loader2 size={32} className="animate-spin text-nb-primary" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-nb-on-surface-variant animate-pulse">Loading last version...</span>
          </div>
        ) : pdfUrl ? (
          <Preview latexContent="" pdfUrl={pdfUrl} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center max-w-md mx-auto">
            <div className="w-20 h-20 rounded-3xl bg-nb-surface-low flex items-center justify-center text-nb-on-surface-variant/20 border border-nb-outline-variant/30">
              <FileText size={40} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-nb-on-surface tracking-tight">No PDF Generated Yet</h3>
              <p className="text-sm text-nb-on-surface-variant leading-relaxed font-medium">
                You haven't compiled this notebook yet. Click the button above to generate a full PDF version of your documentation.
              </p>
            </div>
            <button
              onClick={handleCompile}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-nb-surface-low border border-nb-outline-variant text-nb-on-surface font-black text-xs hover:bg-nb-surface-mid transition-all hover:border-nb-primary/30 cursor-pointer"
            >
              <RefreshCcw size={14} className={isCompiling ? "animate-spin" : ""} />
              Generate First Version
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
