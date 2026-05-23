"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { EntryImportMode, ImportOptions } from "@/lib/store/types";

interface ImportDecisionDialogProps {
  isOpen: boolean;
  title: string;
  currentEntries: number;
  entriesToImport: number;
  entriesReplaced: number;
  newEntries: number;
  initialOptions: ImportOptions;
  allowTeamImport: boolean;
  allowPhaseImport: boolean;
  onConfirm: (options: ImportOptions) => void;
  onCancel: () => void;
}

export default function ImportDecisionDialog({
  isOpen,
  title,
  currentEntries,
  entriesToImport,
  entriesReplaced,
  newEntries,
  initialOptions,
  allowTeamImport,
  allowPhaseImport,
  onConfirm,
  onCancel,
}: ImportDecisionDialogProps) {
  const [entryImportMode, setEntryImportMode] = useState<EntryImportMode>(initialOptions.entryImportMode || "replace");
  const [importTeam, setImportTeam] = useState(initialOptions.overwriteTeam !== false);
  const [importPhases, setImportPhases] = useState(initialOptions.overwritePhases !== false);

  const derivedCounts = useMemo(() => {
    if (entryImportMode === "none") {
      return { deleted: 0, replaced: 0, newEntries: 0 };
    }
    if (entryImportMode === "keep") {
      return { deleted: 0, replaced: 0, newEntries: entriesToImport };
    }
    if (entryImportMode === "clear") {
      return { deleted: currentEntries, replaced: 0, newEntries: entriesToImport };
    }
    return {
      deleted: 0,
      replaced: entriesReplaced,
      newEntries,
    };
  }, [entryImportMode, currentEntries, entriesReplaced, entriesToImport, newEntries]);

  if (!isOpen) return null;

  const buttonClass =
    "px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 cursor-pointer border border-transparent";

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 animate-in fade-in duration-300"
      onClick={onCancel}
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
              onClick={onCancel}
              className="p-2 rounded-xl hover:bg-nb-surface-low text-nb-on-surface-variant/40 hover:text-nb-on-surface transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            {/* <StatCard label="Current entries" value={currentEntries} tone="neutral" /> */} {/* Optional: can show current entries if it adds value, skip for now */}
            <StatCard label="Entries to import" value={entriesToImport} tone="neutral" />
            <StatCard label="Will be deleted" value={derivedCounts.deleted} tone="danger" />
            <StatCard label="Will be replaced" value={derivedCounts.replaced} tone="warning" />
            <StatCard label="New entries" value={derivedCounts.newEntries} tone="success" />
          </div>

          <div className="grid gap-4 mb-6">
            <label className="grid gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-nb-on-surface-variant">Import entry option</span>
              <select
                value={entryImportMode}
                onChange={e => setEntryImportMode(e.target.value as EntryImportMode)}
                className="w-full rounded-2xl border border-nb-outline-variant/30 bg-nb-surface-low px-4 py-3 text-sm font-medium text-nb-on-surface outline-none focus:border-nb-primary"
              >
                <option value="replace">Replace</option>
                <option value="keep">Keep</option>
                <option value="clear">Clear</option>
                <option value="none">None</option>
              </select>
            </label>

            <label className="flex items-center justify-between gap-4 rounded-2xl border border-nb-outline-variant/30 bg-nb-surface-low px-4 py-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-nb-on-surface-variant">Import team data</span>
              <input
                type="checkbox"
                checked={importTeam}
                disabled={!allowTeamImport}
                onChange={e => setImportTeam(e.target.checked)}
                className="h-4 w-4 rounded border-nb-outline-variant/50 text-nb-primary focus:ring-nb-primary disabled:cursor-not-allowed disabled:opacity-40"
              />
            </label>

            <label className="flex items-center justify-between gap-4 rounded-2xl border border-nb-outline-variant/30 bg-nb-surface-low px-4 py-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-nb-on-surface-variant">Import phase data</span>
              <input
                type="checkbox"
                checked={importPhases}
                disabled={!allowPhaseImport}
                onChange={e => setImportPhases(e.target.checked)}
                className="h-4 w-4 rounded border-nb-outline-variant/50 text-nb-primary focus:ring-nb-primary disabled:cursor-not-allowed disabled:opacity-40"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <button
              onClick={onCancel}
              className={`${buttonClass} border-nb-outline-variant/30 bg-transparent text-nb-on-surface-variant hover:bg-nb-surface-low`}
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm({ entryImportMode, overwriteTeam: importTeam, overwritePhases: importPhases })}
              className={`${buttonClass} bg-nb-primary text-white hover:bg-nb-primary-dim shadow-lg shadow-nb-primary/20 sm:col-span-3`}
            >
              Import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "neutral" | "danger" | "warning" | "success" }) {
  const toneClasses = {
    neutral: "border-nb-outline-variant/30 bg-nb-surface-low text-nb-on-surface-variant",
    danger: "border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400",
    warning: "border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400",
    success: "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400",
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClasses[tone]}`}>
      <div className="text-[10px] font-black uppercase tracking-widest">{label}</div>
      <div className="mt-2 text-2xl font-black tracking-tight text-nb-on-surface">{value}</div>
    </div>
  );
}
