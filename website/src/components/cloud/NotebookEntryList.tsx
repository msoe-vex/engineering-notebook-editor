"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  LayoutTemplate,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import {
  Button,
  ContextMenu,
  Dialog,
  DropdownMenu,
  IconButton,
  ValidationIssuesTooltip,
  type MenuItem,
} from "@/components/ui";
import { showNotification } from "@/components/overlays/Notification";
import { cloudApi } from "@/lib/cloud/api";
import { useAppDndSensors } from "@/lib/dnd/dndSensors";
import { readDefaultAuthors } from "@/lib/notebook/metadata";
import type { ProjectPhase } from "@/lib/notebook/metadata";
import { getPhaseConfig, getPhases } from "@/lib/notebook/phases";
import { formatEntryListDate, getLocalDateString } from "@/lib/utils";
import { PhaseChip } from "./PhaseChip";
import { PhasePicker } from "./PhasePicker";
import { useNotebookWorkspace } from "./NotebookWorkspaceContext";
import type { EntryMeta } from "./notebook-types";

type EntryFilters = {
  phaseId: string | null;
  author: string | null;
  dateFrom: string;
  dateTo: string;
  /** null = all, entries = non-templates, templates = templates only */
  kind: "all" | "entries" | "templates";
};

type EntrySortMode = "name" | "date" | "phase";

const EMPTY_FILTERS: EntryFilters = {
  phaseId: null,
  author: null,
  dateFrom: "",
  dateTo: "",
  kind: "all",
};

function explorerFilterStorageKey(notebookId: string) {
  return `nb-explorer-filters:${notebookId}`;
}

function loadExplorerFilters(notebookId: string): {
  filtersOpen: boolean;
  filters: EntryFilters;
  sortMode: EntrySortMode;
} {
  if (typeof window === "undefined") {
    return { filtersOpen: false, filters: EMPTY_FILTERS, sortMode: "name" };
  }
  try {
    const raw = sessionStorage.getItem(explorerFilterStorageKey(notebookId));
    if (!raw) return { filtersOpen: false, filters: EMPTY_FILTERS, sortMode: "name" };
    const parsed = JSON.parse(raw) as {
      filtersOpen?: boolean;
      filters?: Partial<EntryFilters>;
      sortMode?: EntrySortMode;
    };
    const sortMode =
      parsed.sortMode === "date" || parsed.sortMode === "phase" ? parsed.sortMode : "name";
    return {
      filtersOpen: Boolean(parsed.filtersOpen),
      filters: { ...EMPTY_FILTERS, ...parsed.filters },
      sortMode,
    };
  } catch {
    return { filtersOpen: false, filters: EMPTY_FILTERS, sortMode: "name" };
  }
}

function entryMatchesFilters(
  e: EntryMeta,
  q: string,
  filters: EntryFilters,
  phaseNames: Record<string, string>
): boolean {
  if (filters.kind === "entries" && e.isTemplate) return false;
  if (filters.kind === "templates" && !e.isTemplate) return false;
  if (filters.phaseId !== null && (e.phase ?? null) !== filters.phaseId) return false;
  if (filters.author) {
    const authors = e.authors || [];
    if (!authors.includes(filters.author)) return false;
  }
  if (filters.dateFrom || filters.dateTo) {
    if (e.isTemplate) return false;
    const d = e.date || (e.createdAt ? e.createdAt.slice(0, 10) : "");
    if (!d) return false;
    if (filters.dateFrom && d < filters.dateFrom) return false;
    if (filters.dateTo && d > filters.dateTo) return false;
  }
  if (!q) return true;
  const haystacks = [
    e.title || "",
    (e.authors || []).join(" "),
    e.date || "",
    e.phase ? phaseNames[e.phase] || e.phase : "",
  ];
  return haystacks.some((h) => h.toLowerCase().includes(q));
}

/** Sort explorer entry siblings. */
function sortEntries(
  list: [string, EntryMeta][],
  mode: EntrySortMode = "name",
  phaseNames: Record<string, string> = {}
) {
  return list.sort((a, b) => {
    if (mode === "date") {
      return (
        (a[1].date || "").localeCompare(b[1].date || "") ||
        a[1].title.localeCompare(b[1].title, undefined, { sensitivity: "base", numeric: true }) ||
        a[0].localeCompare(b[0])
      );
    }
    if (mode === "phase") {
      const pa = a[1].phase ? phaseNames[a[1].phase] || a[1].phase : "";
      const pb = b[1].phase ? phaseNames[b[1].phase] || b[1].phase : "";
      return (
        pa.localeCompare(pb, undefined, { sensitivity: "base" }) ||
        a[1].title.localeCompare(b[1].title, undefined, { sensitivity: "base", numeric: true }) ||
        a[0].localeCompare(b[0])
      );
    }
    return (
      a[1].title.localeCompare(b[1].title, undefined, { sensitivity: "base", numeric: true }) ||
      (a[1].date || "").localeCompare(b[1].date || "") ||
      a[0].localeCompare(b[0])
    );
  });
}

type ContextMenuState = {
  x: number;
  y: number;
  items: MenuItem[];
} | null;

type RenameTarget = { kind: "entry" | "folder"; id: string };

function InlineRenameInput({
  initialValue,
  ariaLabel,
  onCommit,
  onCancel,
}: {
  initialValue: string;
  ariaLabel: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const ref = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  function finish(next: string | null) {
    if (doneRef.current) return;
    doneRef.current = true;
    if (next === null) {
      onCancel();
      return;
    }
    const trimmed = next.trim();
    onCommit(trimmed || initialValue);
  }

  return (
    <input
      ref={ref}
      type="text"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          finish(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(null);
        }
      }}
      onBlur={() => finish(value)}
      className="min-w-0 flex-1 rounded border border-nb-primary/50 bg-nb-surface px-1 py-0 text-xs font-medium leading-none text-nb-on-surface outline-none ring-1 ring-nb-primary/30"
    />
  );
}

function EntryRowShell({
  id,
  active,
  selected,
  basePath,
  entry,
  menu,
  rowRef,
  rowStyle,
  phases,
  indent = 0,
  renaming = false,
  onRenameCommit,
  onRenameCancel,
  onContextMenu,
  onSelectClick,
  onOpenIntent,
  dragListeners,
  dragAttributes,
  isDragging,
  isOver,
  wasDraggedRef,
}: {
  id: string;
  active: boolean;
  selected?: boolean;
  basePath: string;
  entry: EntryMeta;
  menu: ReactNode;
  rowRef?: (node: HTMLElement | null) => void;
  rowStyle?: CSSProperties;
  phases?: Record<string, ProjectPhase> | null;
  indent?: number;
  renaming?: boolean;
  onRenameCommit?: (title: string) => void;
  onRenameCancel?: () => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
  onSelectClick?: (e: ReactMouseEvent, id: string) => void;
  /** Fired on plain click / hover warm-up before the route settles. */
  onOpenIntent?: (id: string) => void;
  dragListeners?: DraggableSyntheticListeners;
  dragAttributes?: DraggableAttributes;
  isDragging?: boolean;
  isOver?: boolean;
  wasDraggedRef?: MutableRefObject<boolean>;
}) {
  const router = useRouter();
  const phaseList = useMemo(() => (phases ? getPhases(phases) : []), [phases]);
  const phaseCfg = useMemo(() => (entry.phase ? getPhaseConfig(phaseList)[entry.phase] : null), [phaseList, entry.phase]);
  const href = `${basePath}/entries/${id}`;

  return (
    <div
      ref={rowRef}
      style={{
        ...rowStyle,
        paddingLeft: `${Math.max(6, indent * 18 + 8)}px`,
      }}
      className={`group relative flex h-[26px] items-center gap-1.5 rounded pr-1.5 text-nb-label transition-colors select-none ${
        renaming ? "cursor-default" : "cursor-pointer"
      } ${
        isOver
          ? "bg-nb-primary/20 ring-1 ring-nb-primary/60 font-medium"
          : selected
          ? "bg-nb-tertiary/15 text-nb-on-surface ring-1 ring-nb-tertiary/40 font-medium"
          : active
          ? "bg-nb-primary/15 text-nb-primary font-medium"
          : "text-nb-on-surface hover:bg-nb-surface/80"
      }`}
      onContextMenu={onContextMenu}
      {...(renaming ? {} : dragAttributes)}
      {...(renaming ? {} : dragListeners)}
    >
      {/* Indentation guide lines */}
      {indent > 0 &&
        Array.from({ length: indent }).map((_, i) => (
          <span
            key={i}
            className="pointer-events-none absolute top-0 bottom-0 border-l border-nb-outline-variant/20"
            style={{ left: `${i * 18 + 14}px` }}
          />
        ))}

      <Link
        href={href}
        prefetch
        className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5"
        title={entry.title || "Untitled"}
        onClick={(e) => {
          if (renaming) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          // If dragged or dragging or just finished dragging, prevent click navigation
          if (
            isDragging ||
            wasDraggedRef?.current ||
            (e.nativeEvent as unknown as { defaultPrevented?: boolean }).defaultPrevented
          ) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (e.metaKey || e.ctrlKey || e.shiftKey) {
            e.preventDefault();
          } else {
            onOpenIntent?.(id);
          }
          // Always stop bubbling so the nav shell doesn't clear the shift-click anchor.
          e.stopPropagation();
          onSelectClick?.(e, id);
        }}
        onMouseEnter={() => {
          try {
            router.prefetch(href);
          } catch {
            /* prefetch is best-effort */
          }
        }}
      >
        {(() => {
          const PhaseIcon = phaseCfg?.icon;
          if (entry.isTemplate) {
            return (
              <span title="Template" className="inline-flex shrink-0">
                <LayoutTemplate
                  size={14}
                  className={
                    active
                      ? "text-nb-tertiary"
                      : "text-nb-on-surface-variant/70 group-hover:text-nb-on-surface"
                  }
                />
              </span>
            );
          }
          if (PhaseIcon && entry.phase) {
            return (
              <span
                title={phases?.[entry.phase]?.name || entry.phase}
                className="inline-flex shrink-0"
              >
                <PhaseIcon size={14} style={{ color: phaseCfg.color }} />
              </span>
            );
          }
          return (
            <FileText
              size={14}
              className={`shrink-0 ${
                active
                  ? "text-nb-primary"
                  : "text-nb-on-surface-variant/70 group-hover:text-nb-on-surface"
              }`}
            />
          );
        })()}

        {renaming && onRenameCommit && onRenameCancel ? (
          <InlineRenameInput
            initialValue={entry.title || "Untitled"}
            ariaLabel="Rename entry"
            onCommit={onRenameCommit}
            onCancel={onRenameCancel}
          />
        ) : (
          <span className="truncate text-xs leading-none">{entry.title || "Untitled"}</span>
        )}

        {!renaming && entry.isValid === false && (
          <ValidationIssuesTooltip
            errors={entry.validationErrors || ["Incomplete entry"]}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />
        )}

        {!renaming && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-1">
            {entry.date && !entry.isTemplate && (
              <span className="hidden text-[10px] tabular-nums text-nb-on-surface-variant/60 group-hover:inline-block">
                {formatEntryListDate(entry.date)}
              </span>
            )}
          </div>
        )}
      </Link>

      {!renaming && (
        <div
          className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {menu}
        </div>
      )}
    </div>
  );
}

function DraggableEntryRow({
  id,
  active,
  selected,
  basePath,
  entry,
  menu,
  phases,
  indent = 0,
  renaming = false,
  onRenameCommit,
  onRenameCancel,
  onContextMenu,
  onSelectClick,
  onOpenIntent,
  isOverEntry,
  wasDraggedRef,
}: {
  id: string;
  active: boolean;
  selected?: boolean;
  basePath: string;
  entry: EntryMeta;
  menu: ReactNode;
  phases?: Record<string, ProjectPhase> | null;
  indent?: number;
  renaming?: boolean;
  onRenameCommit?: (title: string) => void;
  onRenameCancel?: () => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
  onSelectClick?: (e: ReactMouseEvent, id: string) => void;
  onOpenIntent?: (id: string) => void;
  isOverEntry?: boolean;
  wasDraggedRef?: MutableRefObject<boolean>;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id,
    disabled: renaming,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id,
    disabled: renaming,
  });

  const setCombinedRef = (node: HTMLElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  return (
    <EntryRowShell
      id={id}
      active={active}
      selected={selected}
      basePath={basePath}
      entry={entry}
      menu={menu}
      phases={phases}
      indent={indent}
      renaming={renaming}
      onRenameCommit={onRenameCommit}
      onRenameCancel={onRenameCancel}
      rowRef={setCombinedRef}
      rowStyle={{
        opacity: isDragging ? 0.35 : 1,
      }}
      dragAttributes={attributes}
      dragListeners={listeners}
      isDragging={isDragging}
      isOver={(isOverEntry ?? isOver) && !isDragging}
      onContextMenu={onContextMenu}
      onSelectClick={onSelectClick}
      onOpenIntent={onOpenIntent}
      wasDraggedRef={wasDraggedRef}
    />
  );
}

function FolderRowShell({
  name,
  open,
  count,
  depth,
  onToggle,
  menu,
  rowRef,
  rowStyle,
  onNewEntry,
  onNewSubfolder,
  renaming = false,
  onRenameCommit,
  onRenameCancel,
  onContextMenu,
  onPlainClick,
  dragListeners,
  dragAttributes,
  isOver,
}: {
  name: string;
  open: boolean;
  count: number;
  depth: number;
  onToggle: () => void;
  menu: ReactNode;
  rowRef?: (node: HTMLElement | null) => void;
  rowStyle?: CSSProperties;
  onNewEntry?: () => void;
  onNewSubfolder?: () => void;
  renaming?: boolean;
  onRenameCommit?: (name: string) => void;
  onRenameCancel?: () => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
  onPlainClick?: () => void;
  dragListeners?: DraggableSyntheticListeners;
  dragAttributes?: DraggableAttributes;
  isOver?: boolean;
}) {
  return (
    <div
      ref={rowRef}
      style={{
        ...rowStyle,
        paddingLeft: `${Math.max(6, depth * 18 + 6)}px`,
      }}
      className={`group relative flex h-[26px] items-center gap-1 rounded pr-1 text-nb-label text-nb-on-surface hover:bg-nb-surface/80 select-none transition-colors ${
        renaming ? "cursor-default" : "cursor-pointer"
      } ${isOver ? "bg-nb-primary/20 ring-1 ring-nb-primary/60 font-medium" : ""}`}
      onClick={
        renaming
          ? undefined
          : (e) => {
              e.stopPropagation();
              if (!(e.metaKey || e.ctrlKey || e.shiftKey)) onPlainClick?.();
              onToggle();
            }
      }
      onContextMenu={onContextMenu}
      {...(renaming ? {} : dragAttributes)}
      {...(renaming ? {} : dragListeners)}
    >
      {/* Indentation guide lines */}
      {depth > 0 &&
        Array.from({ length: depth }).map((_, i) => (
          <span
            key={i}
            className="pointer-events-none absolute top-0 bottom-0 border-l border-nb-outline-variant/20"
            style={{ left: `${i * 18 + 12}px` }}
          />
        ))}

      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden py-0.5">
        <span className="shrink-0 text-nb-on-surface-variant/80 transition-transform">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>

        {open ? (
          <FolderOpen size={14} className="shrink-0 text-nb-primary/90" />
        ) : (
          <Folder size={14} className="shrink-0 text-nb-on-surface-variant/80" />
        )}

        {renaming && onRenameCommit && onRenameCancel ? (
          <InlineRenameInput
            initialValue={name}
            ariaLabel="Rename folder"
            onCommit={onRenameCommit}
            onCancel={onRenameCancel}
          />
        ) : (
          <span className="truncate text-xs font-medium text-nb-on-surface">{name}</span>
        )}

        {!renaming && (
          <span className="shrink-0 font-mono text-[10px] text-nb-on-surface-variant/50">
            {count}
          </span>
        )}
      </div>

      {!renaming && (
        <div
          className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {onNewEntry && (
            <button
              type="button"
              className="rounded p-0.5 text-nb-on-surface-variant hover:bg-nb-surface hover:text-nb-on-surface"
              title="New entry in folder"
              aria-label="New entry in folder"
              onClick={onNewEntry}
            >
              <Plus size={13} />
            </button>
          )}
          {onNewSubfolder && (
            <button
              type="button"
              className="rounded p-0.5 text-nb-on-surface-variant hover:bg-nb-surface hover:text-nb-on-surface"
              title="New subfolder"
              aria-label="New subfolder"
              onClick={onNewSubfolder}
            >
              <FolderPlus size={13} />
            </button>
          )}
          {menu}
        </div>
      )}
    </div>
  );
}

function DraggableAndDroppableFolderRow({
  id,
  name,
  open,
  count,
  depth,
  onToggle,
  menu,
  onNewEntry,
  onNewSubfolder,
  renaming = false,
  onRenameCommit,
  onRenameCancel,
  onContextMenu,
  onPlainClick,
  isOverFolder,
}: {
  id: string;
  name: string;
  open: boolean;
  count: number;
  depth: number;
  onToggle: () => void;
  menu: ReactNode;
  onNewEntry?: () => void;
  onNewSubfolder?: () => void;
  renaming?: boolean;
  onRenameCommit?: (name: string) => void;
  onRenameCancel?: () => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
  onPlainClick?: () => void;
  isOverFolder?: boolean;
}) {
  const fullId = `folder:${id}`;
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: fullId,
    disabled: renaming,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: fullId,
    disabled: renaming,
  });

  const setCombinedRef = (node: HTMLElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  return (
    <FolderRowShell
      name={name}
      open={open}
      count={count}
      depth={depth}
      onToggle={onToggle}
      menu={menu}
      rowRef={setCombinedRef}
      rowStyle={{
        opacity: isDragging ? 0.35 : 1,
      }}
      onNewEntry={onNewEntry}
      onNewSubfolder={onNewSubfolder}
      renaming={renaming}
      onRenameCommit={onRenameCommit}
      onRenameCancel={onRenameCancel}
      dragAttributes={attributes}
      dragListeners={listeners}
      onContextMenu={onContextMenu}
      onPlainClick={onPlainClick}
      isOver={(isOverFolder ?? isOver) && !isDragging}
    />
  );
}

function EmptyFolderDropTarget({
  folderId,
  depth,
  isOver,
}: {
  folderId: string;
  depth: number;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({
    id: `folder-empty:${folderId}`,
  });

  return (
    <div
      ref={setNodeRef}
      className={`relative flex h-[24px] items-center text-[11px] italic transition-colors rounded ${
        isOver
          ? "bg-nb-primary/20 text-nb-primary ring-1 ring-nb-primary/60"
          : "text-nb-on-surface-variant/40"
      }`}
      style={{ paddingLeft: `${(depth + 1) * 18 + 20}px` }}
    >
      {/* Indentation guide lines */}
      {Array.from({ length: depth + 1 }).map((_, i) => (
        <span
          key={i}
          className="pointer-events-none absolute top-0 bottom-0 border-l border-nb-outline-variant/20"
          style={{ left: `${i * 18 + 14}px` }}
        />
      ))}
      (empty)
    </div>
  );
}

function RootDropTarget({ isOver, active }: { isOver: boolean; active?: boolean }) {
  const { setNodeRef } = useDroppable({
    id: "root-drop-target",
  });

  return (
    <div
      ref={setNodeRef}
      aria-label="Drop to move to root"
      className={`my-1 min-h-[48px] flex-1 rounded-nb border transition-colors ${
        isOver
          ? "border-nb-primary bg-nb-primary/10"
          : active
            ? "border-nb-outline-variant/45"
            : "border-transparent"
      }`}
    />
  );
}

type FolderTreeMap = Record<string, { name: string; parentId: string | null; order: number }>;

function MoveToFolderDialog({
  open,
  onClose,
  folders,
  childrenByParent,
  excludeFolderId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  folders: FolderTreeMap;
  childrenByParent: Record<string, string[]>;
  /** Current folder — shown but not selectable. null means root (no folder). */
  excludeFolderId?: string | null;
  onSelect: (folderId: string | null) => void;
}) {
  function pick(folderId: string | null) {
    if (folderId === excludeFolderId) return;
    onSelect(folderId);
    onClose();
  }

  function renderFolder(fid: string, depth: number): ReactNode {
    const folder = folders[fid];
    if (!folder) return null;
    const disabled = fid === excludeFolderId;
    const kids = childrenByParent[fid] ?? [];
    return (
      <div key={fid}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => pick(fid)}
          className={`flex w-full items-center gap-2 rounded-nb px-2 py-1.5 text-left text-xs transition-colors ${
            disabled
              ? "cursor-default text-nb-on-surface-variant/40"
              : "text-nb-on-surface hover:bg-nb-primary/10 hover:text-nb-primary"
          }`}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          <Folder size={14} className="shrink-0 opacity-70" />
          <span className="truncate">{folder.name}</span>
          {disabled ? (
            <span className="ml-auto shrink-0 text-[10px] text-nb-on-surface-variant/50">
              Current
            </span>
          ) : null}
        </button>
        {kids.map((childId) => renderFolder(childId, depth + 1))}
      </div>
    );
  }

  const rootFolders = childrenByParent.__root__ ?? [];
  const rootDisabled = excludeFolderId === null;

  return (
    <Dialog isOpen={open} onClose={onClose} title="Move to folder">
      <div className="mb-4 max-h-64 overflow-y-auto rounded-nb border border-nb-outline-variant/25 custom-scrollbar">
        <button
          type="button"
          disabled={rootDisabled}
          onClick={() => pick(null)}
          className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors ${
            rootDisabled
              ? "cursor-default text-nb-on-surface-variant/40"
              : "text-nb-on-surface hover:bg-nb-primary/10 hover:text-nb-primary"
          }`}
        >
          <Folder size={14} className="shrink-0 opacity-70" />
          <span className="italic text-nb-on-surface-variant">(Root)</span>
          {rootDisabled ? (
            <span className="ml-auto shrink-0 text-[10px] text-nb-on-surface-variant/50">
              Current
            </span>
          ) : null}
        </button>
        {rootFolders.length === 0 && Object.keys(folders).length === 0 ? (
          <p className="px-2 py-3 text-[11px] text-nb-on-surface-variant">No folders yet</p>
        ) : (
          rootFolders.map((fid) => renderFolder(fid, 0))
        )}
      </div>
      <Button variant="secondary" className="w-full" onClick={onClose}>
        Cancel
      </Button>
    </Dialog>
  );
}

export function NotebookEntryList({
  activeEntryId,
  collapsed,
  onToggleCollapsed,
  basePath,
  hideCollapseControl = false,
}: {
  activeEntryId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  basePath: string;
  /** Full-screen mobile list — no desktop collapse control. */
  hideCollapseControl?: boolean;
}) {
  const {
    orgId,
    notebookId,
    entries,
    folders,
    notebookSummary,
    refresh,
    setEntries,
    setFolders,
    setError,
    showConfirm,
    optimisticEntryId,
    setOptimisticEntryId,
  } = useNotebookWorkspace();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(
    () => loadExplorerFilters(notebookId).filtersOpen
  );
  const [filters, setFilters] = useState<EntryFilters>(
    () => loadExplorerFilters(notebookId).filters
  );
  const [sortMode, setSortMode] = useState<EntrySortMode>(
    () => loadExplorerFilters(notebookId).sortMode
  );
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [renaming, setRenaming] = useState<RenameTarget | null>(null);
  const lastClickedIdRef = useRef<string | null>(null);

  useEffect(() => {
    const loaded = loadExplorerFilters(notebookId);
    setFiltersOpen(loaded.filtersOpen);
    setFilters(loaded.filters);
    setSortMode(loaded.sortMode);
  }, [notebookId]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        explorerFilterStorageKey(notebookId),
        JSON.stringify({ filtersOpen, filters, sortMode })
      );
    } catch {
      /* ignore quota */
    }
  }, [notebookId, filtersOpen, filters, sortMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const q = query.trim().toLowerCase();
  const filtersActive = Boolean(
    filters.phaseId ||
      filters.author ||
      filters.dateFrom ||
      filters.dateTo ||
      filters.kind !== "all"
  );
  const filtering = Boolean(q) || filtersActive;

  const phaseList = useMemo(() => {
    const raw = (notebookSummary?.phases || {}) as Record<
      string,
      { name?: string; order?: number }
    >;
    return Object.entries(raw).sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));
  }, [notebookSummary]);

  const phaseNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [id, p] of phaseList) map[id] = p.name || id;
    return map;
  }, [phaseList]);

  const availableAuthors = useMemo(() => {
    const names = new Set<string>();
    for (const e of Object.values(entries)) {
      for (const a of e.authors || []) names.add(a);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const phases = (notebookSummary?.phases || null) as Record<string, ProjectPhase> | null;
  const phaseCfgMap = useMemo(
    () => getPhaseConfig(getPhases(phases || {})),
    [phases]
  );

  const { folderList, byFolder, childrenByParent, unfiled, templates, flatMatches } =
    useMemo(() => {
      const folderList = Object.entries(folders).sort(
        (a, b) =>
          a[1].name.localeCompare(b[1].name, undefined, {
            sensitivity: "base",
            numeric: true,
          }) || a[0].localeCompare(b[0])
      );
      const childrenByParent: Record<string, string[]> = { __root__: [] };
      for (const [fid, folder] of folderList) {
        const parent = folder.parentId && folders[folder.parentId] ? folder.parentId : "__root__";
        (childrenByParent[parent] ??= []).push(fid);
      }
      const byFolder: Record<string, [string, EntryMeta][]> = {};
      const unfiled: [string, EntryMeta][] = [];
      const templates: [string, EntryMeta][] = [];
      const flatMatches: [string, EntryMeta][] = [];
      for (const [id, e] of Object.entries(entries)) {
        if (e.isTemplate) templates.push([id, e]);
        if (!entryMatchesFilters(e, q, filters, phaseNames)) continue;
        flatMatches.push([id, e]);
        const fid = e.folderId;
        if (fid && folders[fid]) {
          (byFolder[fid] ??= []).push([id, e]);
        } else {
          unfiled.push([id, e]);
        }
      }
      const mode = sortMode;
      for (const list of Object.values(byFolder)) sortEntries(list, mode, phaseNames);
      sortEntries(unfiled, mode, phaseNames);
      sortEntries(templates, mode, phaseNames);
      sortEntries(flatMatches, mode, phaseNames);
      return { folderList, byFolder, childrenByParent, unfiled, templates, flatMatches };
    }, [entries, folders, q, filters, phaseNames, sortMode]);

  const entryCount = Object.keys(entries).length;
  const matchedEntryCount =
    unfiled.length + Object.values(byFolder).reduce((n, list) => n + list.length, 0);

  const visibleEntryIds = useMemo(() => {
    const ids: string[] = [];
    const walk = (parentKey: string) => {
      for (const fid of childrenByParent[parentKey] ?? []) {
        if (!collapsedFolders.has(fid)) {
          for (const [id] of byFolder[fid] ?? []) ids.push(id);
          walk(fid);
        }
      }
    };
    walk("__root__");
    for (const [id] of unfiled) ids.push(id);
    return ids;
  }, [byFolder, childrenByParent, collapsedFolders, unfiled]);

  function handleSelectClick(e: ReactMouseEvent, id: string) {
    if (e.shiftKey) {
      const anchor = lastClickedIdRef.current;
      if (anchor) {
        const a = visibleEntryIds.indexOf(anchor);
        const b = visibleEntryIds.indexOf(id);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          setSelectedIds(new Set(visibleEntryIds.slice(lo, hi + 1)));
          return;
        }
      }
      setSelectedIds(new Set([id]));
      lastClickedIdRef.current = id;
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      lastClickedIdRef.current = id;
      return;
    }
    // Plain click: clear multi-select but keep this row as the shift-range anchor.
    setSelectedIds(new Set());
    lastClickedIdRef.current = id;
  }

  function clearSelection() {
    setSelectedIds(new Set());
    lastClickedIdRef.current = null;
  }

  function bulkDelete() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    showConfirm(
      `Delete ${ids.length} items?`,
      "Selected entries and templates will be permanently deleted.",
      () => {
        void (async () => {
          try {
            await Promise.all(
              ids.map((id) => cloudApi.deleteEntry(orgId, notebookId, id))
            );
            clearSelection();
            refresh();
            showNotification(`Deleted ${ids.length} items`, "success");
          } catch (err) {
            const message = (err as Error).message;
            setError(message);
            refresh();
          }
        })();
      },
      "danger"
    );
  }

  function bulkMove(folderId: string | null) {
    const ids = [...selectedIds];
    if (!ids.length) return;
    const destSiblings = Object.entries(entries)
      .filter(([eid, e]) => !ids.includes(eid) && (e.folderId ?? null) === folderId)
      .sort(
        (a, b) =>
          a[1].title.localeCompare(b[1].title, undefined, {
            sensitivity: "base",
            numeric: true,
          }) || a[0].localeCompare(b[0])
      )
      .map(([eid]) => eid);
    void cloudApi
      .reorderEntries(orgId, notebookId, {
        mode: "explorer",
        folderId,
        orderedIds: [...destSiblings, ...ids],
      })
      .then(() => {
        clearSelection();
        refresh();
        showNotification(`Moved ${ids.length} items`, "success");
      })
      .catch((err) => {
        const message = (err as Error).message;
        setError(message);
        refresh();
      });
  }

  function persistExplorerOrder(orderedIds: string[]) {
    // Same-folder DnD: only rewrite explorerOrder (leave folderId alone).
    void cloudApi
      .reorderEntries(orgId, notebookId, { mode: "explorer", orderedIds })
      .then(() => refresh())
      .catch((err) => {
        const message = (err as Error).message;
        setError(message);
        refresh();
      });
  }

  function persistFolderOrder(parentKey: string, orderedFolderIds: string[]) {
    void (async () => {
      try {
        await Promise.all(
          orderedFolderIds.map((fid, index) =>
            cloudApi.patchFolder(orgId, notebookId, fid, {
              order: index,
              parentId: parentKey === "__root__" ? null : parentKey,
            })
          )
        );
        refresh();
      } catch (err) {
        const message = (err as Error).message;
        setError(message);
        refresh();
      }
    })();
  }

  function createEntry(opts: {
    title: string;
    isTemplate?: boolean;
    folderId?: string | null;
    fromId?: string;
    /** When true (default for blank creates), focus an inline rename field. */
    renameAfter?: boolean;
  }) {
    const authors = readDefaultAuthors();
    const renameAfter = opts.renameAfter ?? !opts.fromId;
    void (async () => {
      try {
        let content: unknown = null;
        let meta: EntryMeta | undefined;
        if (opts.fromId) {
          meta = entries[opts.fromId];
          content = await cloudApi.getEntryContent(orgId, notebookId, opts.fromId).catch(() => null);
        }
        const folderId = opts.folderId ?? meta?.folderId ?? null;
        const today = getLocalDateString();
        const sameDay = Object.values(entries).filter(
          (e) => !e.isTemplate && (e.date || "") === today
        );
        const nextDayOrder = sameDay.length
          ? Math.max(...sameDay.map((e) => e.order ?? 0)) + 1
          : 0;
        const title = opts.title;
        const isTemplate = opts.isTemplate ?? false;
        const phase = meta?.phase ?? null;
        const entryAuthors = meta?.authors ?? (authors.length ? authors : undefined);
        const created = await cloudApi.createEntry(orgId, notebookId, {
          title,
          order: nextDayOrder,
          explorerOrder: 0,
          date: today,
          folderId,
          isTemplate,
          authors: entryAuthors,
          phase,
        });
        if (content != null) {
          await cloudApi.putEntryContent(orgId, notebookId, created.id, content);
        }
        if (folderId) {
          setCollapsedFolders((prev) => {
            if (!prev.has(folderId)) return prev;
            const next = new Set(prev);
            next.delete(folderId);
            return next;
          });
        }
        if (setEntries) {
          setEntries((prev) => ({
            ...prev,
            [created.id]: {
              title,
              folderId,
              order: nextDayOrder,
              explorerOrder: 0,
              date: today,
              phase,
              authors: entryAuthors,
              isTemplate,
            },
          }));
        }
        if (renameAfter) setRenaming({ kind: "entry", id: created.id });
        refresh();
        router.push(`${basePath}/entries/${created.id}`);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }

  function createFolderImmediate(parentId: string | null = null, defaultName = "New folder") {
    void (async () => {
      try {
        const created = await cloudApi.createFolder(orgId, notebookId, {
          name: defaultName,
          parentId,
        });
        if (parentId) {
          setCollapsedFolders((prev) => {
            if (!prev.has(parentId)) return prev;
            const next = new Set(prev);
            next.delete(parentId);
            return next;
          });
        }
        if (setFolders) {
          setFolders(created.folders);
        }
        setRenaming({ kind: "folder", id: created.id });
        refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }

  function commitRename(target: RenameTarget, nextName: string) {
    setRenaming(null);
    const trimmed = nextName.trim();
    if (!trimmed) return;
    if (target.kind === "entry") {
      const current = entries[target.id]?.title || "";
      if (trimmed === current) return;
      if (setEntries) {
        setEntries((prev) => {
          const item = prev[target.id];
          if (!item) return prev;
          return { ...prev, [target.id]: { ...item, title: trimmed } };
        });
      }
      void cloudApi
        .patchEntry(orgId, notebookId, target.id, { title: trimmed })
        .then(() => refresh())
        .catch((err) => {
          setError((err as Error).message);
          refresh();
        });
      return;
    }
    const current = folders[target.id]?.name ?? "";
    if (trimmed === current) return;
    if (setFolders) {
      setFolders((prev) => {
        const item = prev[target.id];
        if (!item) return prev;
        return { ...prev, [target.id]: { ...item, name: trimmed } };
      });
    }
    void cloudApi
      .patchFolder(orgId, notebookId, target.id, { name: trimmed })
      .then(() => refresh())
      .catch((err) => {
        setError((err as Error).message);
        refresh();
      });
  }

  function duplicateEntry(id: string) {
    const meta = entries[id];
    createEntry({
      title: `${meta?.title || "Entry"} (copy)`,
      isTemplate: Boolean(meta?.isTemplate),
      fromId: id,
    });
  }

  function deleteEntry(id: string) {
    const meta = entries[id];
    const label = meta?.isTemplate ? "template" : "entry";
    showConfirm(
      `Delete ${label}?`,
      `Delete "${meta?.title || "Untitled"}"? This cannot be undone.`,
      () => {
        void cloudApi
          .deleteEntry(orgId, notebookId, id)
          .then(() => {
            refresh();
            if (activeEntryId === id) router.push(basePath);
          })
          .catch((err) => setError((err as Error).message));
      },
      "danger"
    );
  }

  function moveEntry(id: string, folderId: string | null) {
    const srcFolder = entries[id]?.folderId ?? null;
    if (srcFolder === folderId) return;

    // Optimistic local update
    if (setEntries) {
      setEntries((prev) => {
        const item = prev[id];
        if (!item) return prev;
        return {
          ...prev,
          [id]: { ...item, folderId },
        };
      });
    }

    const dest = Object.entries(entries).filter(
      ([eid, e]) => eid !== id && (e.folderId ?? null) === folderId
    );
    sortEntries(dest);
    const destIds = [...dest.map(([eid]) => eid), id];

    const src = Object.entries(entries).filter(
      ([eid, e]) => eid !== id && (e.folderId ?? null) === srcFolder
    );
    sortEntries(src);
    const srcIds = src.map(([eid]) => eid);

    void (async () => {
      try {
        await cloudApi.reorderEntries(orgId, notebookId, {
          mode: "explorer",
          folderId,
          orderedIds: destIds,
        });
        if (srcIds.length) {
          await cloudApi.reorderEntries(orgId, notebookId, {
            mode: "explorer",
            folderId: srcFolder,
            orderedIds: srcIds,
          });
        }
        refresh();
      } catch (err) {
        const message = (err as Error).message;
        setError(message);
        refresh();
      }
    })();
  }

  function renameFolder(folderId: string) {
    setRenaming({ kind: "folder", id: folderId });
  }

  function renameEntry(entryId: string) {
    setRenaming({ kind: "entry", id: entryId });
  }

  function deleteFolder(folderId: string) {
    const name = folders[folderId]?.name ?? "Folder";
    showConfirm(
      "Delete folder?",
      `Delete "${name}"? Entries inside will move to root.`,
      () => {
        void cloudApi
          .deleteFolder(orgId, notebookId, folderId)
          .then(() => refresh())
          .catch((err) => setError((err as Error).message));
      },
      "danger"
    );
  }

  function toggleFolder(id: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [moveDialog, setMoveDialog] = useState<{
    mode: "entry" | "bulk";
    entryId?: string;
    excludeFolderId?: string | null;
  } | null>(null);

  function openMoveDialog(next: {
    mode: "entry" | "bulk";
    entryId?: string;
    excludeFolderId?: string | null;
  }) {
    setMoveDialog(next);
  }

  function getBulkMenuItems(): MenuItem[] {
    return [
      {
        id: "bulk-label",
        label: `${selectedIds.size} selected`,
        disabled: true,
        onSelect: () => undefined,
      },
      { id: "sep-bulk", label: "", separator: true },
      {
        id: "bulk-move",
        label: "Move to…",
        icon: <Folder size={12} />,
        onSelect: () => openMoveDialog({ mode: "bulk" }),
      },
      { id: "sep-bulk-del", label: "", separator: true },
      {
        id: "bulk-del",
        label: "Delete selected",
        icon: <Trash2 size={12} />,
        danger: true,
        onSelect: () => bulkDelete(),
      },
    ];
  }

  function getEntryMenuItems(id: string, e: EntryMeta): MenuItem[] {
    return [
      {
        id: "open",
        label: "Open",
        onSelect: () => router.push(`${basePath}/entries/${id}`),
      },
      {
        id: "rename",
        label: "Rename",
        onSelect: () => renameEntry(id),
      },
      ...(e.isTemplate
        ? [
            {
              id: "from-tpl",
              label: "New entry from template",
              onSelect: () =>
                createEntry({
                  title: e.title || "New Entry",
                  isTemplate: false,
                  fromId: id,
                }),
            },
          ]
        : []),
      {
        id: "dup",
        label: "Duplicate",
        icon: <Copy size={12} />,
        onSelect: () => duplicateEntry(id),
      },
      { id: "sep-move", label: "", separator: true },
      {
        id: "move",
        label: "Move to…",
        icon: <Folder size={12} />,
        onSelect: () =>
          openMoveDialog({
            mode: "entry",
            entryId: id,
            excludeFolderId: e.folderId ?? null,
          }),
      },
      { id: "sep-del", label: "", separator: true },
      {
        id: "del",
        label: "Delete",
        icon: <Trash2 size={12} />,
        danger: true,
        onSelect: () => deleteEntry(id),
      },
    ];
  }

  function getFolderMenuItems(fid: string): MenuItem[] {
    return [
      {
        id: "new-here",
        label: "New entry here",
        icon: <Plus size={12} />,
        onSelect: () => createEntry({ title: "Untitled entry", folderId: fid }),
      },
      {
        id: "new-subfolder",
        label: "New subfolder",
        icon: <FolderPlus size={12} />,
        onSelect: () => createFolderImmediate(fid, "New folder"),
      },
      { id: "sep-folder", label: "", separator: true },
      {
        id: "rename",
        label: "Rename folder",
        onSelect: () => renameFolder(fid),
      },
      {
        id: "del-folder",
        label: "Delete folder",
        danger: true,
        icon: <Trash2 size={12} />,
        onSelect: () => deleteFolder(fid),
      },
    ];
  }

  function handleFolderContextMenu(e: ReactMouseEvent, fid: string) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: getFolderMenuItems(fid),
    });
  }

  function handleEntryContextMenu(e: ReactMouseEvent, id: string, entryMeta: EntryMeta) {
    e.preventDefault();
    e.stopPropagation();
    const bulk =
      selectedIds.size > 1 && selectedIds.has(id) ? getBulkMenuItems() : getEntryMenuItems(id, entryMeta);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: bulk,
    });
  }

  function handleRootContextMenu(e: ReactMouseEvent) {
    // Only if right clicking on the empty background of the nav
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains("custom-scrollbar")) {
      return;
    }
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          id: "new-root-entry",
          label: "New entry",
          icon: <Plus size={12} />,
          onSelect: () => createEntry({ title: "Untitled entry" }),
        },
        {
          id: "new-root-folder",
          label: "New folder",
          icon: <FolderPlus size={12} />,
          onSelect: () => createFolderImmediate(null, "New folder"),
        },
      ],
    });
  }

  function moveFolder(folderId: string, targetParentId: string | null) {
    if (folderId === targetParentId) return;
    const currentParentId = folders[folderId]?.parentId ?? null;
    if (currentParentId === targetParentId) return;

    // Check circular reparenting: targetParentId cannot be a descendant of folderId
    let curr: string | null = targetParentId;
    while (curr) {
      if (curr === folderId) return;
      curr = folders[curr]?.parentId ?? null;
    }

    if (setFolders) {
      setFolders((prev) => {
        const item = prev[folderId];
        if (!item) return prev;
        return {
          ...prev,
          [folderId]: { ...item, parentId: targetParentId },
        };
      });
    }

    void cloudApi
      .patchFolder(orgId, notebookId, folderId, {
        parentId: targetParentId,
      })
      .then(() => refresh())
      .catch((err) => {
        setError((err as Error).message);
        refresh();
      });
  }

  const customCollisionStrategy: CollisionDetection = (args) => {
    // 1. First prioritize pointerWithin (exact cursor position over items)
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      const itemCollision = pointerCollisions.find((c) => c.id !== "root-drop-target");
      if (itemCollision) return [itemCollision];
      return pointerCollisions;
    }

    // 2. Next check rect intersection
    const rectCollisions = rectIntersection(args);
    if (rectCollisions.length > 0) {
      const itemCollision = rectCollisions.find((c) => c.id !== "root-drop-target");
      if (itemCollision) return [itemCollision];
      return rectCollisions;
    }

    return [];
  };

  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const wasDraggedRef = useRef(false);

  function handleDragStart(event: DragStartEvent) {
    wasDraggedRef.current = true;
    setActiveDragId(String(event.active.id));
  }

  function handleDragCancel() {
    setDragOverId(null);
    setActiveDragId(null);
    // Keep wasDraggedRef true briefly to suppress immediate click on mouse-up
    setTimeout(() => {
      wasDraggedRef.current = false;
    }, 120);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) {
      setDragOverId(null);
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId === overId) {
      setDragOverId(null);
      return;
    }

    setDragOverId(overId);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDragOverId(null);
    setActiveDragId(null);
    setTimeout(() => {
      wasDraggedRef.current = false;
    }, 120);

    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId === overId) return;

    const isActiveFolder = activeId.startsWith("folder:");
    const isOverFolder = overId.startsWith("folder:");
    const isOverEmptyFolder = overId.startsWith("folder-empty:");

    const activeCleanId = isActiveFolder ? activeId.replace(/^folder:/, "") : activeId;
    const overCleanId = isOverFolder
      ? overId.replace(/^folder:/, "")
      : isOverEmptyFolder
      ? overId.replace(/^folder-empty:/, "")
      : overId;

    // Dropped onto empty folder row or folder row
    if (isOverEmptyFolder || isOverFolder) {
      if (isActiveFolder) {
        moveFolder(activeCleanId, overCleanId);
      } else {
        moveEntry(activeCleanId, overCleanId);
      }
      return;
    }

    // Dropped onto Root Drop Target
    if (overId === "root-drop-target") {
      if (isActiveFolder) {
        moveFolder(activeCleanId, null);
      } else {
        moveEntry(activeCleanId, null);
      }
      return;
    }

    // Dropped onto an entry: place in that entry's folder
    const targetEntry = entries[overId];
    if (targetEntry) {
      const targetFolderId = targetEntry.folderId ?? null;
      if (isActiveFolder) {
        moveFolder(activeCleanId, targetFolderId);
      } else {
        moveEntry(activeCleanId, targetFolderId);
      }
    }
  }

  function entryMenu(id: string, e: EntryMeta) {
    return <DropdownMenu items={getEntryMenuItems(id, e)} />;
  }

  function renderEntryList(
    list: [string, EntryMeta][],
    indent = 0
  ) {
    return (
      <>
        {list.map(([id, e]) => (
          <DraggableEntryRow
            key={id}
            id={id}
            active={activeEntryId === id || optimisticEntryId === id}
            selected={selectedIds.has(id)}
            basePath={basePath}
            entry={e}
            menu={entryMenu(id, e)}
            phases={phases}
            indent={indent}
            renaming={renaming?.kind === "entry" && renaming.id === id}
            onRenameCommit={(title) => commitRename({ kind: "entry", id }, title)}
            onRenameCancel={() => setRenaming(null)}
            onContextMenu={(evt) => handleEntryContextMenu(evt, id, e)}
            onSelectClick={handleSelectClick}
            onOpenIntent={(entryId) => setOptimisticEntryId?.(entryId)}
            isOverEntry={dragOverId === id}
            wasDraggedRef={wasDraggedRef}
          />
        ))}
      </>
    );
  }

  function folderMenu(fid: string) {
    return <DropdownMenu items={getFolderMenuItems(fid)} />;
  }

  function renderFolderTree(parentKey: string, depth: number): ReactNode {
    const siblingIds = childrenByParent[parentKey] ?? [];
    if (siblingIds.length === 0) return null;

    const nodes = siblingIds.map((fid) => {
      const folder = folders[fid];
      if (!folder) return null;
      const open = !collapsedFolders.has(fid);
      const kids = byFolder[fid] ?? [];
      const childFolders = childrenByParent[fid] ?? [];
      const count = kids.length + childFolders.length;

      const fullFid = `folder:${fid}`;
      const isOver = dragOverId === fullFid;

      return (
        <div key={fid}>
          <DraggableAndDroppableFolderRow
            id={fid}
            name={folder.name}
            open={open}
            count={count}
            depth={depth}
            onToggle={() => toggleFolder(fid)}
            menu={folderMenu(fid)}
            onContextMenu={(e) => handleFolderContextMenu(e, fid)}
            onPlainClick={clearSelection}
            isOverFolder={isOver}
            renaming={renaming?.kind === "folder" && renaming.id === fid}
            onRenameCommit={(name) => commitRename({ kind: "folder", id: fid }, name)}
            onRenameCancel={() => setRenaming(null)}
            onNewEntry={() => createEntry({ title: "Untitled entry", folderId: fid })}
            onNewSubfolder={() => createFolderImmediate(fid, "New folder")}
          />
          {open && (
            <div className="relative">
              {renderFolderTree(fid, depth + 1)}
              {renderEntryList(kids, depth + 1)}
              {!filtering && kids.length === 0 && childFolders.length === 0 && (
                <EmptyFolderDropTarget
                  folderId={fid}
                  depth={depth}
                  isOver={dragOverId === `folder-empty:${fid}`}
                />
              )}
            </div>
          )}
        </div>
      );
    });

    return <>{nodes}</>;
  }

  if (collapsed) {
    return (
      <div className="flex w-10 shrink-0 flex-col items-center border-r border-nb-outline-variant/30 bg-nb-surface-low py-2">
        <IconButton aria-label="Expand entry list" onClick={onToggleCollapsed}>
          <PanelLeft size={16} />
        </IconButton>
      </div>
    );
  }

  const sensors = useAppDndSensors();

  return (
    <aside className="flex h-full w-full min-w-0 flex-col border-r border-nb-outline-variant/30 bg-nb-surface-low">
      <div className="flex items-center gap-1 border-b border-nb-outline-variant/20 px-2 py-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-nb-on-surface-variant"
          />
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search… (/)"
            className="w-full rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface py-1.5 pr-2 pl-8 text-nb-label outline-none focus:border-nb-primary"
          />
        </div>
        <IconButton
          aria-label="Toggle filters"
          title="Filters"
          aria-pressed={filtersOpen || filtersActive}
          onClick={() => setFiltersOpen((v) => !v)}
          className={filtersActive || filtersOpen ? "text-nb-primary" : undefined}
        >
          <SlidersHorizontal size={16} />
        </IconButton>
        {!hideCollapseControl && (
          <IconButton aria-label="Collapse entry list" onClick={onToggleCollapsed}>
            <PanelLeftClose size={16} />
          </IconButton>
        )}
      </div>

      {filtersOpen && (
        <div className="shrink-0 border-b border-nb-outline-variant/30 bg-nb-surface/50 shadow-[inset_0_-1px_0_0_rgb(0_0_0/0.04)]">
          <div className="custom-scrollbar max-h-52 space-y-3 overflow-y-auto px-2.5 py-3 text-nb-caption">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-nb-on-surface-variant/70">
                  Sort by
                </span>
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as EntrySortMode)}
                  className="h-9 w-full rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface px-2 text-nb-label outline-none focus:border-nb-primary"
                >
                  <option value="name">Name</option>
                  <option value="date">Date</option>
                  <option value="phase">Phase</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-nb-on-surface-variant/70">
                  Show
                </span>
                <select
                  value={filters.kind}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      kind: e.target.value as EntryFilters["kind"],
                    }))
                  }
                  className="h-9 w-full rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface px-2 text-nb-label outline-none focus:border-nb-primary"
                >
                  <option value="all">All</option>
                  <option value="entries">Entries</option>
                  <option value="templates">Templates</option>
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-nb-on-surface-variant/70">
                Phase
              </span>
              <PhasePicker
                phaseId={filters.phaseId}
                phases={phases}
                emptyLabel="Any phase"
                onChange={(phaseId) => setFilters((f) => ({ ...f, phaseId }))}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-nb-on-surface-variant/70">
                Author
              </span>
              <input
                list={`nb-authors-${notebookId}`}
                value={filters.author ?? ""}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    author: e.target.value || null,
                  }))
                }
                placeholder="Any author"
                className="h-9 w-full rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface px-2.5 text-nb-label outline-none focus:border-nb-primary"
              />
              <datalist id={`nb-authors-${notebookId}`}>
                {availableAuthors.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-nb-on-surface-variant/70">
                  From
                </span>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                  className="h-9 w-full rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface px-2 text-nb-label outline-none focus:border-nb-primary"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-nb-on-surface-variant/70">
                  To
                </span>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                  className="h-9 w-full rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface px-2 text-nb-label outline-none focus:border-nb-primary"
                />
              </label>
            </div>

            {(filtersActive || q) && (
              <div className="flex items-center justify-between gap-2 border-t border-nb-outline-variant/20 pt-2">
                <span className="text-[10px] font-semibold text-nb-on-surface-variant">
                  {[
                    q ? "search" : null,
                    filters.kind !== "all" ? filters.kind : null,
                    filters.phaseId ? "phase" : null,
                    filters.author ? "author" : null,
                    filters.dateFrom || filters.dateTo ? "dates" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Filters on"}
                </span>
                <button
                  type="button"
                  className="text-[10px] font-semibold text-nb-primary hover:underline"
                  onClick={() => {
                    setQuery("");
                    setFilters(EMPTY_FILTERS);
                  }}
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chips only when the panel is closed — avoids shoving the form down while editing. */}
      {!filtersOpen && (filtersActive || q) && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-nb-outline-variant/20 bg-nb-surface/40 px-2.5 py-2">
          {q && (
            <button
              type="button"
              className="inline-flex max-w-full items-center gap-1 rounded-nb bg-nb-surface px-2 py-0.5 text-[10px] font-semibold text-nb-on-surface ring-1 ring-nb-outline-variant/30"
              onClick={() => setQuery("")}
              title="Clear search"
            >
              <span className="truncate">“{query.trim()}”</span>
              <X size={10} />
            </button>
          )}
          {filters.kind !== "all" && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-nb bg-nb-surface px-2 py-0.5 text-[10px] font-semibold text-nb-on-surface ring-1 ring-nb-outline-variant/30"
              onClick={() => setFilters((f) => ({ ...f, kind: "all" }))}
            >
              {filters.kind === "templates" ? "Templates" : "Entries"}
              <X size={10} />
            </button>
          )}
          {filters.phaseId && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-nb"
              onClick={() => setFilters((f) => ({ ...f, phaseId: null }))}
              title="Clear phase"
            >
              <PhaseChip phaseId={filters.phaseId} phases={phases} />
              <X size={10} className="text-nb-on-surface-variant" />
            </button>
          )}
          {filters.author && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-nb bg-nb-surface px-2 py-0.5 text-[10px] font-semibold text-nb-on-surface ring-1 ring-nb-outline-variant/30"
              onClick={() => setFilters((f) => ({ ...f, author: null }))}
            >
              {filters.author}
              <X size={10} />
            </button>
          )}
          {(filters.dateFrom || filters.dateTo) && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-nb bg-nb-surface px-2 py-0.5 text-[10px] font-semibold text-nb-on-surface ring-1 ring-nb-outline-variant/30"
              onClick={() => setFilters((f) => ({ ...f, dateFrom: "", dateTo: "" }))}
            >
              {filters.dateFrom || "…"} → {filters.dateTo || "…"}
              <X size={10} />
            </button>
          )}
          <label className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold text-nb-on-surface-variant">
            Sort
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as EntrySortMode)}
              className="rounded-nb border border-nb-outline-variant/30 bg-nb-surface px-1.5 py-0.5 text-[10px] font-semibold text-nb-on-surface outline-none"
              aria-label="Sort matches"
            >
              <option value="name">Name</option>
              <option value="date">Date</option>
              <option value="phase">Phase</option>
            </select>
          </label>
          <button
            type="button"
            className="text-[10px] font-semibold text-nb-primary hover:underline"
            onClick={() => {
              setQuery("");
              setFilters(EMPTY_FILTERS);
            }}
          >
            Clear all
          </button>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-b border-nb-tertiary/30 bg-nb-tertiary/5 px-2 py-1.5">
          <span className="mr-auto text-[11px] font-semibold text-nb-on-surface">
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            className="rounded px-2 py-1 text-[11px] font-semibold text-nb-primary hover:bg-nb-surface"
            onClick={() => openMoveDialog({ mode: "bulk" })}
          >
            Move…
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-[11px] font-semibold text-nb-danger hover:bg-nb-danger/10"
            onClick={bulkDelete}
          >
            Delete
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-[11px] font-semibold text-nb-on-surface-variant hover:bg-nb-surface"
            onClick={clearSelection}
          >
            Clear
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1 border-b border-nb-outline-variant/15 px-2 py-1">
        <span className="mr-auto text-[11px] font-semibold text-nb-on-surface-variant">
          {entryCount} items
        </span>
        <DropdownMenu
          align="right"
          ariaLabel="New entry"
          trigger={
            <span className="inline-flex items-center gap-1 rounded-nb bg-nb-primary px-2 py-1 text-[11px] font-medium text-white hover:bg-nb-primary-dim">
              <Plus size={12} /> New
            </span>
          }
          items={[
            {
              id: "blank",
              label: "Blank entry",
              icon: <FileText size={14} />,
              onSelect: () => createEntry({ title: "Untitled entry" }),
            },
            {
              id: "blank-template",
              label: "Blank template",
              icon: <LayoutTemplate size={14} />,
              onSelect: () =>
                createEntry({ title: "Untitled template", isTemplate: true }),
            },
            ...templates.map(([tid, te]) => {
              const cfg = te.phase ? phaseCfgMap[te.phase] : null;
              const Icon = cfg?.icon || LayoutTemplate;
              return {
                id: `tpl-${tid}`,
                label: te.title || "Untitled template",
                icon: (
                  <Icon
                    size={14}
                    style={cfg?.color ? { color: cfg.color } : undefined}
                  />
                ),
                onSelect: () =>
                  createEntry({
                    title: te.title || "New Entry",
                    isTemplate: false,
                    fromId: tid,
                  }),
              };
            }),
          ]}
        />
        <IconButton
          aria-label="New folder"
          title="New folder"
          className="h-7 w-7"
          onClick={() => createFolderImmediate(null, "New folder")}
        >
          <FolderPlus size={14} />
        </IconButton>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={customCollisionStrategy}
        autoScroll={false}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        <nav
          className="flex min-h-0 flex-1 flex-col overflow-auto px-1 py-1 custom-scrollbar"
          onContextMenu={handleRootContextMenu}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey) return;
            clearSelection();
          }}
        >
          <div className="flex min-w-full flex-col">
            {filtering ? (
              flatMatches.length > 0 ? (
                renderEntryList(flatMatches, 0)
              ) : null
            ) : (
              <>
                {renderFolderTree("__root__", 0)}
                {unfiled.length > 0 && (
                  <div className="mt-0.5">{renderEntryList(unfiled, 0)}</div>
                )}
              </>
            )}
          </div>

          {!entryCount && !filtering && (
            <p className="px-2 py-6 text-center text-nb-caption text-nb-on-surface-variant">
              No entries yet
            </p>
          )}
          {filtering && matchedEntryCount === 0 && (
            <div className="flex flex-col items-center gap-2 px-2 py-8 text-center">
              <p className="text-nb-caption text-nb-on-surface-variant">No matches</p>
              <button
                type="button"
                className="text-nb-label font-semibold text-nb-primary hover:underline"
                onClick={() => {
                  setQuery("");
                  setFilters(EMPTY_FILTERS);
                }}
              >
                Clear filters
              </button>
            </div>
          )}

          {/* Root empty area droppable target */}
          <RootDropTarget
            active={Boolean(activeDragId)}
            isOver={dragOverId === "root-drop-target"}
          />
        </nav>

        <DragOverlay dropAnimation={null}>
          {activeDragId ? (
            <div className="flex items-center gap-1.5 rounded bg-nb-surface px-2.5 py-1 text-xs font-medium shadow-nb-lg ring-1 ring-nb-outline-variant/30 select-none pointer-events-none">
              {activeDragId.startsWith("folder:") ? (
                <>
                  <Folder size={14} className="text-nb-primary shrink-0" />
                  <span className="truncate max-w-[200px] text-nb-on-surface">
                    {folders[activeDragId.replace(/^folder:/, "")]?.name ?? "Folder"}
                  </span>
                </>
              ) : (
                <>
                  {(() => {
                    const e = entries[activeDragId];
                    if (e?.isTemplate) {
                      return <LayoutTemplate size={14} className="text-nb-tertiary shrink-0" />;
                    }
                    const cfg = e?.phase ? phaseCfgMap[e.phase] : null;
                    const Icon = cfg?.icon || FileText;
                    return (
                      <Icon
                        size={14}
                        className="shrink-0 text-nb-primary"
                        style={cfg?.color ? { color: cfg.color } : undefined}
                      />
                    );
                  })()}
                  <span className="truncate max-w-[200px] text-nb-on-surface">
                    {entries[activeDragId]?.title || "Untitled"}
                  </span>
                </>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <ContextMenu
        open={Boolean(contextMenu)}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        items={contextMenu?.items ?? []}
        onClose={() => setContextMenu(null)}
      />

      <MoveToFolderDialog
        open={Boolean(moveDialog)}
        onClose={() => setMoveDialog(null)}
        folders={folders}
        childrenByParent={childrenByParent}
        excludeFolderId={moveDialog?.excludeFolderId}
        onSelect={(folderId) => {
          if (!moveDialog) return;
          if (moveDialog.mode === "bulk") {
            bulkMove(folderId);
            return;
          }
          if (moveDialog.entryId) moveEntry(moveDialog.entryId, folderId);
        }}
      />
    </aside>
  );
}
