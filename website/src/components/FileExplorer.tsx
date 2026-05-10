"use client";

import React, { useState } from "react";
import {
  FileText, Plus, X, Calendar, SortAsc, SortDesc, CalendarDays,
  Search, ChevronDown, ExternalLink, Trash2, FileJson, FileCode,
  Download
} from "lucide-react";
import ValidationTooltip from "./ValidationTooltip";

// ─── Types ────────────────────────────────────────────────────────────────────

import { ExplorerFile } from "@/lib/types";
import { getPhases, getPhaseConfig } from "@/lib/phases";
import { NotebookMetadata } from "@/lib/metadata";

interface FileExplorerProps {
  entries: ExplorerFile[];
  activePath: string | null;
  selectedPaths: Set<string>;
  pendingPaths: Set<string>;
  deletedPaths: Set<string>;
  onSelectEntry: (file: ExplorerFile, multi: boolean, range: boolean) => void;
  onOpenEntry: (file: ExplorerFile) => void;
  onCloseEntry: (path: string) => void;
  onDownloadLatex: (file: ExplorerFile) => void;
  onDownloadJson: (file: ExplorerFile) => void;
  onDeleteEntry: (file: ExplorerFile) => void;
  onDownloadMulti: (files: ExplorerFile[]) => void;
  onDeleteMulti: (files: ExplorerFile[]) => void;
  onNewEntry: () => void;
  search: string;
  onSearchChange: (val: string) => void;
  sortBy: "date" | "title";
  onSortChange: (val: "date" | "title") => void;
  sortDirection: "asc" | "desc";
  onSortDirectionToggle: () => void;
  dateRange: { start: string; end: string } | null;
  onDateRangeChange: (range: { start: string; end: string } | null) => void;
  notebookMetadata?: NotebookMetadata;
}

// ─── Single file row ──────────────────────────────────────────────────────────

interface FileRowProps {
  file: ExplorerFile;
  isOpened: boolean;
  isSelected: boolean;
  isPending: boolean;
  isDeleted: boolean;
  icon: React.ReactNode;
  isValid?: boolean;
  validationErrors?: string[];
  sortBy: "date" | "title";
  onSelect: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function FileRow({
  file, isOpened, isSelected, isPending, isDeleted, icon, isValid = true, validationErrors = [],
  onSelect, onDoubleClick, onContextMenu
}: FileRowProps) {
  return (
    <div
      onClick={isDeleted ? undefined : onSelect}
      onDoubleClick={isDeleted ? undefined : onDoubleClick}
      onContextMenu={isDeleted ? undefined : onContextMenu}
      className={`
        group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer select-none border-2
        ${isOpened
          ? 'bg-nb-tertiary text-white shadow-lg shadow-nb-tertiary/20 border-nb-tertiary'
          : isSelected
            ? 'bg-nb-surface-mid border-nb-tertiary/50 text-nb-on-surface'
            : 'bg-transparent border-transparent hover:bg-nb-surface-mid text-nb-on-surface'
        }
        ${isDeleted ? 'opacity-30 grayscale' : ''}
      `}
    >
      <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all ${isOpened ? 'bg-white/20 text-white' : isSelected ? 'bg-nb-tertiary/10 text-nb-tertiary' : 'bg-nb-surface-low text-nb-tertiary'}`}>
        {icon}
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        <span className={`truncate font-bold tracking-tight leading-tight ${isOpened ? 'text-white' : 'text-nb-on-surface'}`}>
          {file.title || "Untitled Entry"}
        </span>
        <span className={`text-[9px] font-mono truncate mt-0.5 ${isOpened ? 'text-white/70' : 'opacity-40'}`}>
          {(() => {
            const dateStr = file.date || file.timestamp?.split('T')[0] || "Unknown Date";
            return "Date: " + dateStr;
          })()}
        </span>
      </div>

      {/* Validation Warning */}
      {!isValid && !isDeleted && (
        <ValidationTooltip
          errors={validationErrors.length > 0 ? validationErrors : ["Incomplete entry metadata or resource captions"]}
          size={12}
          iconContainerClassName={`w-6 h-6 rounded-lg ${isOpened ? 'bg-white/20 text-white' : 'bg-amber-500/10 text-amber-500'}`}
        />
      )}

      {/* Pending dot */}
      {isPending && !isDeleted && (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 animate-pulse shadow-sm ${isOpened ? 'bg-white' : 'bg-nb-tertiary shadow-nb-tertiary/50'}`} title="Staged change" />
      )}
    </div>
  );
}

// ─── Pane ─────────────────────────────────────────────────────────────────────

interface PaneProps {
  id: string;
  title: string;
  actionLabel: string;
  actionIcon: React.ReactNode;
  onAction: () => void;
  children: React.ReactNode;
  empty: string;
  hasItems: boolean;
}

function Pane({ id, title, actionLabel, actionIcon, onAction, children, empty, hasItems }: PaneProps) {
  return (
    <div id={id} className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center justify-between px-4 py-3 border-b border-nb-surface-mid dark:border-nb-dark-outline-variant shrink-0 bg-nb-surface-low/50 dark:bg-nb-dark-surface-low/30">
        <span className="text-sm font-semibold text-nb-on-surface">
          {title}
        </span>
        <button
          onClick={onAction}
          title={actionLabel}
          className="flex items-center gap-1.5 text-xs font-semibold text-nb-tertiary hover:text-nb-tertiary-dim transition-colors cursor-pointer"
        >
          {actionIcon}
          {actionLabel}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2.5 min-h-0 bg-nb-surface-lowest dark:bg-nb-dark-bg">
        {hasItems ? children : (
          <p className="text-[11px] text-nb-on-surface-variant/60 dark:text-nb-dark-on-variant/40 px-3 py-5 italic font-medium tracking-tight">{empty}</p>
        )}
      </div>
    </div>
  );
}

export default function FileExplorer({
  entries,
  activePath,
  selectedPaths,
  pendingPaths,
  deletedPaths,
  onSelectEntry,
  onOpenEntry,
  onCloseEntry,
  onDownloadLatex,
  onDownloadJson,
  onDeleteEntry,
  onDownloadMulti,
  onDeleteMulti,
  onNewEntry,
  search,
  onSearchChange,
  sortBy,
  onSortChange,
  sortDirection,
  onSortDirectionToggle,
  dateRange,
  onDateRangeChange,
  notebookMetadata
}: FileExplorerProps) {
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, file: ExplorerFile } | null>(null);

  const availablePhases = getPhases(notebookMetadata?.phases);
  const phaseConfig = getPhaseConfig(availablePhases);

  const handleContextMenu = (e: React.MouseEvent, file: ExplorerFile) => {
    e.preventDefault();
    // If clicking a file not in selection, select it exclusively first
    if (!selectedPaths.has(file.path)) {
      onSelectEntry(file, false, false);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  };

  const selectedEntries = entries.filter(e => selectedPaths.has(e.path));

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0" onClick={() => setContextMenu(null)}>
      {/* Search and Sort Header */}
      <div className="px-3 py-3 bg-nb-surface border-b border-nb-outline-variant space-y-3 shrink-0">
        <div className="relative group">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-nb-on-surface-variant/40 group-focus-within:text-nb-primary transition-colors">
            <Search size={14} />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search entries..."
            className="w-full bg-nb-surface-low border border-nb-outline-variant rounded-xl py-2 pl-9 pr-4 text-xs font-medium placeholder:text-nb-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-nb-primary/20 focus:border-nb-primary transition-all"
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute inset-y-0 right-3 flex items-center text-nb-on-surface-variant/40 hover:text-nb-primary transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Sort Dropdown */}
          <div className="relative flex-1">
            <button
              onClick={(e) => { e.stopPropagation(); setIsSortOpen(!isSortOpen); }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-nb-surface-low border border-nb-outline-variant rounded-xl text-[10px] font-bold tracking-wider text-nb-on-surface-variant hover:border-nb-primary transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2">
                {sortBy === 'date' ? <Calendar size={12} /> : <SortAsc size={12} />}
                <span>Sort: {sortBy === 'date' ? 'Date' : 'Title'}</span>
              </div>
              <ChevronDown size={12} className={`transition-transform duration-200 ${isSortOpen ? 'rotate-180' : ''}`} />
            </button>

            {isSortOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsSortOpen(false)} />
                <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-nb-surface border border-nb-outline-variant rounded-xl shadow-nb-lg py-1.5 animate-in fade-in zoom-in-95 duration-200">
                  {[
                    { id: 'date' as const, label: 'Date', icon: <Calendar size={12} /> },
                    { id: 'title' as const, label: 'Title', icon: <SortAsc size={12} /> }
                  ].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        onSortChange(s.id);
                        setIsSortOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-[10px] font-bold tracking-wider transition-colors cursor-pointer ${sortBy === s.id ? 'text-nb-primary bg-nb-primary/5' : 'text-nb-on-surface-variant/70 hover:bg-nb-surface-low'}`}
                    >
                      {s.icon}
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Direction Toggle */}
          <button
            onClick={onSortDirectionToggle}
            className="p-2 bg-nb-surface-low border border-nb-outline-variant rounded-xl text-nb-on-surface-variant hover:text-nb-primary hover:border-nb-primary transition-all shadow-sm active:scale-95 cursor-pointer"
            title={sortDirection === 'asc' ? "Ascending" : "Descending"}
          >
            {sortDirection === 'asc' ? <SortAsc size={14} /> : <SortDesc size={14} />}
          </button>

          {/* Date Filter */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setIsFilterOpen(!isFilterOpen); }}
              className={`p-2 cursor-pointer border rounded-xl transition-all shadow-sm active:scale-95 ${dateRange ? 'bg-nb-tertiary text-white border-nb-tertiary shadow-nb-tertiary/20' : 'bg-nb-surface-low border-nb-outline-variant text-nb-on-surface-variant hover:text-nb-primary hover:border-nb-primary'}`}
              title="Filter by Date"
            >
              <CalendarDays size={14} />
            </button>

            {isFilterOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsFilterOpen(false)} />
                <div className="absolute top-full right-0 mt-2 z-50 bg-nb-surface border border-nb-outline-variant rounded-2xl shadow-nb-lg p-4 w-64 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-[10px] font-bold tracking-widest text-nb-on-surface-variant">Date Range</h4>
                    {dateRange && (
                      <button
                        onClick={() => { onDateRangeChange(null); setIsFilterOpen(false); }}
                        className="text-[9px] font-bold text-nb-primary hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-nb-on-surface-variant/50 ml-1">From</label>
                      <input
                        type="date"
                        value={dateRange?.start || ""}
                        onChange={(e) => onDateRangeChange({ start: e.target.value, end: dateRange?.end || "" })}
                        className="w-full bg-nb-surface-low border border-nb-outline-variant rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-nb-primary/20 focus:border-nb-primary outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-nb-on-surface-variant/50 ml-1">To</label>
                      <input
                        type="date"
                        value={dateRange?.end || ""}
                        onChange={(e) => onDateRangeChange({ start: dateRange?.start || "", end: e.target.value })}
                        className="w-full bg-nb-surface-low border border-nb-outline-variant rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-nb-primary/20 focus:border-nb-primary outline-none transition-all"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => setIsFilterOpen(false)}
                    className="w-full cursor-pointer mt-4 py-2 bg-nb-primary text-white rounded-xl text-[10px] font-bold tracking-widest hover:bg-nb-primary-dim transition-all shadow-md shadow-nb-primary/20"
                  >
                    Apply Filter
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Entries pane */}
      <Pane
        id="explorer-entries-pane"
        title="Entries"
        actionLabel="New"
        actionIcon={<Plus size={11} />}
        onAction={onNewEntry}
        empty={search ? "No matches found." : "No entries yet."}
        hasItems={entries.length > 0}
      >
        <div className="space-y-1">
          {entries.map((f) => {
            const pConfig = f.phase && phaseConfig[f.phase] ? phaseConfig[f.phase] : null;
            const IconComponent = pConfig ? pConfig.icon : FileText;
            const phase = availablePhases.find(p => p.index === f.phase);
            const iconStyle = phase ? { color: phase.color } : undefined;

            const icon = (
              <IconComponent
                size={16}
                style={activePath === f.path ? { color: "inherit" } : iconStyle}
                className={activePath === f.path ? "" : pConfig ? "" : "opacity-40"}
              />
            );

            return (
              <FileRow
                key={f.path}
                file={f}
                isOpened={activePath === f.path}
                isSelected={selectedPaths.has(f.path)}
                isPending={pendingPaths.has(f.path)}
                isDeleted={deletedPaths.has(f.path)}
                icon={icon}
                isValid={f.isValid}
                validationErrors={f.validationErrors}
                sortBy={sortBy}
                onSelect={(e) => onSelectEntry(f, e.ctrlKey || e.metaKey, e.shiftKey)}
                onDoubleClick={() => onOpenEntry(f)}
                onContextMenu={(e) => handleContextMenu(e, f)}
              />
            );
          })}
        </div>
      </Pane>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[1100]" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div
            className="fixed z-[1200] w-48 bg-nb-surface border border-nb-outline-variant rounded-2xl shadow-2xl py-2 animate-in fade-in zoom-in-95 duration-200"
            style={{ left: Math.min(contextMenu.x, window.innerWidth - 200), top: Math.min(contextMenu.y, window.innerHeight - 250) }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-nb-outline-variant/30 mb-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-nb-on-surface-variant truncate">
                {selectedPaths.size > 1 ? `${selectedPaths.size} Items Selected` : (contextMenu.file.title || "Untitled Entry")}
              </p>
            </div>

            {selectedPaths.size <= 1 ? (
              <>
                <button
                  onClick={() => { onOpenEntry(contextMenu.file); setContextMenu(null); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-nb-on-surface hover:bg-nb-surface-low transition-colors cursor-pointer"
                >
                  <ExternalLink size={14} className="text-nb-primary" />
                  Open Entry
                </button>

                {activePath === contextMenu.file.path && (
                  <button
                    onClick={() => { onCloseEntry(contextMenu.file.path); setContextMenu(null); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-nb-on-surface hover:bg-nb-surface-low transition-colors cursor-pointer"
                  >
                    <X size={14} className="text-nb-on-surface-variant" />
                    Close Entry
                  </button>
                )}

                <div className="h-px bg-nb-outline-variant/30 my-1" />

                <button
                  onClick={() => { onDownloadJson(contextMenu.file); setContextMenu(null); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-nb-on-surface hover:bg-nb-surface-low transition-colors cursor-pointer"
                >
                  <FileJson size={14} className="text-nb-tertiary" />
                  Download JSON
                </button>

                <button
                  onClick={() => { onDownloadLatex(contextMenu.file); setContextMenu(null); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-nb-on-surface hover:bg-nb-surface-low transition-colors cursor-pointer"
                >
                  <FileCode size={14} className="text-nb-tertiary" />
                  Download LaTeX
                </button>

                <div className="h-px bg-nb-outline-variant/30 my-1" />

                <button
                  onClick={() => { onDeleteEntry(contextMenu.file); setContextMenu(null); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-500/5 transition-colors cursor-pointer"
                >
                  <Trash2 size={14} />
                  Delete Entry
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { onDownloadMulti(selectedEntries); setContextMenu(null); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-nb-on-surface hover:bg-nb-surface-low transition-colors cursor-pointer"
                >
                  <Download size={14} className="text-nb-tertiary" />
                  Export Entries ({selectedPaths.size})
                </button>

                <div className="h-px bg-nb-outline-variant/30 my-1" />

                <button
                  onClick={() => { onDeleteMulti(selectedEntries); setContextMenu(null); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-500/5 transition-colors cursor-pointer"
                >
                  <Trash2 size={14} />
                  Delete {selectedPaths.size} Entries
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
