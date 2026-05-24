"use client";

import React from "react";
import { ShieldAlert, Check, X, ArrowLeft, RefreshCw, Plus, Trash2, Users, Palette, FileCode, CheckSquare } from "lucide-react";
import { ImportOptions } from "@/lib/store/types";

interface ImportConfirmDialogProps {
  isOpen: boolean;
  options: ImportOptions;
  currentEntries: number;
  entriesToImport: number;
  entriesReplaced: number;
  newEntries: number;
  allowTeamImport: boolean;
  allowPhaseImport: boolean;
  hasMainTex: boolean;
  hasStyles: boolean;
  hasFonts: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onBack: () => void;
}

export default function ImportConfirmDialog({
  isOpen,
  options,
  currentEntries,
  entriesToImport,
  entriesReplaced,
  newEntries,
  allowTeamImport,
  allowPhaseImport,
  hasMainTex,
  hasStyles,
  hasFonts,
  onConfirm,
  onCancel,
  onBack,
}: ImportConfirmDialogProps) {
  if (!isOpen) return null;

  const derivedCounts = (() => {
    if (options.entryImportMode === "none") {
      return { deleted: 0, replaced: 0, newEntries: 0 };
    }
    if (options.entryImportMode === "keep") {
      return { deleted: 0, replaced: 0, newEntries: entriesToImport };
    }
    if (options.entryImportMode === "clear") {
      return { deleted: currentEntries, replaced: 0, newEntries: entriesToImport };
    }
    return {
      deleted: 0,
      replaced: entriesReplaced,
      newEntries,
    };
  })();

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/80 backdrop-blur-md px-4 animate-in fade-in duration-300"
      onClick={onCancel}
    >
      {/* Outer Card: enforces rounded corners and masks the scrollbar */}
      <div
        className="relative w-full max-w-md max-h-[85vh] overflow-hidden bg-nb-surface border border-nb-outline-variant/40 rounded-[32px] shadow-[0_24px_50px_-12px_rgba(0,0,0,0.6)] overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Offset Wrapper: pushes the scroll container and its scrollbar 16px (pr-4) away from the right border and 16px (py-4) vertically to prevent rounded corner clipping */}
        <div className="py-4 pr-4 pl-1 w-full">
          {/* Scroll Container: explicit max-height ensures the browser ALWAYS triggers the scrollbar internally */}
          <div className="overflow-y-auto max-h-[80vh] w-full p-6 pr-4 pt-8">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-nb-outline-variant/10 mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center shrink-0 shadow-inner">
                  <ShieldAlert size={24} className="animate-pulse" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-black text-nb-on-surface uppercase tracking-widest font-bold">Final Verification</h3>
                  <p className="text-[10px] text-nb-on-surface-variant font-black uppercase tracking-widest mt-0.5 opacity-70">
                    Review operations before overwrite
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

            <div className="mb-6">
              <p className="text-xs text-nb-on-surface-variant leading-relaxed mb-4 font-medium">
                You are about to commit the following operations to your active workspace. This action <strong>cannot be undone</strong>. Please verify that the operations listed below are correct:
              </p>

              <div className="flex flex-col gap-3">
                {/* 1. Entry Action Card */}
                <div className="p-4 rounded-2xl bg-nb-surface-low/80 border border-nb-outline-variant/15 flex flex-col gap-3">
                  <div className="flex items-center gap-2 border-b border-nb-outline-variant/10 pb-2">
                    <CheckSquare size={14} className="text-nb-primary" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-nb-on-surface">Notebook Entries</span>
                  </div>
                  
                  {options.entryImportMode === "clear" && (
                    <div className="flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400 font-semibold leading-relaxed">
                      <Trash2 size={16} className="shrink-0 mt-0.5" />
                      <div>
                        <span className="block font-black uppercase text-[9px] tracking-wide">Wipe & Overwrite</span>
                        All <span className="underline">{currentEntries}</span> existing entries in your current workspace will be <strong>deleted forever</strong> and replaced by <span className="underline">{entriesToImport}</span> entries.
                      </div>
                    </div>
                  )}

                  {options.entryImportMode === "keep" && (
                    <div className="flex items-start gap-2.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold leading-relaxed">
                      <Plus size={16} className="shrink-0 mt-0.5" />
                      <div>
                        <span className="block font-black uppercase text-[9px] tracking-wide">Append & Duplicate</span>
                        All <span className="underline">{entriesToImport}</span> incoming entries will be created as new entries. Existing workspace entries remain untouched.
                      </div>
                    </div>
                  )}

                  {options.entryImportMode === "replace" && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start gap-2.5 text-xs text-amber-600 dark:text-amber-400 font-semibold leading-relaxed">
                        <RefreshCw size={16} className="shrink-0 mt-0.5" />
                        <div>
                          <span className="block font-black uppercase text-[9px] tracking-wide">Merge & Replace</span>
                          <span className="underline">{derivedCounts.replaced}</span> matching entries will be <strong>overwritten</strong> with the new incoming versions.
                        </div>
                      </div>
                      {derivedCounts.newEntries > 0 && (
                        <div className="flex items-start gap-2.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold leading-relaxed border-t border-nb-outline-variant/5 pt-2">
                          <Plus size={16} className="shrink-0 mt-0.5" />
                          <div>
                            <span className="underline">{derivedCounts.newEntries}</span> entirely new entries will be created in your workspace.
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {options.entryImportMode === "none" && (
                    <div className="flex items-start gap-2.5 text-xs text-nb-on-surface-variant font-semibold leading-relaxed">
                      <X size={16} className="shrink-0 mt-0.5" />
                      <div>
                        <span className="block font-black uppercase text-[9px] tracking-wide">Skip Entries</span>
                        No entries will be modified or imported.
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Metadata Action Card */}
              {(options.overwriteTeam || options.overwritePhases) && (
                <div className="p-4 rounded-2xl bg-nb-surface-low/80 border border-nb-outline-variant/15 flex flex-col gap-3">
                  <div className="flex items-center gap-2 border-b border-nb-outline-variant/10 pb-2">
                    <Users size={14} className="text-nb-primary" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-nb-on-surface">Metadata Updates</span>
                  </div>

                  {options.overwriteTeam && allowTeamImport && (
                    <div className="flex items-start gap-2.5 text-xs text-nb-on-surface font-semibold leading-relaxed">
                      <Users size={16} className="text-nb-primary shrink-0 mt-0.5" />
                      <div>
                        <span className="block font-black uppercase text-[9px] tracking-wide text-nb-on-surface-variant">Team Profile Overwrite</span>
                        Overwrites team name, number, member listings, and branding logotypes.
                      </div>
                    </div>
                  )}

                  {options.overwritePhases && allowPhaseImport && (
                    <div className="flex items-start gap-2.5 text-xs text-nb-on-surface font-semibold leading-relaxed border-t border-nb-outline-variant/5 pt-2">
                      <Palette size={16} className="text-nb-primary shrink-0 mt-0.5" />
                      <div>
                        <span className="block font-black uppercase text-[9px] tracking-wide text-nb-on-surface-variant">Timeline Phases Overwrite</span>
                        Overwrites timelines, descriptions, and phases color-coding schemes.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 3. Custom Project Templates Action Card */}
              {options.importProjectFiles && (options.overwriteMainTex || options.overwriteStyles || options.overwriteFonts) && (
                <div className="p-4 rounded-2xl bg-nb-surface-low/80 border border-nb-outline-variant/15 flex flex-col gap-3">
                  <div className="flex items-center gap-2 border-b border-nb-outline-variant/10 pb-2">
                    <FileCode size={14} className="text-nb-primary" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-nb-on-surface">Template Overwrites</span>
                  </div>

                  {options.overwriteMainTex && hasMainTex && (
                    <div className="flex items-center gap-2.5 text-xs text-nb-on-surface font-semibold">
                      <FileCode size={14} className="text-nb-primary shrink-0" />
                      <span>Overwrite main document template (<code className="bg-nb-surface px-1.5 py-0.5 rounded text-[10px] border border-nb-outline-variant/10">main.tex</code>)</span>
                    </div>
                  )}

                  {options.overwriteStyles && hasStyles && (
                    <div className="flex items-center gap-2.5 text-xs text-nb-on-surface font-semibold border-t border-nb-outline-variant/5 pt-2">
                      <FileCode size={14} className="text-nb-primary shrink-0" />
                      <span>Overwrite customized LaTeX margins/styles (<code className="bg-nb-surface px-1.5 py-0.5 rounded text-[10px] border border-nb-outline-variant/10">notebook.sty</code>)</span>
                    </div>
                  )}

                  {options.overwriteFonts && hasFonts && (
                    <div className="flex items-center gap-2.5 text-xs text-nb-on-surface font-semibold border-t border-nb-outline-variant/5 pt-2">
                      <FileCode size={14} className="text-nb-primary shrink-0" />
                      <span>Overwrite custom font files (typography)</span>
                    </div>
                  )}
                </div>
              )}
            </div>
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
              onClick={onBack}
              className="px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-nb-outline-variant/30 text-nb-on-surface-variant hover:bg-nb-surface-low hover:text-nb-on-surface transition-all duration-200 cursor-pointer active:scale-95 shrink-0 flex items-center gap-1.5"
            >
              <ArrowLeft size={12} />
              Back
            </button>
            <button
              onClick={onConfirm}
              className="px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20 hover:shadow-red-600/30 transition-all duration-200 cursor-pointer active:scale-95 flex-1 text-center font-bold flex items-center justify-center gap-2"
            >
              <Check size={14} />
              Confirm & Import
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
);
}
