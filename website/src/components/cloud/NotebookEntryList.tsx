"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Folder,
  FolderPlus,
  AlertTriangle,
  GripVertical,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { Button, DropdownMenu, IconButton } from "@/components/ui";
import { cloudApi } from "@/lib/cloud/api";
import { useAppDndSensors } from "@/lib/dnd/dndSensors";
import { readLastAuthors } from "@/lib/notebook/metadata";
import type { ProjectPhase } from "@/lib/notebook/metadata";
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

function explorerRank(e: EntryMeta) {
  return e.explorerOrder ?? e.order ?? 0;
}

/** Sort for file-explorer siblings (not compile order). */
function sortEntries(list: [string, EntryMeta][]) {
  return list.sort(
    (a, b) =>
      explorerRank(a[1]) - explorerRank(b[1]) ||
      a[1].title.localeCompare(b[1].title) ||
      a[0].localeCompare(b[0])
  );
}

function EntryRowShell({
  active,
  basePath,
  entry,
  id,
  menu,
  dragHandle,
  rowRef,
  rowStyle,
  phases,
  indent = 0,
}: {
  id: string;
  active: boolean;
  basePath: string;
  entry: EntryMeta;
  menu: ReactNode;
  dragHandle?: ReactNode;
  rowRef?: (node: HTMLElement | null) => void;
  rowStyle?: CSSProperties;
  phases?: Record<string, ProjectPhase> | null;
  indent?: number;
}) {
  return (
    <div
      ref={rowRef}
      style={{ ...rowStyle, paddingLeft: indent ? indent * 12 : undefined }}
      className={`group mb-0.5 flex items-center gap-0.5 rounded-nb-lg ${
        active ? "bg-nb-primary/10" : "hover:bg-nb-surface"
      }`}
    >
      {dragHandle}
      <Link
        href={`${basePath}/entries/${id}`}
        className={`min-w-0 flex-1 py-1.5 pr-1 text-nb-body transition-colors ${
          dragHandle ? "pl-0.5" : "pl-2.5"
        } ${active ? "font-semibold text-nb-primary" : "text-nb-on-surface"}`}
      >
        <div className="flex items-center gap-1.5 truncate">
          <span className="truncate">{entry.title || "Untitled"}</span>
          {entry.isValid === false && (
            <span
              title={(entry.validationErrors || ["Incomplete entry"]).join("\n")}
              className="inline-flex shrink-0 text-nb-warning"
            >
              <AlertTriangle size={12} />
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {entry.date && (
            <span className="text-nb-caption text-nb-on-surface-variant">{entry.date}</span>
          )}
          <PhaseChip phaseId={entry.phase} phases={phases} />
        </div>
      </Link>
      <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {menu}
      </div>
    </div>
  );
}

function SortableEntryRow({
  id,
  active,
  basePath,
  entry,
  menu,
  phases,
  indent = 0,
}: {
  id: string;
  active: boolean;
  basePath: string;
  entry: EntryMeta;
  menu: ReactNode;
  phases?: Record<string, ProjectPhase> | null;
  indent?: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <EntryRowShell
      id={id}
      active={active}
      basePath={basePath}
      entry={entry}
      menu={menu}
      phases={phases}
      indent={indent}
      rowRef={setNodeRef}
      rowStyle={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        zIndex: isDragging ? 20 : undefined,
      }}
      dragHandle={
        <button
          type="button"
          className="shrink-0 cursor-grab touch-none p-1 text-nb-on-surface-variant/40 hover:text-nb-on-surface-variant active:cursor-grabbing"
          title="Drag to reorder"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </button>
      }
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
  dragHandle,
  rowRef,
  rowStyle,
}: {
  name: string;
  open: boolean;
  count: number;
  depth: number;
  onToggle: () => void;
  menu: ReactNode;
  dragHandle?: ReactNode;
  rowRef?: (node: HTMLElement | null) => void;
  rowStyle?: CSSProperties;
}) {
  return (
    <div
      ref={rowRef}
      style={{ ...rowStyle, paddingLeft: depth * 12 }}
      className="group mb-0.5 flex items-center gap-0.5 rounded-nb-lg px-1 py-1 hover:bg-nb-surface"
    >
      {dragHandle}
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1 text-left text-nb-label font-semibold text-nb-on-surface-variant"
        onClick={onToggle}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Folder size={14} className="shrink-0 opacity-70" />
        <span className="truncate">{name}</span>
        <span className="text-nb-caption font-normal opacity-70">{count}</span>
      </button>
      <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100">{menu}</div>
    </div>
  );
}

function SortableFolderRow({
  id,
  name,
  open,
  count,
  depth,
  onToggle,
  menu,
}: {
  id: string;
  name: string;
  open: boolean;
  count: number;
  depth: number;
  onToggle: () => void;
  menu: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `folder:${id}`,
  });

  return (
    <FolderRowShell
      name={name}
      open={open}
      count={count}
      depth={depth}
      onToggle={onToggle}
      menu={menu}
      rowRef={setNodeRef}
      rowStyle={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
      }}
      dragHandle={
        <button
          type="button"
          className="shrink-0 cursor-grab touch-none p-0.5 text-nb-on-surface-variant/40 hover:text-nb-on-surface-variant active:cursor-grabbing"
          title="Drag to reorder folder"
          aria-label="Drag to reorder folder"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={12} />
        </button>
      }
    />
  );
}

function SortableGroup({
  ids,
  onReorder,
  children,
}: {
  ids: string[];
  onReorder: (orderedIds: string[]) => void;
  children: ReactNode;
}) {
  const sensors = useAppDndSensors();

  function onDragEnd(event: DragEndEvent) {
    if (!event.over) return;
    const from = ids.indexOf(String(event.active.id));
    const to = ids.indexOf(String(event.over.id));
    if (from < 0 || to < 0 || from === to) return;
    onReorder(arrayMove(ids, from, to));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
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
    setError,
    showPrompt,
    showConfirm,
  } = useNotebookWorkspace();
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<EntryFilters>({
    phaseId: null,
    author: null,
    dateFrom: "",
    dateTo: "",
  });
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const [showTemplates, setShowTemplates] = useState(true);

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

  const { folderList, byFolder, childrenByParent, unfiled, templates } = useMemo(() => {
    const folderList = Object.entries(folders).sort(
      (a, b) => a[1].order - b[1].order || a[1].name.localeCompare(b[1].name)
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
      if (!entryMatchesFilters(e, q, filters, phaseNames)) continue;
      if (e.isTemplate) {
        templates.push([id, e]);
        continue;
      }
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

  const entryCount = Object.values(entries).filter((e) => !e.isTemplate).length;

  function persistExplorerOrder(orderedIds: string[]) {
    // Same-folder DnD: only rewrite explorerOrder (leave folderId alone).
    void cloudApi
      .reorderEntries(orgId, notebookId, { mode: "explorer", orderedIds })
      .then(() => refresh())
      .catch((err) => setError((err as Error).message));
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
        setError((err as Error).message);
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
        const siblings = Object.values(entries).filter(
          (e) => !e.isTemplate && (e.folderId ?? null) === folderId
        );
        const nextExplorer = siblings.length
          ? Math.max(...siblings.map(explorerRank)) + 1
          : 0;
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
          explorerOrder: nextExplorer,
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
        window.location.href = `${basePath}/entries/${created.id}`;
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
            if (activeEntryId === id) window.location.href = basePath;
          })
          .catch((err) => setError((err as Error).message));
      },
      "danger"
    );
  }

  function moveEntry(id: string, folderId: string | null) {
    const srcFolder = entries[id]?.folderId ?? null;
    if (srcFolder === folderId) return;

    const dest = Object.entries(entries).filter(
      ([eid, e]) => !e.isTemplate && eid !== id && (e.folderId ?? null) === folderId
    );
    sortEntries(dest);
    const destIds = [...dest.map(([eid]) => eid), id];

    const src = Object.entries(entries).filter(
      ([eid, e]) => !e.isTemplate && eid !== id && (e.folderId ?? null) === srcFolder
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
        setError((err as Error).message);
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

  function entryMenu(id: string, e: EntryMeta) {
    const folderItems = e.isTemplate
      ? []
      : [
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

    return (
      <DropdownMenu
        items={[
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
        ]}
      />
    );
  }

  function renderSortableList(
    list: [string, EntryMeta][],
    allowReorder: boolean,
    indent = 0
  ) {
    const ids = list.map(([id]) => id);
    if (!allowReorder || ids.length < 2) {
      return (
        <>
          {list.map(([id, e]) => (
            <EntryRowShell
              key={id}
              id={id}
              active={activeEntryId === id}
              basePath={basePath}
              entry={e}
              menu={entryMenu(id, e)}
              phases={phases}
              indent={indent}
            />
          ))}
        </>
      );
    }
    return (
      <SortableGroup ids={ids} onReorder={persistExplorerOrder}>
        {list.map(([id, e]) => (
          <SortableEntryRow
            key={id}
            id={id}
            active={activeEntryId === id}
            basePath={basePath}
            entry={e}
            menu={entryMenu(id, e)}
            phases={phases}
            indent={indent}
          />
        ))}
      </SortableGroup>
    );
  }

  function folderMenu(fid: string) {
    return (
      <DropdownMenu
        items={[
          {
            id: "rename",
            label: "Rename",
            onSelect: () => renameFolder(fid),
          },
          {
            id: "new-here",
            label: "New entry here",
            onSelect: () =>
              showPrompt("New entry", "Untitled entry", (title) => {
                createEntry({ title, folderId: fid });
              }),
          },
          {
            id: "new-subfolder",
            label: "New subfolder",
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
            id: "del-folder",
            label: "Delete folder",
            danger: true,
            onSelect: () => deleteFolder(fid),
          },
        ]}
      />
    );
  }

  function renderFolderTree(parentKey: string, depth: number): ReactNode {
    const siblingIds = childrenByParent[parentKey] ?? [];
    if (siblingIds.length === 0) return null;
    const canReorder = !filtering && siblingIds.length > 1;

    const nodes = siblingIds.map((fid) => {
      const folder = folders[fid];
      if (!folder) return null;
      const open = !collapsedFolders.has(fid);
      const kids = byFolder[fid] ?? [];
      const childFolders = childrenByParent[fid] ?? [];
      const count = kids.length + childFolders.length;
      const row = canReorder ? (
        <SortableFolderRow
          id={fid}
          name={folder.name}
          open={open}
          count={count}
          depth={depth}
          onToggle={() => toggleFolder(fid)}
          menu={folderMenu(fid)}
        />
      ) : (
        <FolderRowShell
          name={folder.name}
          open={open}
          count={count}
          depth={depth}
          onToggle={() => toggleFolder(fid)}
          menu={folderMenu(fid)}
        />
      );
      return (
        <div key={fid} className="mb-0.5">
          {row}
          {open && (
            <div>
              {renderFolderTree(fid, depth + 1)}
              {renderSortableList(kids, !filtering, depth + 1)}
              {!filtering && kids.length === 0 && childFolders.length === 0 && (
                <p
                  className="px-2 py-1 text-nb-caption text-nb-on-surface-variant/60"
                  style={{ paddingLeft: (depth + 1) * 12 + 8 }}
                >
                  Empty
                </p>
              )}
            </div>
          )}
        </div>
      );
    });

    if (!canReorder) return <>{nodes}</>;

    const sortableIds = siblingIds.map((id) => `folder:${id}`);
    return (
      <SortableGroup
        ids={sortableIds}
        onReorder={(orderedPrefixed) => {
          const ordered = orderedPrefixed.map((x) => x.replace(/^folder:/, ""));
          persistFolderOrder(parentKey, ordered);
        }}
      >
        {nodes}
      </SortableGroup>
    );
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

      <div className="flex flex-wrap items-center gap-1 border-b border-nb-outline-variant/15 px-2 py-2">
        <span className="mr-auto text-nb-label font-semibold text-nb-on-surface-variant">
          {entryCount} entries
        </span>
        <Button
          size="sm"
          variant="primary"
          onClick={() =>
            showPrompt("New entry", "Untitled entry", (title) => {
              createEntry({ title });
            })
          }
        >
          <Plus size={14} /> New
        </Button>
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

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {renderFolderTree("__root__", 0)}

        {(unfiled.length > 0 || folderList.length > 0) && (
          <div className="mb-1">
            {folderList.length > 0 && (
              <div className="px-2.5 py-1.5 text-nb-label font-semibold text-nb-on-surface-variant">
                Unfiled
              </div>
            )}
            {renderSortableList(unfiled, !filtering)}
          </div>
        )}

        {!entryCount && !q && (
          <p className="px-2 py-6 text-center text-nb-caption text-nb-on-surface-variant">
            No entries yet
          </p>
        )}
        {q &&
          !unfiled.length &&
          !templates.length &&
          folderList.every(([fid]) => !(byFolder[fid]?.length)) && (
            <p className="px-2 py-6 text-center text-nb-caption text-nb-on-surface-variant">
              No matches
            </p>
          )}

        <div className="mt-3 border-t border-nb-outline-variant/20 pt-2">
          <div className="flex items-center gap-1 px-1">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1 px-1.5 py-1 text-left text-nb-label font-semibold text-nb-on-surface-variant"
              onClick={() => setShowTemplates((v) => !v)}
            >
              {showTemplates ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Templates
              <span className="text-nb-caption font-normal opacity-70">
                {templates.length}
              </span>
            </button>
            <IconButton
              aria-label="New template"
              title="New template"
              onClick={() =>
                showPrompt("New template", "Untitled template", (title) => {
                  createEntry({ title, isTemplate: true });
                })
              }
            >
              <Plus size={14} />
            </IconButton>
          </div>
          {showTemplates && (
            <div className="mt-0.5">
              {renderSortableList(templates, !filtering)}
              {!templates.length && (
                <p className="px-2.5 py-2 text-nb-caption text-nb-on-surface-variant/70">
                  No templates
                </p>
              )}
            </div>
          )}
        </div>
      </nav>
    </aside>
  );
}
