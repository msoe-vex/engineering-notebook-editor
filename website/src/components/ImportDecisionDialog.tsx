"use client";

import { useMemo, useState } from "react";
import { 
  AlertTriangle, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Settings, 
  Layers, 
  Plus, 
  RefreshCw, 
  Trash2, 
  Users, 
  Palette, 
  FileCode,
  Info
} from "lucide-react";
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
  hasMainTex?: boolean;
  hasStyles?: boolean;
  hasFonts?: boolean;
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
  hasMainTex = false,
  hasStyles = false,
  hasFonts = false,
  onConfirm,
  onCancel,
}: ImportDecisionDialogProps) {
  // State for advanced options accordion
  const [showAdvanced, setShowAdvanced] = useState(false);

  // States for options
  const [entryImportMode, setEntryImportMode] = useState<EntryImportMode>(initialOptions.entryImportMode || "replace");
  const [importTeam, setImportTeam] = useState(initialOptions.overwriteTeam !== false);
  const [importPhases, setImportPhases] = useState(initialOptions.overwritePhases !== false);

  const [importProjectFiles, setImportProjectFiles] = useState(true);
  const [overwriteMainTex, setOverwriteMainTex] = useState(hasMainTex);
  const [overwriteStyles, setOverwriteStyles] = useState(hasStyles);
  const [overwriteFonts, setOverwriteFonts] = useState(hasFonts);

  // Calculate the impact dynamically
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

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 backdrop-blur-md px-4 animate-in fade-in duration-300"
      onClick={onCancel}
    >
      {/* Outer Card: enforces rounded corners and masks the scrollbar */}
      <div
        className="relative w-full max-w-xl bg-nb-surface border border-nb-outline-variant/40 rounded-[32px] shadow-[0_24px_50px_-12px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Offset Wrapper: pushes the scroll container and its scrollbar 16px (pr-4) away from the right border and 16px (py-4) vertically to prevent rounded corner clipping */}
        <div className="py-4 pr-4 pl-1 w-full">
          {/* Scroll Container: explicit max-height ensures the browser ALWAYS triggers the scrollbar internally */}
          <div className="overflow-y-auto max-h-[80vh] w-full p-6 pr-4 pt-8">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-nb-outline-variant/10 mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0 shadow-inner">
                  <AlertTriangle size={24} className="animate-pulse" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-black text-nb-on-surface uppercase tracking-widest">{title}</h3>
                  <p className="text-[10px] text-nb-on-surface-variant font-black uppercase tracking-widest mt-0.5 opacity-70">
                    Confirm notebook data insertion
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

            {/* Premium Visual Flow Diagram */}
            <div className="bg-nb-surface-low/60 border border-nb-outline-variant/20 rounded-2xl p-5 mb-6 flex flex-col gap-4">
              <div className="text-[9px] font-black uppercase tracking-widest text-nb-on-surface-variant/80 border-b border-nb-outline-variant/10 pb-2">
                Workspace Import Impact
              </div>
              
              <div className="flex items-center justify-between gap-4">
                {/* Import Source */}
                <div className="flex-1 text-center p-3 bg-nb-surface-mid/40 border border-nb-outline-variant/10 rounded-xl">
                  <span className="block text-[8px] font-black uppercase tracking-widest text-nb-on-surface-variant">Incoming Package</span>
                  <span className="block text-xl font-black text-nb-primary mt-1">{entriesToImport}</span>
                  <span className="block text-[9px] font-bold text-nb-on-surface-variant mt-0.5">Entries Detected</span>
                </div>

                {/* Arrow Connection */}
                <div className="flex flex-col items-center shrink-0 text-nb-on-surface-variant/30">
                  <div className="w-8 h-[1px] bg-nb-on-surface-variant/20" />
                  <span className="text-[8px] font-black uppercase mt-1 tracking-widest">Merge</span>
                </div>

                {/* Current Workspace Destination */}
                <div className="flex-1 text-center p-3 bg-nb-surface-mid/40 border border-nb-outline-variant/10 rounded-xl">
                  <span className="block text-[8px] font-black uppercase tracking-widest text-nb-on-surface-variant">Active Workspace</span>
                  <span className="block text-xl font-black text-nb-on-surface mt-1">{currentEntries}</span>
                  <span className="block text-[9px] font-bold text-nb-on-surface-variant mt-0.5">Existing Entries</span>
                </div>
              </div>

              {/* Impact Badges Grid */}
              <div className="grid grid-cols-3 gap-2 mt-1">
                <div className="flex items-center gap-2 p-2 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Plus size={12} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-[8px] font-bold text-nb-on-surface-variant uppercase tracking-wider">New</span>
                    <span className="block text-xs font-black text-emerald-600 dark:text-emerald-400 leading-none mt-0.5">{derivedCounts.newEntries}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                  <div className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <RefreshCw size={12} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-[8px] font-bold text-nb-on-surface-variant uppercase tracking-wider">Replaced</span>
                    <span className="block text-xs font-black text-amber-600 dark:text-amber-400 leading-none mt-0.5">{derivedCounts.replaced}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2 bg-red-500/5 border border-red-500/20 rounded-xl">
                  <div className="w-6 h-6 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                    <Trash2 size={12} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-[8px] font-bold text-nb-on-surface-variant uppercase tracking-wider">Deleted</span>
                    <span className="block text-xs font-black text-red-600 dark:text-red-400 leading-none mt-0.5">{derivedCounts.deleted}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Action Callout */}
            <div className="mb-6 flex items-start gap-3 p-4 bg-nb-surface-low border border-nb-outline-variant/15 rounded-2xl">
              <Info size={16} className="text-nb-primary shrink-0 mt-0.5" />
              <div className="text-xs text-nb-on-surface-variant leading-relaxed">
                Click <strong className="text-nb-on-surface">Confirm Import</strong> to instantly merge notebook entries, team details, and timelines into your current workspace using recommended standard settings.
              </div>
            </div>

            {/* Advanced Options Accordion */}
            <div className="border border-nb-outline-variant/20 rounded-2xl overflow-hidden mb-6 bg-nb-surface-low/40">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between p-4 cursor-pointer hover:bg-nb-surface-low transition-colors select-none group"
              >
                <div className="flex items-center gap-2.5">
                  <Settings size={16} className={`text-nb-on-surface-variant group-hover:text-nb-primary transition-colors ${showAdvanced ? 'rotate-45' : ''}`} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-nb-on-surface">
                    Advanced Options
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-black uppercase tracking-wider text-nb-on-surface-variant bg-nb-surface-mid px-2 py-0.5 rounded">
                    Customize Overwrites
                  </span>
                  {showAdvanced ? <ChevronUp size={16} className="text-nb-on-surface-variant" /> : <ChevronDown size={16} className="text-nb-on-surface-variant" />}
                </div>
              </button>

              {showAdvanced && (
                <div className="p-4 border-t border-nb-outline-variant/10 flex flex-col gap-4 bg-nb-surface-low/80 animate-in slide-in-from-top-2 duration-300">
                  
                  {/* 1. Entry Merge Mode Selection */}
                  {entriesToImport > 0 && (
                    <div className="flex flex-col gap-1.5 p-3.5 bg-nb-surface border border-nb-outline-variant/10 rounded-xl">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-nb-on-surface">
                          Import Entry Mode
                        </span>
                        <Layers size={14} className="text-nb-on-surface-variant/40" />
                      </div>
                      <p className="text-[10px] text-nb-on-surface-variant leading-relaxed font-medium mt-0.5">
                        Choose how to merge incoming notebook entries with your existing entries.
                      </p>
                      <select
                        value={entryImportMode}
                        onChange={e => setEntryImportMode(e.target.value as EntryImportMode)}
                        className="w-full rounded-xl border border-nb-outline-variant/30 bg-nb-surface-low px-3 py-2.5 text-xs font-semibold text-nb-on-surface outline-none focus:border-nb-primary mt-1.5"
                      >
                        <option value="replace">Replace (Overwrites matches, keeps others)</option>
                        <option value="keep">Keep Both (Appends all as duplicates)</option>
                        <option value="clear">Clear & Overwrite (Deletes current workspace first)</option>
                        <option value="none">None (Skip entries, import metadata only)</option>
                      </select>
                    </div>
                  )}

                  {/* 2. Team Data Checkbox */}
                  {allowTeamImport && (
                    <label className="flex items-start gap-3.5 p-3.5 bg-nb-surface border border-nb-outline-variant/10 rounded-xl cursor-pointer hover:border-nb-outline-variant/30 transition-all select-none">
                      <input
                        type="checkbox"
                        checked={importTeam}
                        disabled={!allowTeamImport}
                        onChange={e => setImportTeam(e.target.checked)}
                        className="h-4 w-4 rounded border-nb-outline-variant/50 text-nb-primary focus:ring-nb-primary disabled:cursor-not-allowed disabled:opacity-40 mt-0.5 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-widest text-nb-on-surface">
                            Import Team Identity Data
                          </span>
                          <Users size={14} className="text-nb-on-surface-variant/40" />
                        </div>
                        <p className="text-[10px] text-nb-on-surface-variant leading-relaxed mt-1 font-medium">
                          Overwrite team name, team number, members list, and branding logos with data from the package.
                        </p>
                      </div>
                    </label>
                  )}

                  {/* 3. Phase Data Checkbox */}
                  {allowPhaseImport && (
                    <label className="flex items-start gap-3.5 p-3.5 bg-nb-surface border border-nb-outline-variant/10 rounded-xl cursor-pointer hover:border-nb-outline-variant/30 transition-all select-none">
                      <input
                        type="checkbox"
                        checked={importPhases}
                        disabled={!allowPhaseImport}
                        onChange={e => setImportPhases(e.target.checked)}
                        className="h-4 w-4 rounded border-nb-outline-variant/50 text-nb-primary focus:ring-nb-primary disabled:cursor-not-allowed disabled:opacity-40 mt-0.5 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-widest text-nb-on-surface">
                            Import Phase Data
                          </span>
                          <Palette size={14} className="text-nb-on-surface-variant/40" />
                        </div>
                        <p className="text-[10px] text-nb-on-surface-variant leading-relaxed mt-1 font-medium">
                          Overwrite customized project timeline phases, color codes, and milestones with data from the package.
                        </p>
                      </div>
                    </label>
                  )}

                  {/* 4. Project Templates (Only shown if detected) */}
                  {(hasMainTex || hasStyles || hasFonts) && (
                    <div className="border border-nb-outline-variant/10 bg-nb-surface rounded-xl overflow-hidden">
                      <div 
                        onClick={() => setImportProjectFiles(!importProjectFiles)}
                        className="flex items-start gap-3.5 p-3.5 cursor-pointer hover:bg-nb-surface-low/30 transition-all select-none"
                      >
                        <input
                          type="checkbox"
                          checked={importProjectFiles}
                          onChange={(e) => setImportProjectFiles(e.target.checked)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-nb-outline-variant/50 text-nb-primary focus:ring-nb-primary cursor-pointer mt-0.5"
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-widest text-nb-on-surface">
                              Custom Templates & Layout Files
                            </span>
                            <FileCode size={14} className="text-nb-on-surface-variant/40" />
                          </div>
                          <p className="text-[10px] text-nb-on-surface-variant leading-relaxed mt-1 font-medium">
                            Detected custom template files in the ZIP archive. Check this to enable granular overwriting of styles or compile configuration files.
                          </p>
                        </div>
                      </div>

                      {importProjectFiles && (
                        <div className="px-4 pb-4 pt-2 bg-nb-surface-low/40 border-t border-nb-outline-variant/10 flex flex-col gap-3 animate-in slide-in-from-top-1 duration-200">
                          {hasMainTex && (
                            <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
                              <div>
                                <span className="block text-[9px] font-black uppercase tracking-widest text-nb-on-surface">Overwrite main.tex</span>
                                <span className="block text-[9px] text-nb-on-surface-variant font-medium mt-0.5">Use the package's primary compilation layout file.</span>
                              </div>
                              <input
                                type="checkbox"
                                checked={overwriteMainTex}
                                onChange={(e) => setOverwriteMainTex(e.target.checked)}
                                className="h-4 w-4 rounded border-nb-outline-variant/50 text-nb-primary focus:ring-nb-primary shrink-0"
                              />
                            </label>
                          )}
                          {hasStyles && (
                            <label className="flex items-center justify-between gap-4 cursor-pointer select-none border-t border-nb-outline-variant/10 pt-3">
                              <div>
                                <span className="block text-[9px] font-black uppercase tracking-widest text-nb-on-surface">Overwrite Stylesheet (notebook.sty)</span>
                                <span className="block text-[9px] text-nb-on-surface-variant font-medium mt-0.5">Overwrite custom margins, headers, and element styles.</span>
                              </div>
                              <input
                                type="checkbox"
                                checked={overwriteStyles}
                                onChange={(e) => setOverwriteStyles(e.target.checked)}
                                className="h-4 w-4 rounded border-nb-outline-variant/50 text-nb-primary focus:ring-nb-primary shrink-0"
                              />
                            </label>
                          )}
                          {hasFonts && (
                            <label className="flex items-center justify-between gap-4 cursor-pointer select-none border-t border-nb-outline-variant/10 pt-3">
                              <div>
                                <span className="block text-[9px] font-black uppercase tracking-widest text-nb-on-surface">Overwrite Custom Fonts</span>
                                <span className="block text-[9px] text-nb-on-surface-variant font-medium mt-0.5">Overwrite workspace typography with package assets.</span>
                              </div>
                              <input
                                type="checkbox"
                                checked={overwriteFonts}
                                onChange={(e) => setOverwriteFonts(e.target.checked)}
                                className="h-4 w-4 rounded border-nb-outline-variant/50 text-nb-primary focus:ring-nb-primary shrink-0"
                              />
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex gap-3 justify-end mt-6 border-t border-nb-outline-variant/10 pt-4">
              <button
                onClick={onCancel}
                className="px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-nb-outline-variant/30 text-nb-on-surface-variant hover:bg-nb-surface-low hover:text-nb-on-surface transition-all duration-200 cursor-pointer active:scale-95 shrink-0"
              >
                Cancel
              </button>
              <button
                onClick={() => onConfirm({
                  entryImportMode,
                  overwriteTeam: importTeam,
                  overwritePhases: importPhases,
                  importProjectFiles,
                  overwriteMainTex: importProjectFiles && overwriteMainTex,
                  overwriteStyles: importProjectFiles && overwriteStyles,
                  overwriteFonts: importProjectFiles && overwriteFonts,
                })}
                className="px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-nb-primary text-white hover:bg-nb-primary-dim shadow-lg shadow-nb-primary/20 hover:shadow-nb-primary/30 transition-all duration-200 cursor-pointer active:scale-95 flex-1 text-center font-bold"
              >
                Confirm Import
              </button>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}
