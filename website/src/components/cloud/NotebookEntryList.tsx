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
  AlertTriangle,
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
import { Button, DropdownMenu, IconButton } from "@/components/ui";
import { showNotification } from "@/components/overlays/Notification";
import { cloudApi } from "@/lib/cloud/api";
import { useAppDndSensors } from "@/lib/dnd/dndSensors";
import { readLastAuthors } from "@/lib/notebook/metadata";
import type { ProjectPhase } from "@/lib/notebook/metadata";
import { getPhaseConfig, getPhases } from "@/lib/notebook/phases";
import { PhaseChip } from "./PhaseChip";
import { useNotebookWorkspace } from "./NotebookWorkspaceContext";
import type { EntryMeta } from "./notebook-types";

type EntryFilters = {
  phaseId: string | null;
  author: string | null;
  dateFrom: string;
  dateTo: string;
};

function entryMatchesFilters(
  e: EntryMeta,
  q: string,
  filters: EntryFilters,
  phaseNames: Record<string, string>
): boolean {
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

/** Sort for file-explorer siblings (folders and entries sorted alphabetically). */
function sortEntries(list: [string, EntryMeta][]) {
  return list.sort(
    (a, b) =>
      a[1].title.localeCompare(b[1].title, undefined, { sensitivity: "base", numeric: true }) ||
      (a[1].date || "").localeCompare(b[1].date || "") ||
      a[0].localeCompare(b[0])
  );
}

type ContextMenuState = {
  x: number;
  y: number;
  items: { id: string; label: string; icon?: ReactNode; danger?: boolean; onSelect: () => void }[];
} | null;

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
  onContextMenu,
  onSelectClick,
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
  onContextMenu?: (e: ReactMouseEvent) => void;
  onSelectClick?: (e: ReactMouseEvent, id: string) => void;
  dragListeners?: DraggableSyntheticListeners;
  dragAttributes?: DraggableAttributes;
  isDragging?: boolean;
  isOver?: boolean;
  wasDraggedRef?: MutableRefObject<boolean>;
}) {
  const phaseList = useMemo(() => (phases ? getPhases(phases) : []), [phases]);
  const phaseCfg = useMemo(() => (entry.phase ? getPhaseConfig(phaseList)[entry.phase] : null), [phaseList, entry.phase]);

  return (
    <div
      ref={rowRef}
      style={{
        ...rowStyle,
        paddingLeft: `${Math.max(6, indent * 18 + 8)}px`,
      }}
      className={`group relative flex h-[26px] items-center gap-1.5 rounded pr-1.5 text-nb-label transition-colors select-none cursor-pointer ${
        isOver
          ? "bg-nb-primary/20 ring-1 ring-nb-primary/60 font-medium"
          : selected
          ? "bg-nb-tertiary/15 text-nb-on-surface ring-1 ring-nb-tertiary/40 font-medium"
          : active
          ? "bg-nb-primary/15 text-nb-primary font-medium"
          : "text-nb-on-surface hover:bg-nb-surface/80"
      }`}
      onContextMenu={onContextMenu}
      {...dragAttributes}
      {...dragListeners}
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
        href={`${basePath}/entries/${id}`}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5"
        title={entry.title || "Untitled"}
        onClick={(e) => {
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
          if (onSelectClick && (e.metaKey || e.ctrlKey || e.shiftKey)) {
            e.preventDefault();
            e.stopPropagation();
            onSelectClick(e, id);
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

        <span className="truncate text-xs leading-none">
          {entry.title || "Untitled"}
        </span>

        {entry.isValid === false && (
          <span
            title={(entry.validationErrors || ["Incomplete entry"]).join("\n")}
            className="inline-flex shrink-0 text-nb-warning"
          >
            <AlertTriangle size={12} />
          </span>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-1">
          {entry.date && !entry.isTemplate && (
            <span className="hidden font-mono text-[10px] text-nb-on-surface-variant/60 group-hover:inline-block">
              {entry.date.slice(5)}
            </span>
          )}
        </div>
      </Link>

      <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100" onClick={(e) => e.stopPropagation()}>
        {menu}
      </div>
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
  onContextMenu,
  onSelectClick,
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
  onContextMenu?: (e: ReactMouseEvent) => void;
  onSelectClick?: (e: ReactMouseEvent, id: string) => void;
  isOverEntry?: boolean;
  wasDraggedRef?: MutableRefObject<boolean>;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id,
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
  onContextMenu,
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
  onContextMenu?: (e: ReactMouseEvent) => void;
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
      className={`group relative flex h-[26px] items-center gap-1 rounded pr-1 text-nb-label text-nb-on-surface hover:bg-nb-surface/80 select-none cursor-pointer transition-colors ${
        isOver ? "bg-nb-primary/20 ring-1 ring-nb-primary/60 font-medium" : ""
      }`}
      onClick={onToggle}
      onContextMenu={onContextMenu}
      {...dragAttributes}
      {...dragListeners}
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

        <span className="truncate text-xs font-medium text-nb-on-surface">
          {name}
        </span>

        <span className="shrink-0 font-mono text-[10px] text-nb-on-surface-variant/50">
          {count}
        </span>
      </div>

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
  onContextMenu,
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
  onContextMenu?: (e: ReactMouseEvent) => void;
  isOverFolder?: boolean;
}) {
  const fullId = `folder:${id}`;
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: fullId,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: fullId,
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
      dragAttributes={attributes}
      dragListeners={listeners}
      onContextMenu={onContextMenu}
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

function RootDropTarget({ isOver }: { isOver: boolean }) {
  const { setNodeRef } = useDroppable({
    id: "root-drop-target",
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[80px] flex-1 items-center justify-center rounded border border-dashed transition-colors my-1 ${
        isOver
          ? "border-nb-primary/70 bg-nb-primary/10 text-nb-primary font-medium"
          : "border-transparent text-transparent hover:border-nb-outline-variant/30 hover:text-nb-on-surface-variant/40"
      }`}
    >
      <span className="text-[11px] select-none pointer-events-none">
        {isOver ? "Drop to move to root" : ""}
      </span>
    </div>
  );
}

export function NotebookEntryList({
  activeEntryId,
  collapsed,
  onToggleCollapsed,
  basePath,
}: {
  activeEntryId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  basePath: string;
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
    showPrompt,
    showConfirm,
  } = useNotebookWorkspace();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<EntryFilters>({
    phaseId: null,
    author: null,
    dateFrom: "",
    dateTo: "",
  });
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const lastClickedIdRef = useRef<string | null>(null);

  const q = query.trim().toLowerCase();
  const filtersActive = Boolean(
    filters.phaseId || filters.author || filters.dateFrom || filters.dateTo
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

  const { folderList, byFolder, childrenByParent, unfiled, templates } = useMemo(() => {
    const folderList = Object.entries(folders).sort(
      (a, b) => a[1].name.localeCompare(b[1].name, undefined, { sensitivity: "base", numeric: true }) || a[0].localeCompare(b[0])
    );
    const childrenByParent: Record<string, string[]> = { __root__: [] };
    for (const [fid, folder] of folderList) {
      const parent = folder.parentId && folders[folder.parentId] ? folder.parentId : "__root__";
      (childrenByParent[parent] ??= []).push(fid);
    }
    const byFolder: Record<string, [string, EntryMeta][]> = {};
    const unfiled: [string, EntryMeta][] = [];
    const templates: [string, EntryMeta][] = [];
    for (const [id, e] of Object.entries(entries)) {
      if (e.isTemplate) templates.push([id, e]);
      if (!entryMatchesFilters(e, q, filters, phaseNames)) continue;
      const fid = e.folderId;
      if (fid && folders[fid]) {
        (byFolder[fid] ??= []).push([id, e]);
      } else {
        unfiled.push([id, e]);
      }
    }
    for (const list of Object.values(byFolder)) sortEntries(list);
    sortEntries(unfiled);
    sortEntries(templates);
    return { folderList, byFolder, childrenByParent, unfiled, templates };
  }, [entries, folders, q, filters, phaseNames]);

  const entryCount = Object.keys(entries).length;

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
    if (e.shiftKey && lastClickedIdRef.current) {
      const a = visibleEntryIds.indexOf(lastClickedIdRef.current);
      const b = visibleEntryIds.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const range = visibleEntryIds.slice(lo, hi + 1);
        setSelectedIds(new Set(range));
        return;
      }
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
    setSelectedIds(new Set([id]));
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
  }) {
    const authors = readLastAuthors();
    void (async () => {
      try {
        let content: unknown = null;
        let meta: EntryMeta | undefined;
        if (opts.fromId) {
          meta = entries[opts.fromId];
          content = await cloudApi.getEntryContent(orgId, notebookId, opts.fromId).catch(() => null);
        }
        const folderId = opts.folderId ?? meta?.folderId ?? null;
        const today = new Date().toISOString().slice(0, 10);
        const sameDay = Object.values(entries).filter(
          (e) => !e.isTemplate && (e.date || "") === today
        );
        const nextDayOrder = sameDay.length
          ? Math.max(...sameDay.map((e) => e.order ?? 0)) + 1
          : 0;
        const created = await cloudApi.createEntry(orgId, notebookId, {
          title: opts.title,
          order: nextDayOrder,
          explorerOrder: 0,
          date: today,
          folderId,
          isTemplate: opts.isTemplate ?? false,
          authors: meta?.authors ?? (authors.length ? authors : undefined),
          phase: meta?.phase ?? null,
        });
        if (content != null) {
          await cloudApi.putEntryContent(orgId, notebookId, created.id, content);
        }
        refresh();
        router.push(`${basePath}/entries/${created.id}`);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
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
    const current = folders[folderId]?.name ?? "";
    showPrompt("Rename folder", current, (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      void cloudApi
        .patchFolder(orgId, notebookId, folderId, { name: trimmed })
        .then(() => refresh())
        .catch((err) => setError((err as Error).message));
    }, "Folder name");
  }

  function deleteFolder(folderId: string) {
    const name = folders[folderId]?.name ?? "Folder";
    showConfirm(
      "Delete folder?",
      `Delete "${name}"? Entries inside will move to Unfiled.`,
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

  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = () => setContextMenu(null);
    window.addEventListener("click", handleClose);
    window.addEventListener("contextmenu", handleClose);
    window.addEventListener("scroll", handleClose, true);
    return () => {
      window.removeEventListener("click", handleClose);
      window.removeEventListener("contextmenu", handleClose);
      window.removeEventListener("scroll", handleClose, true);
    };
  }, [contextMenu]);

  function getEntryMenuItems(id: string, e: EntryMeta) {
    const folderItems = [
      {
        id: "unfiled",
        label: "Move to Unfiled",
        onSelect: () => moveEntry(id, null),
      },
      ...folderList
        .filter(([fid]) => fid !== e.folderId)
        .map(([fid, f]) => ({
          id: `move-${fid}`,
          label: `Move to ${f.name}`,
          onSelect: () => moveEntry(id, fid),
        })),
    ];

    return [
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
      ...folderItems,
      {
        id: "del",
        label: "Delete",
        icon: <Trash2 size={12} />,
        danger: true,
        onSelect: () => deleteEntry(id),
      },
    ];
  }

  function getFolderMenuItems(fid: string) {
    return [
      {
        id: "new-here",
        label: "New entry here",
        icon: <Plus size={12} />,
        onSelect: () =>
          showPrompt("New entry", "Untitled entry", (title) => {
            createEntry({ title, folderId: fid });
          }),
      },
      {
        id: "new-subfolder",
        label: "New subfolder",
        icon: <FolderPlus size={12} />,
        onSelect: () =>
          showPrompt("New folder", "Subfolder", (name) => {
            const trimmed = name.trim();
            if (!trimmed) return;
            void cloudApi
              .createFolder(orgId, notebookId, { name: trimmed, parentId: fid })
              .then(() => refresh())
              .catch((err) => setError((err as Error).message));
          }, "Folder name"),
      },
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
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: getEntryMenuItems(id, entryMeta),
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
          onSelect: () =>
            showPrompt("New entry", "Untitled entry", (title) => {
              createEntry({ title });
            }),
        },
        {
          id: "new-root-folder",
          label: "New folder",
          icon: <FolderPlus size={12} />,
          onSelect: () =>
            showPrompt("New folder", "Design Cycle", (name) => {
              const trimmed = name.trim();
              if (!trimmed) return;
              void cloudApi
                .createFolder(orgId, notebookId, { name: trimmed })
                .then(() => refresh())
                .catch((err) => setError((err as Error).message));
            }, "Folder name"),
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
            active={activeEntryId === id}
            selected={selectedIds.has(id)}
            basePath={basePath}
            entry={e}
            menu={entryMenu(id, e)}
            phases={phases}
            indent={indent}
            onContextMenu={(evt) => handleEntryContextMenu(evt, id, e)}
            onSelectClick={handleSelectClick}
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
            isOverFolder={isOver}
            onNewEntry={() =>
              showPrompt("New entry", "Untitled entry", (title) => {
                createEntry({ title, folderId: fid });
              })
            }
            onNewSubfolder={() =>
              showPrompt("New folder", "Subfolder", (name) => {
                const trimmed = name.trim();
                if (!trimmed) return;
                void cloudApi
                  .createFolder(orgId, notebookId, { name: trimmed, parentId: fid })
                  .then(() => refresh())
                  .catch((err) => setError((err as Error).message));
              }, "Folder name")
            }
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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, authors, date…"
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
        <IconButton aria-label="Collapse entry list" onClick={onToggleCollapsed}>
          <PanelLeftClose size={16} />
        </IconButton>
      </div>

      {filtersOpen && (
        <div className="space-y-2 border-b border-nb-outline-variant/20 px-2 py-2 text-nb-caption">
          <div>
            <span className="mb-1 block text-nb-on-surface-variant">Phase</span>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, phaseId: null }))}
                className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
                  filters.phaseId === null
                    ? "border-nb-primary bg-nb-primary/10 text-nb-primary"
                    : "border-nb-outline-variant/30 text-nb-on-surface-variant"
                }`}
              >
                Any
              </button>
              {phaseList.map(([id]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      phaseId: f.phaseId === id ? null : id,
                    }))
                  }
                  className={`rounded-md ${
                    filters.phaseId === id ? "ring-2 ring-nb-primary ring-offset-1" : ""
                  }`}
                >
                  <PhaseChip phaseId={id} phases={phases} />
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-0.5 block text-nb-on-surface-variant">Author</span>
            <select
              value={filters.author ?? ""}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  author: e.target.value || null,
                }))
              }
              className="w-full rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface px-2 py-1.5 text-nb-label outline-none focus:border-nb-primary"
            >
              <option value="">Any author</option>
              {availableAuthors.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="block">
              <span className="mb-0.5 block text-nb-on-surface-variant">From</span>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                className="w-full rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface px-1.5 py-1.5 text-nb-label outline-none focus:border-nb-primary"
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-nb-on-surface-variant">To</span>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                className="w-full rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface px-1.5 py-1.5 text-nb-label outline-none focus:border-nb-primary"
              />
            </label>
          </div>
          {filtersActive && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-nb-label text-nb-primary hover:underline"
              onClick={() =>
                setFilters({ phaseId: null, author: null, dateFrom: "", dateTo: "" })
              }
            >
              <X size={12} /> Clear filters
            </button>
          )}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-b border-nb-tertiary/30 bg-nb-tertiary/5 px-2 py-1.5">
          <span className="mr-auto text-[11px] font-semibold text-nb-on-surface">
            {selectedIds.size} selected
          </span>
          <DropdownMenu
            align="right"
            ariaLabel="Move selected"
            trigger={
              <span className="cursor-pointer rounded px-2 py-1 text-[11px] font-semibold text-nb-primary hover:bg-nb-surface">
                Move…
              </span>
            }
            items={[
              {
                id: "unfiled",
                label: "Unfiled",
                onSelect: () => bulkMove(null),
              },
              ...folderList.map(([fid, f]) => ({
                id: `folder-${fid}`,
                label: f.name,
                onSelect: () => bulkMove(fid),
              })),
            ]}
          />
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

      <div className="flex flex-wrap items-center gap-1 border-b border-nb-outline-variant/15 px-2 py-2">
        <span className="mr-auto text-nb-label font-semibold text-nb-on-surface-variant">
          {entryCount} items
        </span>
        <DropdownMenu
          align="right"
          ariaLabel="New entry"
          trigger={
            <span className="inline-flex items-center gap-1.5 rounded-nb-lg bg-nb-primary px-3 py-1.5 text-nb-label font-medium text-white shadow-nb-sm hover:bg-nb-primary-dim">
              <Plus size={14} /> New
            </span>
          }
          items={[
            {
              id: "blank",
              label: "Blank entry",
              icon: <FileText size={14} />,
              onSelect: () =>
                showPrompt("New entry", "Untitled entry", (title) => {
                  createEntry({ title });
                }),
            },
            {
              id: "blank-template",
              label: "Blank template",
              icon: <LayoutTemplate size={14} />,
              onSelect: () =>
                showPrompt("New template", "Untitled template", (title) => {
                  createEntry({ title, isTemplate: true });
                }),
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
          onClick={() =>
            showPrompt("New folder", "Design Cycle", (name) => {
              const trimmed = name.trim();
              if (!trimmed) return;
              void cloudApi
                .createFolder(orgId, notebookId, { name: trimmed })
                .then(() => refresh())
                .catch((err) => setError((err as Error).message));
            }, "Folder name")
          }
        >
          <FolderPlus size={16} />
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
        >
          <div className="flex min-w-full flex-col">
            {renderFolderTree("__root__", 0)}

            {unfiled.length > 0 && (
              <div className="mt-0.5">
                {renderEntryList(unfiled, 0)}
              </div>
            )}
          </div>

          {!entryCount && !q && (
            <p className="px-2 py-6 text-center text-nb-caption text-nb-on-surface-variant">
              No entries yet
            </p>
          )}
          {q &&
            !unfiled.length &&
            folderList.every(([fid]) => !(byFolder[fid]?.length)) && (
              <p className="px-2 py-6 text-center text-nb-caption text-nb-on-surface-variant">
                No matches
              </p>
            )}

          {/* Root empty area droppable target */}
          <RootDropTarget isOver={dragOverId === "root-drop-target"} />
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

      {/* Floating Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-44 overflow-hidden rounded-xl border border-nb-outline-variant/30 bg-nb-surface py-1 shadow-nb-lg"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium hover:bg-nb-surface-low ${
                item.danger ? "text-nb-danger" : "text-nb-on-surface"
              }`}
              onClick={() => {
                setContextMenu(null);
                item.onSelect();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
