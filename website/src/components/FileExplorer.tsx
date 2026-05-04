"use client";

import React, { useState } from "react";
import {
  FileText, Image as ImageIcon, Pencil, Trash2, Plus, Upload, Check, X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExplorerFile {
  name: string;
  path: string;
  title?: string;
  author?: string;
  timestamp?: string;
  updatedAt?: string;
  isValid?: boolean;
}

interface FileExplorerProps {
  entries: ExplorerFile[];
  resources: ExplorerFile[];
  activePath: string | null;
  pendingPaths: Set<string>;   // paths with staged (unsaved) changes — shown with dot badge
  deletedPaths: Set<string>;   // paths staged for deletion — shown with strikethrough
  onSelectEntry: (file: ExplorerFile) => void;
  onSelectResource: (file: ExplorerFile) => void;
  onNewEntry: () => void;
  onUploadResource: () => void;
  search: string;
  onSearchChange: (val: string) => void;
  sortBy: "created" | "updated" | "title";
  onSortChange: (val: "created" | "updated" | "title") => void;
  sortDirection: "asc" | "desc";
  onSortDirectionToggle: () => void;
  dateRange: { start: string; end: string } | null;
  onDateRangeChange: (range: { start: string; end: string } | null) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"]);

function extOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function isImageFile(name: string) {
  return IMAGE_EXTS.has(extOf(name));
}

// ─── Single file row ──────────────────────────────────────────────────────────

interface FileRowProps {
  file: ExplorerFile;
  isSelected: boolean;
  isPending: boolean;
  isDeleted: boolean;
  icon: React.ReactNode;
  isValid?: boolean;
  onSelect: () => void;
}

function FileRow({ file, isSelected, isPending, isDeleted, icon, isValid = true, onSelect }: FileRowProps) {
  return (
    <div
      onClick={isDeleted ? undefined : onSelect}
      className={`
        group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer select-none
        ${isSelected 
          ? 'bg-nb-tertiary text-white shadow-lg shadow-nb-tertiary/20' 
          : 'hover:bg-nb-surface-mid text-nb-on-surface'
        }
        ${isDeleted ? 'opacity-30 grayscale' : ''}
      `}
    >
      <div className={`shrink-0 ${isSelected ? 'text-white' : 'text-nb-tertiary'}`}>
        {icon}
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        <span className={`truncate font-bold tracking-tight leading-tight ${isSelected ? 'text-white' : 'text-nb-on-surface'}`}>
          {file.title || "New Entry"}
        </span>
        <span className={`text-[9px] font-mono truncate mt-0.5 ${isSelected ? 'text-white/70' : 'opacity-40'}`}>
           {(() => {
             const ts = file.updatedAt || file.timestamp || Date.now();
             const d = new Date(ts);
             const valid = !isNaN(d.getTime());
             return (valid ? d : new Date()).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
           })()}
        </span>
      </div>

      {/* Validation Warning */}
      {!isValid && !isDeleted && (
        <div 
          className={`shrink-0 w-6 h-6 rounded-lg flex items-center justify-center animate-pulse ${isSelected ? 'bg-white/20 text-white' : 'bg-amber-500/10 text-amber-500'}`} 
          title="Incomplete entry metadata or resource captions"
        >
          <AlertTriangle size={12} />
        </div>
      )}

      {/* Pending dot */}
      {isPending && !isDeleted && (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 animate-pulse shadow-sm ${isSelected ? 'bg-white' : 'bg-nb-tertiary shadow-nb-tertiary/50'}`} title="Staged change" />
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
          className="flex items-center gap-1.5 text-xs font-semibold text-nb-tertiary hover:text-nb-tertiary-dim transition-colors"
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


// ── Icons for pane ────────────────────────────────────────────────────────────

import { AlertTriangle, Search, SortAsc, SortDesc, Clock, Calendar, Filter, ChevronDown, CalendarDays } from "lucide-react";

// ─── Main component ───────────────────────────────────────────────────────────

export default function FileExplorer({
  entries,
  resources,
  activePath,
  pendingPaths,
  deletedPaths,
  onSelectEntry,
  onSelectResource,
  onNewEntry,
  onUploadResource,
  search,
  onSearchChange,
  sortBy,
  onSortChange,
  sortDirection,
  onSortDirectionToggle,
  dateRange,
  onDateRangeChange,
}: FileExplorerProps) {
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  return (
    <div className="flex flex-col h-full overflow-hidden">
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
              onClick={() => setIsSortOpen(!isSortOpen)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-nb-surface-low border border-nb-outline-variant rounded-xl text-[10px] font-bold uppercase tracking-wider text-nb-on-surface-variant hover:border-nb-primary transition-all"
            >
              <div className="flex items-center gap-2">
                {sortBy === 'updated' ? <Clock size={12} /> : sortBy === 'created' ? <Calendar size={12} /> : <SortAsc size={12} />}
                <span>Sort: {sortBy}</span>
              </div>
              <ChevronDown size={12} className={`transition-transform duration-200 ${isSortOpen ? 'rotate-180' : ''}`} />
            </button>

            {isSortOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsSortOpen(false)} />
                <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-nb-surface border border-nb-outline-variant rounded-xl shadow-nb-lg py-1.5 animate-in fade-in zoom-in-95 duration-200">
                  {[
                    { id: 'updated', label: 'Recently Modified', icon: <Clock size={12} /> },
                    { id: 'created', label: 'Creation Date', icon: <Calendar size={12} /> },
                    { id: 'title', label: 'Alphabetical', icon: <SortAsc size={12} /> }
                  ].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        onSortChange(s.id as any);
                        setIsSortOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${sortBy === s.id ? 'text-nb-primary bg-nb-primary/5' : 'text-nb-on-surface-variant/70 hover:bg-nb-surface-low'}`}
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
            className="p-2 bg-nb-surface-low border border-nb-outline-variant rounded-xl text-nb-on-surface-variant hover:text-nb-primary hover:border-nb-primary transition-all shadow-sm active:scale-95"
            title={sortDirection === 'asc' ? "Ascending" : "Descending"}
          >
            {sortDirection === 'asc' ? <SortAsc size={14} /> : <SortDesc size={14} />}
          </button>

          {/* Date Filter */}
          <div className="relative">
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`p-2 border rounded-xl transition-all shadow-sm active:scale-95 ${dateRange ? 'bg-nb-tertiary text-white border-nb-tertiary shadow-nb-tertiary/20' : 'bg-nb-surface-low border-nb-outline-variant text-nb-on-surface-variant hover:text-nb-primary hover:border-nb-primary'}`}
              title="Filter by Date"
            >
              <CalendarDays size={14} />
            </button>

            {isFilterOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsFilterOpen(false)} />
                <div className="absolute top-full right-0 mt-2 z-50 bg-nb-surface border border-nb-outline-variant rounded-2xl shadow-nb-lg p-4 w-64 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-nb-on-surface-variant">Date Range</h4>
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
                      <label className="text-[9px] font-bold text-nb-on-surface-variant/50 uppercase ml-1">From</label>
                      <input 
                        type="date"
                        value={dateRange?.start || ""}
                        onChange={(e) => onDateRangeChange({ start: e.target.value, end: dateRange?.end || "" })}
                        className="w-full bg-nb-surface-low border border-nb-outline-variant rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-nb-primary/20 focus:border-nb-primary outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-nb-on-surface-variant/50 uppercase ml-1">To</label>
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
                    className="w-full mt-4 py-2 bg-nb-primary text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-nb-primary-dim transition-all shadow-md shadow-nb-primary/20"
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
        {entries.map((f) => (
          <FileRow
            key={f.path}
            file={f}
            isSelected={activePath === f.path}
            isPending={pendingPaths.has(f.path)}
            isDeleted={deletedPaths.has(f.path)}
            icon={<FileText size={13} />}
            isValid={f.isValid}
            onSelect={() => onSelectEntry(f)}
          />
        ))}
      </Pane>

      {/* Resources pane hidden to simplify UI */}
    </div>
  );
}
