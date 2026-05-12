"use client";

import { useState, useEffect } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import Preview from "./Preview";
import { compileNotebook, CompileResult } from "@/lib/busytex";
import { showNotification } from "./Notification";
import { Play, Loader2, Calendar, FileText, X, RefreshCcw, Download } from "lucide-react";

export default function NotebookCompiler({ onClose }: { onClose: () => void }) {
  const { workspaceVersion, metadata, saveCompiledPdf, getCompiledPdfUrl, isInitialized, currentProject } = useWorkspace();
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileStatus, setCompileStatus] = useState<string>("");
  const [compileProgress, setCompileProgress] = useState(0);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(true);

  useEffect(() => {
    let active = true;

    const loadPdf = async () => {
      if (!isInitialized) return;

      // Delay resets to avoid synchronous setState warnings in effect
      await Promise.resolve();
      if (!active) return;

      setPdfUrl(null);
      setIsLoadingPdf(true);

      try {
        const url = await getCompiledPdfUrl();
        if (active) {
          setPdfUrl(url);
        }
      } catch (e) {
        console.error("Failed to load last compiled PDF", e);
      } finally {
        if (active) {
          setIsLoadingPdf(false);
        }
      }
    };

    loadPdf();

    return () => {
      active = false;
    };
  }, [getCompiledPdfUrl, isInitialized, workspaceVersion]);

  const handleCompile = async () => {
    if (isCompiling) return;
    setIsCompiling(true);
    setCompileProgress(0);
    setCompileStatus("Starting...");

    try {
      const result: CompileResult = await compileNotebook((status) => {
        setCompileStatus(status);
        // Map stages to approximate percentages for the progress bar
        if (status.includes("metadata")) setCompileProgress(10);
        else if (status.includes("Initializing")) setCompileProgress(20);
        else if (status.includes("dependencies")) setCompileProgress(35);
        else if (status.includes("typography")) setCompileProgress(50);
        else if (status.includes("structure")) setCompileProgress(65);
        else if (status.includes("assets")) setCompileProgress(80);
        else if (status.includes("Pass 1")) setCompileProgress(90);
      });

      if (result.success && result.pdf) {
        // save to store
        await saveCompiledPdf(result.pdf);

        // create local URL for preview
        const blob = new Blob([result.pdf.slice()], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);

        showNotification("Notebook compiled successfully!", "success");
        setIsCompiling(false);
      } else {
        setCompileProgress(0);
        setCompileStatus("Failed");
        showNotification("Compilation failed. Check log for details.", "error");
        console.error(result.log);
        setIsCompiling(false);
      }
    } catch (e) {
      setCompileProgress(0);
      setCompileStatus("Error");
      console.error("Compilation error:", e);
      showNotification("An error occurred during compilation.", "error");
      setIsCompiling(false);
    }
  };

  const handleDownload = () => {
    if (!pdfUrl) return;
    const link = document.createElement("a");
    link.href = pdfUrl;
    const title = (currentProject?.name || metadata.team?.teamName || "Untitled").replace(/\s+/g, '_');
    link.download = `Engineering_Notebook_${title}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const lastCompiledDate = metadata.lastCompiled
    ? new Date(metadata.lastCompiled).toLocaleString()
    : "Never";

  return (
    <div className="flex flex-col h-full bg-nb-bg animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between px-3 md:px-6 h-16 border-b border-nb-outline-variant bg-nb-surface shrink-0">
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          <div className="hidden sm:flex w-10 h-10 rounded-xl bg-nb-primary/10 text-nb-primary flex items-center justify-center shrink-0">
            <FileText size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm md:text-lg font-black text-nb-on-surface leading-tight tracking-tight truncate max-w-[100px] xs:max-w-[150px] sm:max-w-none">Full Notebook Preview</h2>
            <div className="hidden sm:flex items-center gap-2 text-[10px] font-black tracking-widest text-nb-on-surface-variant/60">
              <Calendar size={10} />
              <span>Last compiled: {lastCompiledDate}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 md:gap-3">
          {pdfUrl && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-3 md:px-5 py-2.5 rounded-xl text-sm font-black transition-all border border-nb-outline-variant bg-nb-surface-low text-nb-on-surface hover:bg-nb-surface-mid hover:border-nb-primary/30 cursor-pointer shadow-sm active:scale-[0.98]"
              title="Download PDF"
            >
              <Download size={16} />
              <span className="hidden md:inline">Download</span>
            </button>
          )}

          <button
            onClick={handleCompile}
            disabled={isCompiling}
            className={`flex items-center gap-2 px-3 md:px-5 py-2.5 rounded-xl text-sm font-black transition-all shadow-lg active:scale-[0.98] ${isCompiling
              ? 'bg-nb-surface-low text-nb-on-surface-variant cursor-not-allowed border border-nb-outline-variant'
              : 'bg-nb-primary text-white hover:bg-nb-primary-dim shadow-nb-primary/20 cursor-pointer'
              }`}
          >
            {isCompiling ? (
              <>
                <Loader2 size={16} className="animate-spin-stable" />
                <span className="hidden sm:inline">Compiling...</span>
                <span className="sm:hidden">Busy...</span>
              </>
            ) : (
              <>
                <Play size={16} fill="currentColor" />
                <span className="hidden xs:inline">Compile Notebook</span>
                <span className="xs:hidden">Compile</span>
              </>
            )}
          </button>

          <div className="w-px h-6 bg-nb-outline-variant/30 mx-1" />

          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-nb-surface-low text-nb-on-surface-variant hover:text-nb-on-surface transition-colors cursor-pointer"
            title="Close Compiler"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Progress Bar (Visible at the top of the header when compiling) */}
      {isCompiling && (
        <div className="h-0.5 w-full bg-nb-surface-low overflow-hidden shrink-0">
          <div
            className="h-full bg-nb-primary transition-all duration-500 ease-out shadow-[0_0_8px_rgba(217,40,47,0.5)]"
            style={{ width: `${compileProgress}%` }}
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {isCompiling ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 bg-nb-bg/80 backdrop-blur-md z-30 animate-in fade-in duration-300">
            <div className="relative">
              <div className="absolute inset-0 bg-nb-primary/10 rounded-full blur-2xl animate-pulse" />
              <div className="w-24 h-24 rounded-[32px] bg-nb-surface border border-nb-outline-variant/30 shadow-nb-xl flex items-center justify-center relative">
                <Loader2 size={40} className="text-nb-primary animate-spin-stable" />
              </div>
            </div>

            <div className="text-center space-y-3 max-w-xs px-6">
              <div className="space-y-1">
                <h3 className="text-lg font-black text-nb-on-surface tracking-tight leading-tight">{compileStatus}</h3>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-nb-on-surface-variant/40">Step {Math.min(7, Math.ceil(compileProgress / 13))} of 7</p>
              </div>

              <div className="w-full h-1 bg-nb-surface-low rounded-full overflow-hidden">
                <div
                  className="h-full bg-nb-primary transition-all duration-500 ease-out"
                  style={{ width: `${compileProgress}%` }}
                />
              </div>
            </div>
          </div>
        ) : isLoadingPdf ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-nb-bg/50 backdrop-blur-sm z-10">
            <div className="flex items-center justify-center w-10 h-10">
              <Loader2 size={32} className="animate-spin-stable text-nb-primary" />
            </div>
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
                You have not compiled this notebook yet. Click the button above to generate a full PDF version of your documentation.
              </p>
            </div>
            <button
              onClick={handleCompile}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-nb-surface-low border border-nb-outline-variant text-nb-on-surface font-black text-xs hover:bg-nb-surface-mid transition-all hover:border-nb-primary/30 cursor-pointer"
            >
              <RefreshCcw size={14} className={isCompiling ? "animate-spin-reverse" : ""} />
              Generate First Version
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
