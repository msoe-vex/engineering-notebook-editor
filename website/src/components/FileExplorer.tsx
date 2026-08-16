import React, { useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  FileText, Plus, X, Calendar, SortAsc, SortDesc, CalendarDays,
  Search, ChevronDown, ChevronRight, ExternalLink, Trash2, FileJson, FileCode,
  Download, Copy, Layers, Sparkles
} from "lucide-react";
import ValidationTooltip from "./editor/ui/ValidationTooltip";

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
  onDuplicateEntry?: (file: ExplorerFile) => void;
  onSaveAsTemplate?: (file: ExplorerFile) => void;
  onCreateTemplate?: () => void;
  onCreateFromTemplate?: (templateId: string) => void;
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
  sortBy?: "date" | "title";
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
            const dateStr = file.date || file.timestamp?.split('T')[0];
            if (!dateStr) return "Unknown Date";
            const match = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
            if (match) {
              const y = parseInt(match[1], 10);
              const m = parseInt(match[2], 10) - 1;
              const d = parseInt(match[3], 10);
              const localDate = new Date(y, m, d);
              if (!isNaN(localDate.getTime())) {
                return localDate.toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric"
                });
              }
            }
            const parsed = new Date(dateStr);
            if (!isNaN(parsed.getTime())) {
              return parsed.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric"
              });
            }
            return dateStr;
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
  count?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  onAction?: () => void;
  actionComponent?: React.ReactNode;
  children: React.ReactNode;
  empty: React.ReactNode;
  hasItems: boolean;
  className?: string;
  maxHeight?: string;
}

function Pane({
  id,
  title,
  count,
  isCollapsed = false,
  onToggleCollapse,
  actionLabel,
  actionIcon,
  onAction,
  actionComponent,
  children,
  empty,
  hasItems,
  className = "flex-1",
  maxHeight
}: PaneProps) {
  return (
    <div id={id} className={`flex flex-col min-h-0 ${className}`}>
      <div
        onClick={onToggleCollapse}
        className={`flex items-center justify-between px-3 py-2 border-b border-nb-outline-variant/30 shrink-0 bg-nb-surface-low/60 hover:bg-nb-surface-low transition-colors select-none ${
          onToggleCollapse ? "cursor-pointer" : ""
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {onToggleCollapse && (
            isCollapsed ? (
              <ChevronRight size={12} className="text-nb-on-surface-variant/60 shrink-0" />
            ) : (
              <ChevronDown size={12} className="text-nb-on-surface-variant/60 shrink-0" />
            )
          )}
          <span className="text-[11px] font-black uppercase tracking-wider text-nb-on-surface truncate">
            {title}
          </span>
          {typeof count === "number" && (
            <span className="text-[9px] font-bold text-nb-on-surface-variant/70 bg-nb-surface-high/60 px-1.5 py-0.2 rounded-full shrink-0">
              {count}
            </span>
          )}
        </div>
        {actionComponent ? (
          actionComponent
        ) : actionLabel && onAction ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAction();
            }}
            title={actionLabel}
            className="flex items-center gap-1 text-[10px] font-bold text-nb-primary hover:underline transition-colors cursor-pointer shrink-0"
          >
            {actionIcon}
            <span>{actionLabel}</span>
          </button>
        ) : null}
      </div>

      {!isCollapsed && (
        <div
          className="flex-1 overflow-y-auto p-2 min-h-0 bg-nb-surface-lowest/40"
          style={maxHeight ? { maxHeight } : undefined}
        >
          {hasItems ? (
            children
          ) : typeof empty === "string" ? (
            <div className="py-3 px-3 text-center rounded-lg border border-dashed border-nb-outline-variant/30 text-[10px] text-nb-on-surface-variant/60">
              {empty}
            </div>
          ) : (
            empty
          )}
        </div>
      )}
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
  onDuplicateEntry,
  onSaveAsTemplate,
  onDownloadMulti,
  onDeleteMulti,
  onNewEntry,
  onCreateTemplate,
  onCreateFromTemplate,
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

  const [isTemplatesCollapsed, setIsTemplatesCollapsed] = useState(false);
  const [isEntriesCollapsed, setIsEntriesCollapsed] = useState(false);
  const [isNewDropdownOpen, setIsNewDropdownOpen] = useState(false);

  const regularEntries = entries.filter(e => !e.isTemplate);
  const templateEntries = entries.filter(e => e.isTemplate);

  const handleContextMenu = (e: React.MouseEvent, file: ExplorerFile) => {
    e.preventDefault();
    if (!selectedPaths.has(file.path)) {
      onSelectEntry(file, false, false);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  };

  const selectedEntries = entries.filter(e => selectedPaths.has(e.path));

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0" onClick={() => { setContextMenu(null); setIsNewDropdownOpen(false); }}>
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
            className="w-full pl-9 pr-8 py-2 bg-nb-surface-low border border-nb-outline-variant/60 rounded-xl text-xs text-nb-on-surface placeholder:text-nb-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-nb-primary/20 focus:border-nb-primary transition-all shadow-xs"
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-nb-on-surface-variant/40 hover:text-nb-on-surface transition-colors cursor-pointer"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Action Controls Row */}
        <div className="flex items-center justify-between gap-2">
          {/* Sort Menu */}
          <div className="relative flex-1">
            <button
              onClick={() => { setIsSortOpen(!isSortOpen); setIsFilterOpen(false); }}
              className="w-full flex items-center justify-between px-2.5 py-1.5 bg-nb-surface-low hover:bg-nb-surface-mid border border-nb-outline-variant/60 rounded-lg text-xs font-bold text-nb-on-surface transition-all cursor-pointer shadow-xs"
            >
              <div className="flex items-center gap-1.5 truncate">
                {sortBy === "date" ? <Calendar size={13} className="text-nb-primary shrink-0" /> : <FileText size={13} className="text-nb-primary shrink-0" />}
                <span className="truncate">{sortBy === "date" ? "Date" : "Title"}</span>
              </div>
              <ChevronDown size={12} className={`text-nb-on-surface-variant transition-transform ${isSortOpen ? 'rotate-180' : ''}`} />
            </button>

            {isSortOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsSortOpen(false)} />
                <div className="absolute top-full left-0 mt-1.5 w-44 bg-nb-surface border border-nb-outline-variant rounded-xl shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-1 text-[9px] font-black uppercase tracking-wider text-nb-on-surface-variant/40">Sort By</div>
                  <button
                    onClick={() => { onSortChange("date"); setIsSortOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${sortBy === 'date' ? 'text-nb-primary bg-nb-primary/5' : 'text-nb-on-surface hover:bg-nb-surface-low'}`}
                  >
                    <Calendar size={14} />
                    Date
                  </button>
                  <button
                    onClick={() => { onSortChange("title"); setIsSortOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${sortBy === 'title' ? 'text-nb-primary bg-nb-primary/5' : 'text-nb-on-surface hover:bg-nb-surface-low'}`}
                  >
                    <FileText size={14} />
                    Title
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Sort Direction Toggle */}
          <button
            onClick={onSortDirectionToggle}
            className="p-1.5 bg-nb-surface-low hover:bg-nb-surface-mid border border-nb-outline-variant/60 rounded-lg text-nb-on-surface transition-all cursor-pointer shadow-xs"
            title={`Sort Direction: ${sortDirection.toUpperCase()}`}
          >
            {sortDirection === "asc" ? <SortAsc size={15} className="text-nb-primary" /> : <SortDesc size={15} className="text-nb-primary" />}
          </button>

          {/* Date Filter Menu */}
          <div className="relative">
            <button
              onClick={() => { setIsFilterOpen(!isFilterOpen); setIsSortOpen(false); }}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer shadow-xs flex items-center gap-1 ${dateRange ? 'bg-nb-primary/10 border-nb-primary/30 text-nb-primary' : 'bg-nb-surface-low hover:bg-nb-surface-mid border-nb-outline-variant/60 text-nb-on-surface'}`}
              title="Filter by Date Range"
            >
              <CalendarDays size={15} className={dateRange ? 'text-nb-primary' : ''} />
              {dateRange && <span className="w-1.5 h-1.5 rounded-full bg-nb-primary" />}
            </button>

            {isFilterOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsFilterOpen(false)} />
                <div className="absolute top-full right-0 mt-1.5 w-64 bg-nb-surface border border-nb-outline-variant rounded-2xl shadow-2xl p-4 z-50 animate-in fade-in zoom-in-95 duration-150 space-y-3">
                  <div className="flex items-center justify-between border-b border-nb-outline-variant/40 pb-2">
                    <span className="text-xs font-black uppercase tracking-wider text-nb-on-surface">Date Filter</span>
                    {dateRange && (
                      <button
                        onClick={() => { onDateRangeChange(null); setIsFilterOpen(false); }}
                        className="text-[10px] font-bold text-red-500 hover:underline cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-nb-on-surface-variant block mb-1">Start Date</label>
                      <input
                        type="date"
                        defaultValue={dateRange?.start || ""}
                        id="filter-start-date"
                        className="w-full bg-nb-surface-low border border-nb-outline-variant/60 rounded-xl px-2.5 py-1.5 text-xs text-nb-on-surface focus:outline-none focus:border-nb-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-nb-on-surface-variant block mb-1">End Date</label>
                      <input
                        type="date"
                        defaultValue={dateRange?.end || ""}
                        id="filter-end-date"
                        className="w-full bg-nb-surface-low border border-nb-outline-variant/60 rounded-xl px-2.5 py-1.5 text-xs text-nb-on-surface focus:outline-none focus:border-nb-primary"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      const start = (document.getElementById("filter-start-date") as HTMLInputElement)?.value;
                      const end = (document.getElementById("filter-end-date") as HTMLInputElement)?.value;
                      if (start || end) {
                        onDateRangeChange({ start, end });
                      } else {
                        onDateRangeChange(null);
                      }
                      setIsFilterOpen(false);
                    }}
                    className="w-full bg-nb-primary hover:bg-nb-primary-dim text-white font-bold py-2 rounded-xl text-xs transition-all shadow-md shadow-nb-primary/20 cursor-pointer"
                  >
                    Apply Filter
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Entries and Templates Content Area */}
      {(() => {
        const entriesPane = (
          <Pane
            id="explorer-entries-pane"
            title="Entries"
            count={regularEntries.length}
            isCollapsed={isEntriesCollapsed}
            onToggleCollapse={() => setIsEntriesCollapsed(!isEntriesCollapsed)}
            actionComponent={
              <div className="relative flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => onNewEntry()}
                  title="New Blank Entry"
                  className="flex items-center gap-1 text-[10px] font-bold text-nb-primary hover:underline transition-colors cursor-pointer px-1 py-0.5"
                >
                  <Plus size={11} />
                  <span>New</span>
                </button>

                <button
                  onClick={() => setIsNewDropdownOpen(!isNewDropdownOpen)}
                  title="Create from template..."
                  className={`p-0.5 rounded transition-colors cursor-pointer text-nb-primary ${isNewDropdownOpen ? 'bg-nb-primary/15' : 'hover:bg-nb-surface-high'}`}
                >
                  <ChevronDown size={11} className={`transition-transform ${isNewDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isNewDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsNewDropdownOpen(false)} />
                    <div className="absolute right-0 top-full mt-1.5 z-50 w-52 bg-nb-surface border border-nb-outline-variant rounded-xl shadow-xl py-1 animate-in fade-in zoom-in-95 duration-150">
                      <button
                        onClick={() => {
                          setIsNewDropdownOpen(false);
                          onNewEntry();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold text-nb-on-surface hover:bg-nb-surface-low transition-colors cursor-pointer text-left"
                      >
                        <FileText size={13} className="text-nb-primary shrink-0" />
                        <span>Blank Entry</span>
                      </button>

                      <div className="px-3 py-1 text-[9px] font-black uppercase tracking-wider text-nb-on-surface-variant/50 border-t border-nb-outline-variant/20 mt-1">
                        From Template
                      </div>

                      {templateEntries.length > 0 ? (
                        templateEntries.map(tmpl => {
                          const tmplId = tmpl.name.replace('.json', '');
                          return (
                            <button
                              key={tmpl.path}
                              onClick={() => {
                                setIsNewDropdownOpen(false);
                                if (onCreateFromTemplate) {
                                  onCreateFromTemplate(tmplId);
                                }
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] font-medium text-nb-on-surface hover:bg-nb-surface-low hover:text-nb-primary transition-colors cursor-pointer text-left"
                            >
                              <Layers size={12} className="text-purple-500 shrink-0" />
                              <span className="truncate flex-1">{tmpl.title || "Untitled Template"}</span>
                            </button>
                          );
                        })
                      ) : (
                        <div className="px-3 py-1.5 text-[10px] text-nb-on-surface-variant/60 italic">
                          No templates yet
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            }
            empty={search ? "No matches found." : "No entries yet."}
            hasItems={regularEntries.length > 0}
            className={isEntriesCollapsed ? "shrink-0" : "flex-1"}
          >
            <div className="space-y-1">
              {regularEntries.map((f) => {
                const pConfig = typeof f.phase === "number" ? phaseConfig[f.phase] : null;
                const IconComponent = pConfig ? pConfig.icon : FileText;
                const phase = typeof f.phase === "number" ? availablePhases.find(p => p.index === f.phase) : null;
                const iconStyle = phase ? { color: phase.color } : undefined;

                const icon = (
                  <IconComponent
                    size={16}
                    style={activePath === f.path ? { color: "inherit" } : iconStyle}
                    className={activePath === f.path ? "text-white" : pConfig ? "" : "opacity-40"}
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
                    onSelect={(e) => onSelectEntry(f, e.ctrlKey || e.metaKey, e.shiftKey)}
                    onDoubleClick={() => onOpenEntry(f)}
                    onContextMenu={(e) => handleContextMenu(e, f)}
                  />
                );
              })}
            </div>
          </Pane>
        );

        const templatesPane = (
          <Pane
            id="explorer-templates-pane"
            title="Templates"
            count={templateEntries.length}
            isCollapsed={isTemplatesCollapsed}
            onToggleCollapse={() => setIsTemplatesCollapsed(!isTemplatesCollapsed)}
            actionLabel="New"
            actionIcon={<Plus size={11} />}
            onAction={onCreateTemplate}
            className={isTemplatesCollapsed ? "shrink-0 border-t border-nb-outline-variant/30" : "flex-1 border-t border-nb-outline-variant/30"}
            empty={
              <div className="py-3 px-3 text-center rounded-lg border border-dashed border-nb-outline-variant/30 text-[10px] text-nb-on-surface-variant/60 flex flex-col items-center gap-1.5">
                <span>No entry templates yet</span>
                {onCreateTemplate && (
                  <button
                    onClick={onCreateTemplate}
                    className="text-[9px] font-bold text-nb-primary hover:underline cursor-pointer"
                  >
                    Create Template +
                  </button>
                )}
              </div>
            }
            hasItems={templateEntries.length > 0}
          >
            <div className="space-y-1">
              {templateEntries.map(f => {
                const pConfig = typeof f.phase === "number" ? phaseConfig[f.phase] : null;
                const IconComponent = pConfig ? pConfig.icon : Layers;
                const phase = typeof f.phase === "number" ? availablePhases.find(p => p.index === f.phase) : null;
                const iconStyle = phase ? { color: phase.color } : { color: "#9333ea" };

                const icon = (
                  <IconComponent
                    size={16}
                    style={activePath === f.path ? { color: "inherit" } : iconStyle}
                    className={activePath === f.path ? "text-white" : pConfig ? "" : "text-purple-600 dark:text-purple-400"}
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
                    onSelect={(e) => onSelectEntry(f, e.ctrlKey || e.metaKey, e.shiftKey)}
                    onDoubleClick={() => onOpenEntry(f)}
                    onContextMenu={(e) => handleContextMenu(e, f)}
                  />
                );
              })}
            </div>
          </Pane>
        );

        if (!isEntriesCollapsed && !isTemplatesCollapsed) {
          return (
            <PanelGroup direction="vertical" className="flex-1 min-h-0" id="file-explorer-vertical-group">
              <Panel defaultSize={65} minSize={20} className="flex flex-col min-h-0">
                {entriesPane}
              </Panel>
              <PanelResizeHandle className="h-1.5 bg-nb-surface hover:bg-nb-primary/20 border-y border-nb-outline-variant/30 cursor-row-resize transition-colors shrink-0 flex items-center justify-center group/handle">
                <div className="w-8 h-0.5 rounded-full bg-nb-outline-variant/50 group-hover/handle:bg-nb-primary transition-colors" />
              </PanelResizeHandle>
              <Panel defaultSize={35} minSize={20} className="flex flex-col min-h-0">
                {templatesPane}
              </Panel>
            </PanelGroup>
          );
        }

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {entriesPane}
            {templatesPane}
          </div>
        );
      })()}

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[1100]" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div
            className="fixed z-[1200] w-56 bg-nb-surface border border-nb-outline-variant rounded-2xl shadow-2xl py-2 animate-in fade-in zoom-in-95 duration-200"
            style={{ left: Math.min(contextMenu.x, window.innerWidth - 240), top: Math.min(contextMenu.y, window.innerHeight - 300) }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-nb-outline-variant/30 mb-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-nb-on-surface-variant truncate">
                {selectedPaths.size > 1 ? `${selectedPaths.size} Items Selected` : (contextMenu.file.title || (contextMenu.file.isTemplate ? "Untitled Template" : "Untitled Entry"))}
              </p>
            </div>

            {selectedPaths.size <= 1 ? (
              <>
                {contextMenu.file.isTemplate ? (
                  <>
                    {onCreateFromTemplate && (
                      <button
                        onClick={() => {
                          const tmplId = contextMenu.file.name.replace('.json', '');
                          onCreateFromTemplate(tmplId);
                          setContextMenu(null);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-nb-primary hover:bg-nb-primary/10 transition-colors cursor-pointer"
                      >
                        <Plus size={14} />
                        Create Entry from Template
                      </button>
                    )}

                    <button
                      onClick={() => { onOpenEntry(contextMenu.file); setContextMenu(null); }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-nb-on-surface hover:bg-nb-surface-low transition-colors cursor-pointer"
                    >
                      <ExternalLink size={14} className="text-purple-500" />
                      Edit Template
                    </button>

                    {onDuplicateEntry && (
                      <button
                        onClick={() => { onDuplicateEntry(contextMenu.file); setContextMenu(null); }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-nb-on-surface hover:bg-nb-surface-low transition-colors cursor-pointer"
                      >
                        <Copy size={14} className="text-nb-on-surface-variant" />
                        Duplicate Template
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { onOpenEntry(contextMenu.file); setContextMenu(null); }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-nb-on-surface hover:bg-nb-surface-low transition-colors cursor-pointer"
                    >
                      <ExternalLink size={14} className="text-nb-primary" />
                      Open Entry
                    </button>

                    {onDuplicateEntry && (
                      <button
                        onClick={() => { onDuplicateEntry(contextMenu.file); setContextMenu(null); }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-nb-on-surface hover:bg-nb-surface-low transition-colors cursor-pointer"
                      >
                        <Copy size={14} className="text-nb-primary" />
                        Duplicate Entry
                      </button>
                    )}

                    {onSaveAsTemplate && (
                      <button
                        onClick={() => { onSaveAsTemplate(contextMenu.file); setContextMenu(null); }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 transition-colors cursor-pointer"
                      >
                        <Layers size={14} />
                        Save as Template
                      </button>
                    )}
                  </>
                )}

                {activePath === contextMenu.file.path && (
                  <button
                    onClick={() => { onCloseEntry(contextMenu.file.path); setContextMenu(null); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-nb-on-surface hover:bg-nb-surface-low transition-colors cursor-pointer"
                  >
                    <X size={14} className="text-nb-on-surface-variant" />
                    Close
                  </button>
                )}

                <div className="h-px bg-nb-outline-variant/30 my-1" />

                <button
                  onClick={() => { onDownloadJson(contextMenu.file); setContextMenu(null); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-nb-on-surface hover:bg-nb-surface-low transition-colors cursor-pointer"
                >
                  <FileJson size={14} className="text-nb-tertiary" />
                  Download ZIP
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
                  Delete {contextMenu.file.isTemplate ? "Template" : "Entry"}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { onDownloadMulti(selectedEntries); setContextMenu(null); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-nb-on-surface hover:bg-nb-surface-low transition-colors cursor-pointer"
                >
                  <Download size={14} className="text-nb-tertiary" />
                  Export Selected ({selectedPaths.size})
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
