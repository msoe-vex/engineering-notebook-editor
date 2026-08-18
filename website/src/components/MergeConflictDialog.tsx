import React, { useState } from "react";
import { AlertTriangle, X, Copy, CheckCircle2, RotateCcw, GitMerge, GitCompare, ChevronDown, ChevronRight, FileText, Code } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import DiffViewer from "./sidebar/DiffViewer";
import { LATEX_DIR, ENTRIES_DIR } from "@/lib/constants";

export type ConflictAction = "keep_local" | "keep_remote" | "duplicate";

export interface ConflictingEntryInfo {
  id: string;
  localTitle: string;
  remoteTitle: string;
  localAuthor?: string;
  remoteAuthor?: string;
  localDate?: string;
  remoteDate?: string;
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
}

interface MergeConflictDialogProps {
  isOpen: boolean;
  conflicts: ConflictingEntryInfo[];
  onResolve: (resolutions: Record<string, ConflictAction>) => void;
  onCancel: () => void;
}

export default function MergeConflictDialog({
  isOpen,
  conflicts,
  onResolve,
  onCancel
}: MergeConflictDialogProps) {
  const { getBaseFileContent, getFileContent } = useWorkspace();

  // Map of entryId -> chosen action. Default to 'duplicate' (safest: keep both).
  const [resolutions, setResolutions] = useState<Record<string, ConflictAction>>(() => {
    const initial: Record<string, ConflictAction> = {};
    conflicts.forEach(c => {
      initial[c.id] = "duplicate";
    });
    return initial;
  });

  const [expandedDiffs, setExpandedDiffs] = useState<Set<string>>(new Set());
  const [diffMode, setDiffMode] = useState<Record<string, "latex" | "json">>({});

  if (!isOpen || conflicts.length === 0) return null;

  const toggleDiff = (id: string) => {
    setExpandedDiffs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setAction = (id: string, action: ConflictAction) => {
    setResolutions(prev => ({ ...prev, [id]: action }));
  };

  const handleApply = () => {
    onResolve(resolutions);
  };

  return (
    <div className="fixed inset-0 z-500 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200 select-none">
      <div className="bg-nb-surface border border-nb-outline-variant/60 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-tight text-nb-on-surface">
                Merge Conflicts Detected
              </h2>
              <p className="text-[11px] text-nb-on-surface-variant/80">
                {conflicts.length === 1
                  ? "A teammate updated an entry on GitHub while you were editing it."
                  : `${conflicts.length} entries were modified on GitHub while you were editing them.`}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg text-nb-on-surface-variant/60 hover:text-nb-on-surface hover:bg-nb-surface-high transition-colors cursor-pointer"
            title="Cancel"
          >
            <X size={16} />
          </button>
        </div>

        {/* Conflict Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {conflicts.map(item => {
            const currentAction = resolutions[item.id] || "duplicate";
            const isDiffOpen = expandedDiffs.has(item.id);
            const currentMode = diffMode[item.id] || "latex";
            const targetPath = currentMode === "latex" ? `${LATEX_DIR}/${item.id}.tex` : `${ENTRIES_DIR}/${item.id}.json`;

            return (
              <div
                key={item.id}
                className="bg-nb-surface-low border border-nb-outline-variant/40 rounded-xl p-3.5 space-y-3"
              >
                {/* Entry Title Header */}
                <div className="flex items-center justify-between border-b border-nb-outline-variant/20 pb-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-[12px] font-bold text-nb-on-surface truncate block">
                      {item.localTitle || item.remoteTitle || "Untitled Entry"}
                    </span>
                    <span className="text-[10px] font-mono text-nb-on-surface-variant/60">
                      ID: {item.id.slice(0, 8)}...
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleDiff(item.id)}
                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                      isDiffOpen
                        ? "bg-nb-primary/15 text-nb-primary"
                        : "text-nb-on-surface-variant hover:text-nb-on-surface hover:bg-nb-surface-high"
                    }`}
                  >
                    <GitCompare size={12} />
                    <span>{isDiffOpen ? "Hide Diff" : "View Diff"}</span>
                    {isDiffOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                </div>

                {/* Local vs Remote Comparison Cards */}
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  {/* Your Version */}
                  <div className={`p-2.5 rounded-lg border transition-all ${
                    currentAction === "keep_local"
                      ? "bg-nb-primary/10 border-nb-primary/40 text-nb-on-surface"
                      : "bg-nb-surface border-nb-outline-variant/30 text-nb-on-surface-variant"
                  }`}>
                    <div className="font-bold text-[10px] text-nb-primary mb-1 uppercase tracking-wider">
                      Your Version
                    </div>
                    <div>Title: <span className="font-medium text-nb-on-surface">{item.localTitle || "—"}</span></div>
                    <div>Author: <span className="font-medium text-nb-on-surface">{item.localAuthor || "—"}</span></div>
                    <div>Date: <span className="font-medium text-nb-on-surface">{item.localDate || "—"}</span></div>
                  </div>

                  {/* Remote Version */}
                  <div className={`p-2.5 rounded-lg border transition-all ${
                    currentAction === "keep_remote"
                      ? "bg-purple-500/10 border-purple-500/40 text-nb-on-surface"
                      : "bg-nb-surface border-nb-outline-variant/30 text-nb-on-surface-variant"
                  }`}>
                    <div className="font-bold text-[10px] text-purple-600 dark:text-purple-400 mb-1 uppercase tracking-wider">
                      GitHub Version
                    </div>
                    <div>Title: <span className="font-medium text-nb-on-surface">{item.remoteTitle || "—"}</span></div>
                    <div>Author: <span className="font-medium text-nb-on-surface">{item.remoteAuthor || "—"}</span></div>
                    <div>Date: <span className="font-medium text-nb-on-surface">{item.remoteDate || "—"}</span></div>
                  </div>
                </div>

                {/* Inline Diff Preview */}
                {isDiffOpen && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[9px] font-black uppercase tracking-wider text-nb-on-surface-variant/60">
                        Comparing {currentMode === "latex" ? "LaTeX Content" : "JSON AST"}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setDiffMode(prev => ({ ...prev, [item.id]: "latex" }))}
                          className={`flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded cursor-pointer transition-colors ${
                            currentMode === "latex"
                              ? "bg-nb-primary/20 text-nb-primary"
                              : "text-nb-on-surface-variant/60 hover:text-nb-on-surface"
                          }`}
                        >
                          <FileText size={10} />
                          <span>LaTeX</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDiffMode(prev => ({ ...prev, [item.id]: "json" }))}
                          className={`flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded cursor-pointer transition-colors ${
                            currentMode === "json"
                              ? "bg-nb-primary/20 text-nb-primary"
                              : "text-nb-on-surface-variant/60 hover:text-nb-on-surface"
                          }`}
                        >
                          <Code size={10} />
                          <span>JSON</span>
                        </button>
                      </div>
                    </div>

                    <DiffViewer
                      change={{
                        path: targetPath,
                        operation: "upsert",
                        changeType: "update",
                        content: "",
                        label: `Diff ${targetPath}`,
                        stagedAt: ""
                      }}
                      getBaseContent={getBaseFileContent}
                      getFileContent={getFileContent}
                      onClose={() => toggleDiff(item.id)}
                    />
                  </div>
                )}

                {/* Resolution Choice Pills */}
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setAction(item.id, "duplicate")}
                    className={`py-2 px-2 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex flex-col items-center justify-center gap-1 border ${
                      currentAction === "duplicate"
                        ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-700 dark:text-emerald-300 shadow-xs"
                        : "bg-nb-surface border-nb-outline-variant/30 text-nb-on-surface-variant hover:bg-nb-surface-high"
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <Copy size={11} />
                      <span>Keep Both</span>
                    </div>
                    <span className="text-[8px] font-medium opacity-70">Saves copy</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAction(item.id, "keep_local")}
                    className={`py-2 px-2 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex flex-col items-center justify-center gap-1 border ${
                      currentAction === "keep_local"
                        ? "bg-nb-primary/15 border-nb-primary/50 text-nb-primary shadow-xs"
                        : "bg-nb-surface border-nb-outline-variant/30 text-nb-on-surface-variant hover:bg-nb-surface-high"
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <CheckCircle2 size={11} />
                      <span>Use Mine</span>
                    </div>
                    <span className="text-[8px] font-medium opacity-70">Overwrite remote</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAction(item.id, "keep_remote")}
                    className={`py-2 px-2 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex flex-col items-center justify-center gap-1 border ${
                      currentAction === "keep_remote"
                        ? "bg-purple-500/15 border-purple-500/50 text-purple-600 dark:text-purple-300 shadow-xs"
                        : "bg-nb-surface border-nb-outline-variant/30 text-nb-on-surface-variant hover:bg-nb-surface-high"
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <RotateCcw size={11} />
                      <span>Use Remote</span>
                    </div>
                    <span className="text-[8px] font-medium opacity-70">Discard mine</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 bg-nb-surface-low border-t border-nb-outline-variant/30 flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded-xl border border-nb-outline-variant text-[11px] font-bold text-nb-on-surface hover:bg-nb-surface-high transition-colors cursor-pointer"
          >
            Cancel Sync
          </button>

          <button
            onClick={handleApply}
            className="px-4 py-1.5 rounded-xl bg-nb-primary text-white text-[11px] font-bold tracking-wider hover:bg-nb-primary-dim transition-all active:scale-[0.99] shadow-nb-sm cursor-pointer flex items-center gap-1.5"
          >
            <GitMerge size={13} />
            <span>Apply & Sync</span>
          </button>
        </div>
      </div>
    </div>
  );
}
