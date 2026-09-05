import React, { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  FileText, Plus, X, Calendar, SortAsc, SortDesc,
  ChevronDown, ExternalLink, Trash2, FileJson, FileCode,
  Download, Copy, Layers, FolderTree, GripVertical
} from "lucide-react";
import ValidationTooltip from "./editor/ui/ValidationTooltip";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import { ExplorerFile } from "@/lib/types";
import { getPhases, getPhaseConfig } from "@/lib/phases";
import { NotebookMetadata } from "@/lib/metadata";

interface FileExplorerProps {
  entries: ExplorerFile[];
  activePath: string | null;
  selectedPaths: Set<string>;
  pendingPaths: Set<string>;
  deletedPaths: Set<string>;
  onSelectEntry: (file: ExplorerFile, multi: boolean, range: boolean, visiblePaths: string[]) => void;
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
  onReorderTemplates?: (templateIds: string[]) => void;
  sortBy: "date" | "title";
  onSortChange: (val: "date" | "title") => void;
  sortDirection: "asc" | "desc";
  onSortDirectionToggle: () => void;
  notebookMetadata?: NotebookMetadata;
}

// â”€â”€â”€ Single file row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  phaseLabel?: string;
  dragHandle?: React.ReactNode;
  rowRef?: (node: HTMLDivElement | null) => void;
  rowStyle?: React.CSSProperties;
}

function FileRow({
  file, isOpened, isSelected, isPending, isDeleted, icon, isValid = true, validationErrors = [],
  onSelect, onDoubleClick, onContextMenu, phaseLabel, dragHandle, rowRef, rowStyle
}: FileRowProps) {
  const localRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const node = localRef.current;
    if (isOpened && node) {
      node.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isOpened]);

  const tooltipLines = [file.title || (file.isTemplate ? "Untitled Template" : "Untitled Entry")];
  if (file.author) tooltipLines.push(`By ${file.author}`);
  if (!file.isTemplate && file.date) tooltipLines.push(file.date);

  const subtitle = file.isTemplate
    ? (phaseLabel || "Template")
    : (() => {
      const dateStr = file.date;
      if (!dateStr) return "No date";
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
    })();

  return (
    <div
      ref={(node) => {
        localRef.current = node;
        rowRef?.(node);
      }}
      style={rowStyle}
      onClick={isDeleted ? undefined : (e) => {
        onSelect(e);
        if (!(e.ctrlKey || e.metaKey || e.shiftKey)) onDoubleClick();
      }}
      onDoubleClick={isDeleted ? undefined : onDoubleClick}
      onContextMenu={isDeleted ? undefined : onContextMenu}
      title={tooltipLines.join(' Â· ')}
      className={`
        group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer select-none border-2
        ${isOpened
          ? 'bg-nb-tertiary text-white shadow-lg shadow-nb-tertiary/20 border-nb-tertiary'
          : isSelected
            ? 'bg-nb-surface-mid border-nb-tertiary/50 text-nb-on-surface'
            : 'bg-transparent border-transparent hover:bg-nb-surface-mid text-nb-on-surface'
        }
        ${isDeleted ? 'opacity-30 grayscale' : ''}
      `}
    >
      {dragHandle}
      <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${isOpened ? 'bg-white/20 text-white' : isSelected ? 'bg-nb-tertiary/10 text-nb-tertiary' : 'bg-nb-surface-low text-nb-tertiary'}`}>
        {icon}
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        <span className={`truncate font-bold tracking-tight leading-tight ${isOpened ? 'text-white' : 'text-nb-on-surface'}`}>
          {file.title || "Untitled Entry"}
        </span>
        <span className={`text-[9px] font-mono truncate mt-0.5 ${isOpened ? 'text-white/70' : 'opacity-40'}`}>
          {subtitle}
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

function restrictToVerticalAxis({ transform }: { transform: { x: number; y: number; scaleX: number; scaleY: number } }) {
  return { ...transform, x: 0 };
}

function SortableTemplateRow(props: Omit<FileRowProps, "dragHandle" | "rowRef" | "rowStyle"> & { sortableId: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.sortableId,
  });
  const { sortableId: _sortableId, ...rowProps } = props;
  return (
    <FileRow
      {...rowProps}
      rowRef={setNodeRef}
      rowStyle={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 20 : undefined,
      }}
      dragHandle={
        <button
          type="button"
          className={`shrink-0 p-0.5 rounded cursor-grab active:cursor-grabbing ${rowProps.isOpened ? "text-white/80" : "text-nb-on-surface-variant/50 hover:text-nb-on-surface"}`}
          title="Drag to reorder"
          aria-label="Drag to reorder"
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </button>
      }
    />
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
  onReorderTemplates,
  sortBy,
  onSortChange,
  sortDirection,
  onSortDirectionToggle,
  notebookMetadata
}: FileExplorerProps) {
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, file: ExplorerFile } | null>(null);
  const [explorerTab, setExplorerTab] = useState<"entries" | "templates">("entries");
  const [isNewDropdownOpen, setIsNewDropdownOpen] = useState(false);

  const availablePhases = getPhases(notebookMetadata?.phases);
  const phaseConfig = getPhaseConfig(availablePhases);

  const regularEntries = entries.filter(e => !e.isTemplate);
  const templateEntries = [...entries.filter(e => e.isTemplate)].sort((a, b) => {
    const orderA = a.order ?? 0;
    const orderB = b.order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return (a.path || a.name).localeCompare(b.path || b.name);
  });
  const canReorderTemplates = !!onReorderTemplates;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleTemplateDragEnd = (event: DragEndEvent) => {
    if (!canReorderTemplates || !event.over) return;
    const from = templateEntries.findIndex((f) => f.name.replace(".json", "") === event.active.id);
    const to = templateEntries.findIndex((f) => f.name.replace(".json", "") === event.over?.id);
    if (from < 0 || to < 0 || from === to) return;
    const moved = arrayMove(templateEntries, from, to).map((f) => f.name.replace(".json", ""));
    onReorderTemplates(moved);
  };

  const handleContextMenu = (e: React.MouseEvent, file: ExplorerFile) => {
    e.preventDefault();
    if (!selectedPaths.has(file.path)) {
      onSelectEntry(file, false, false, [file.path]);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  };

  const selectedEntries = entries.filter(e => selectedPaths.has(e.path));

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-nb-surface-low select-none" onClick={() => { setContextMenu(null); setIsNewDropdownOpen(false); }}>
      {/* Header + tabs */}
      <div className="p-3.5 pb-0 border-b border-nb-outline-variant/30 shrink-0 bg-nb-surface-low">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FolderTree size={15} className="text-nb-primary" />
            <span className="text-[11px] font-black uppercase tracking-wider text-nb-on-surface">
              Explorer
            </span>
          </div>
        </div>
        <div className="flex gap-1" role="tablist" aria-label="Explorer lists">
          <button
            type="button"
            role="tab"
            aria-selected={explorerTab === "entries"}
            onClick={() => { setExplorerTab("entries"); setIsSortOpen(false); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-[10px] font-black uppercase tracking-wider rounded-t-lg border border-b-0 transition-colors cursor-pointer ${
              explorerTab === "entries"
                ? "bg-nb-surface text-nb-primary border-nb-outline-variant/30"
                : "bg-transparent text-nb-on-surface-variant border-transparent hover:text-nb-on-surface"
            }`}
          >
            Entries
            <span className="text-[9px] font-bold opacity-70 bg-nb-surface-high/60 px-1.5 py-0.5 rounded-full">
              {regularEntries.length}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={explorerTab === "templates"}
            onClick={() => { setExplorerTab("templates"); setIsSortOpen(false); setIsNewDropdownOpen(false); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-[10px] font-black uppercase tracking-wider rounded-t-lg border border-b-0 transition-colors cursor-pointer ${
              explorerTab === "templates"
                ? "bg-nb-surface text-nb-primary border-nb-outline-variant/30"
                : "bg-transparent text-nb-on-surface-variant border-transparent hover:text-nb-on-surface"
            }`}
          >
            Templates
            <span className="text-[9px] font-bold opacity-70 bg-nb-surface-high/60 px-1.5 py-0.5 rounded-full">
              {templateEntries.length}
            </span>
          </button>
        </div>
      </div>

      {explorerTab === "entries" && (
      <div className="px-3 py-2 bg-nb-surface border-b border-nb-outline-variant/30 flex items-center justify-between gap-2 shrink-0">
        {/* Sort Menu */}
        <div className="relative flex-1">
          <button
            onClick={() => setIsSortOpen(!isSortOpen)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 bg-nb-surface-low hover:bg-nb-surface-mid border border-nb-outline-variant/60 rounded-lg text-xs font-bold text-nb-on-surface transition-all cursor-pointer shadow-xs"
          >
            <div className="flex items-center gap-1.5 truncate">
              {sortBy === "date" ? <Calendar size={13} className="text-nb-primary shrink-0" /> : <FileText size={13} className="text-nb-primary shrink-0" />}
              <span className="truncate">Sort: {sortBy === "date" ? "Calendar" : "Title"}</span>
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
                  Calendar
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
        <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setIsNewDropdownOpen(!isNewDropdownOpen)}
            title="New entry"
            className={`flex items-center gap-1 text-[10px] font-bold text-nb-primary hover:underline transition-colors cursor-pointer px-1 py-0.5 rounded ${isNewDropdownOpen ? "bg-nb-primary/15" : ""}`}
          >
            <Plus size={11} />
            <span>New</span>
            <ChevronDown size={11} className={`transition-transform ${isNewDropdownOpen ? "rotate-180" : ""}`} />
          </button>
          {isNewDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsNewDropdownOpen(false)} />
              <div className="absolute right-0 top-full mt-1.5 z-50 w-52 bg-nb-surface border border-nb-outline-variant rounded-xl shadow-xl py-1 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-72">
                <button
                  onClick={() => {
                    setIsNewDropdownOpen(false);
                    onNewEntry();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold text-nb-on-surface hover:bg-nb-surface-low transition-colors cursor-pointer text-left shrink-0"
                >
                  <FileText size={13} className="text-nb-primary shrink-0" />
                  <span>Blank Entry</span>
                </button>
                <div className="px-3 py-1 text-[9px] font-black uppercase tracking-wider text-nb-on-surface-variant/50 border-t border-nb-outline-variant/20 mt-1 shrink-0">
                  From Template
                </div>
                <div className="overflow-y-auto min-h-0">
                {templateEntries.length > 0 ? (
                  templateEntries.map(tmpl => {
                    const tmplId = tmpl.name.replace('.json', '');
                    const tmplPConfig = typeof tmpl.phase === "string" && tmpl.phase ? phaseConfig[tmpl.phase] : null;
                    const TmplIcon = tmplPConfig ? tmplPConfig.icon : Layers;
                    const tmplPhase = typeof tmpl.phase === "string" && tmpl.phase ? availablePhases.find(p => p.id === tmpl.phase) : null;
                    const tmplIconColor = tmplPhase ? tmplPhase.color : "#9333ea";
                    return (
                      <button
                        key={tmpl.path}
                        onClick={() => {
                          setIsNewDropdownOpen(false);
                          if (onCreateFromTemplate) onCreateFromTemplate(tmplId);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] font-medium text-nb-on-surface hover:bg-nb-surface-low hover:text-nb-primary transition-colors cursor-pointer text-left"
                      >
                        <TmplIcon size={12} style={{ color: tmplIconColor }} className="shrink-0" />
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
              </div>
            </>
          )}
        </div>
      </div>
      )}

      {explorerTab === "templates" && (
        <div className="px-3 py-2 bg-nb-surface border-b border-nb-outline-variant/30 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onCreateTemplate}
            className="flex items-center gap-1 text-[10px] font-bold text-nb-primary hover:underline transition-colors cursor-pointer"
          >
            <Plus size={11} />
            New
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 min-h-0 bg-nb-surface-lowest/40">
        {explorerTab === "entries" ? (
          regularEntries.length > 0 ? (
            <div className="flex flex-col gap-1">
              {regularEntries.map((f) => {
                const pConfig = typeof f.phase === "string" && f.phase ? phaseConfig[f.phase] : null;
                const IconComponent = pConfig ? pConfig.icon : FileText;
                const phase = typeof f.phase === "string" && f.phase ? availablePhases.find(p => p.id === f.phase) : null;
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
                    onSelect={(e) => onSelectEntry(f, e.ctrlKey || e.metaKey, e.shiftKey, regularEntries.map((x) => x.path))}
                    onDoubleClick={() => onOpenEntry(f)}
                    onContextMenu={(e) => handleContextMenu(e, f)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="py-3 px-3 text-center rounded-lg border border-dashed border-nb-outline-variant/30 text-[10px] text-nb-on-surface-variant/60">
              No entries yet.
            </div>
          )
        ) : templateEntries.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleTemplateDragEnd}
          >
            <SortableContext items={templateEntries.map((f) => f.name.replace(".json", ""))} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-1">
                {templateEntries.map(f => {
                  const pConfig = typeof f.phase === "string" && f.phase ? phaseConfig[f.phase] : null;
                  const IconComponent = pConfig ? pConfig.icon : Layers;
                  const phase = typeof f.phase === "string" && f.phase ? availablePhases.find(p => p.id === f.phase) : null;
                  const iconStyle = phase ? { color: phase.color } : { color: "#9333ea" };
                  const templateId = f.name.replace(".json", "");
                  const icon = (
                    <IconComponent
                      size={16}
                      style={activePath === f.path ? { color: "inherit" } : iconStyle}
                      className={activePath === f.path ? "text-white" : pConfig ? "" : "text-purple-600 dark:text-purple-400"}
                    />
                  );
                  const rowProps = {
                    file: f,
                    isOpened: activePath === f.path,
                    isSelected: selectedPaths.has(f.path),
                    isPending: pendingPaths.has(f.path),
                    isDeleted: deletedPaths.has(f.path),
                    icon,
                    isValid: f.isValid,
                    validationErrors: f.validationErrors,
                    phaseLabel: phase?.name,
                    onSelect: (e: React.MouseEvent) => onSelectEntry(f, e.ctrlKey || e.metaKey, e.shiftKey, templateEntries.map((x) => x.path)),
                    onDoubleClick: () => onOpenEntry(f),
                    onContextMenu: (e: React.MouseEvent) => handleContextMenu(e, f),
                  };
                  return canReorderTemplates ? (
                    <SortableTemplateRow key={f.path} sortableId={templateId} {...rowProps} />
                  ) : (
                    <FileRow key={f.path} {...rowProps} />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
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
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-1100" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div
            className="fixed z-1200 w-56 bg-nb-surface border border-nb-outline-variant rounded-2xl shadow-2xl py-2 animate-in fade-in zoom-in-95 duration-200"
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
