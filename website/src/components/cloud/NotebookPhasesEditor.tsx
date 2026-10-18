"use client";

import { useEffect, useMemo, useRef, useState, type HTMLAttributes } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as LucideIcons from "lucide-react";
import { GripVertical, Plus, Search, Shapes, Trash2, type LucideIcon } from "lucide-react";
import { Button, IconButton } from "@/components/ui";
import { useAppDndSensors } from "@/lib/dnd/dndSensors";
import { AVAILABLE_ICONS } from "@/lib/notebook/phases";
import type { ProjectPhase } from "@engineering-notebook/shared";

export type PhaseRow = ProjectPhase & { id: string };

const PRESET_COLORS = [
  "#3b82f6",
  "#a855f7",
  "#6366f1",
  "#f97316",
  "#10b981",
  "#ec4899",
  "#ef4444",
  "#eab308",
  "#06b6d4",
  "#14b8a6",
  "#8b5cf6",
  "#64748b",
];

const STARTER_PHASES: PhaseRow[] = [
  { id: "ask", name: "Ask", description: "Identify the problem", iconName: "Goal", color: "#3b82f6", order: 0 },
  { id: "research", name: "Research", description: "Gather information", iconName: "SearchCheck", color: "#8b5cf6", order: 1 },
  { id: "imagine", name: "Imagine", description: "Brainstorm solutions", iconName: "Lightbulb", color: "#f59e0b", order: 2 },
  { id: "plan", name: "Plan", description: "Select and design", iconName: "PencilRuler", color: "#10b981", order: 3 },
  { id: "create", name: "Create", description: "Build the solution", iconName: "Hammer", color: "#ef4444", order: 4 },
  { id: "test", name: "Test", description: "Evaluate and iterate", iconName: "Beaker", color: "#06b6d4", order: 5 },
];

function densify(list: PhaseRow[]): PhaseRow[] {
  return list.map((p, i) => ({ ...p, order: i }));
}

function resolveIcon(name: string): LucideIcon {
  return (LucideIcons as unknown as Record<string, LucideIcon>)[name] || Shapes;
}

function PhaseIconPicker({
  currentIcon,
  onSelect,
  color,
  onColorChange,
}: {
  currentIcon: string;
  onSelect: (iconName: string) => void;
  color: string;
  onColorChange: (color: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const filteredIcons = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return AVAILABLE_ICONS;
    return AVAILABLE_ICONS.filter((i) => i.toLowerCase().includes(q));
  }, [search]);

  function updateCoords() {
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const popupWidth = 272;
    const popupHeight = 320;
    let top = rect.top + rect.height / 2 - popupHeight / 2;
    top = Math.max(16, Math.min(top, window.innerHeight - popupHeight - 16));
    let left = rect.right + 12;
    if (left + popupWidth > window.innerWidth - 16) {
      left = rect.left - popupWidth - 12;
    }
    setCoords({ top, left });
  }

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  const IconComp = resolveIcon(currentIcon);

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (!isOpen) updateCoords();
          setIsOpen((v) => !v);
        }}
        className="flex h-10 w-10 items-center justify-center rounded-nb-xl border-2 transition hover:scale-105 active:scale-95"
        style={{ backgroundColor: `${color}15`, color, borderColor: `${color}40` }}
        title="Choose icon and color"
        aria-label="Choose icon and color"
        aria-expanded={isOpen}
      >
        <IconComp size={18} />
      </button>

      {isOpen &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={() => setIsOpen(false)} />
            <div
              role="dialog"
              aria-label="Phase icon and color"
              style={{ position: "fixed", top: coords.top, left: coords.left, zIndex: 9999 }}
              className="w-[17rem] space-y-3 rounded-nb-2xl border border-nb-outline-variant/40 bg-nb-surface p-3.5 shadow-nb-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-nb-on-surface-variant/55">
                    Color
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => onColorChange(e.target.value)}
                      className="h-4 w-4 shrink-0 cursor-pointer overflow-hidden rounded border-0 bg-transparent p-0"
                      aria-label="Custom color"
                    />
                    <span className="font-mono text-[9px] font-bold uppercase text-nb-on-surface-variant/70">
                      {color}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {PRESET_COLORS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => onColorChange(preset)}
                      className={`flex h-5 w-5 items-center justify-center rounded-full transition hover:scale-110 ${
                        color.toLowerCase() === preset.toLowerCase()
                          ? "ring-2 ring-nb-primary ring-offset-1 ring-offset-nb-surface"
                          : ""
                      }`}
                      style={{ backgroundColor: preset }}
                      aria-label={`Color ${preset}`}
                    />
                  ))}
                </div>
              </div>

              <div className="border-t border-nb-outline-variant/30 pt-2.5">
                <span className="mb-2 block text-[9px] font-bold uppercase tracking-wider text-nb-on-surface-variant/55">
                  Icon
                </span>
                <div className="relative mb-2">
                  <Search
                    size={12}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-nb-on-surface-variant/40"
                  />
                  <input
                    autoFocus
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search icons…"
                    className="w-full rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface-low py-1.5 pl-8 pr-2 text-[10px] font-semibold text-nb-on-surface outline-none focus:ring-2 focus:ring-nb-primary/20"
                  />
                </div>
                <div className="custom-scrollbar grid max-h-36 grid-cols-5 gap-1 overflow-y-auto pr-0.5">
                  {filteredIcons.map((iconName) => {
                    const PickerIcon = resolveIcon(iconName);
                    const selected = currentIcon === iconName;
                    return (
                      <button
                        key={iconName}
                        type="button"
                        title={iconName}
                        onClick={() => {
                          onSelect(iconName);
                          setIsOpen(false);
                          setSearch("");
                        }}
                        className={`flex h-8 w-8 items-center justify-center rounded-nb transition hover:scale-105 ${
                          selected
                            ? "bg-nb-primary text-white"
                            : "border border-nb-outline-variant/20 bg-nb-surface-low text-nb-on-surface-variant hover:border-nb-primary hover:text-nb-primary"
                        }`}
                      >
                        <PickerIcon size={14} />
                      </button>
                    );
                  })}
                  {filteredIcons.length === 0 && (
                    <p className="col-span-5 py-4 text-center text-[10px] text-nb-on-surface-variant/60">
                      No icons match
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}

function PhaseRowView({
  phase,
  onChange,
  onRemove,
  dragHandleProps,
  isOverlay = false,
  isDragging = false,
}: {
  phase: PhaseRow;
  onChange?: (id: string, patch: Partial<ProjectPhase>) => void;
  onRemove?: (id: string) => void;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  isOverlay?: boolean;
  isDragging?: boolean;
}) {
  const [localColor, setLocalColor] = useState(phase.color);

  useEffect(() => {
    setLocalColor(phase.color);
  }, [phase.color]);

  const IconComp = resolveIcon(phase.iconName);

  return (
    <div
      className={`group flex w-full items-center gap-2.5 rounded-nb-xl border bg-nb-surface px-2.5 py-2.5 transition-colors ${
        isOverlay
          ? "border-nb-primary shadow-nb-lg ring-2 ring-nb-primary/15"
          : isDragging
            ? "border-nb-outline-variant/25 opacity-40"
            : "border-nb-outline-variant/40 hover:border-nb-primary/35"
      }`}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none rounded-nb p-1 text-nb-on-surface-variant/25 hover:bg-nb-surface-low hover:text-nb-on-surface-variant/60 active:cursor-grabbing"
        title="Drag to reorder"
        aria-label="Drag to reorder"
        {...dragHandleProps}
      >
        <GripVertical size={14} />
      </button>

      {isOverlay || !onChange ? (
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-nb-xl border-2"
          style={{
            backgroundColor: `${localColor}15`,
            color: localColor,
            borderColor: `${localColor}40`,
          }}
        >
          <IconComp size={18} />
        </div>
      ) : (
        <PhaseIconPicker
          currentIcon={phase.iconName}
          color={localColor}
          onSelect={(iconName) => onChange(phase.id, { iconName })}
          onColorChange={(next) => {
            setLocalColor(next);
            onChange(phase.id, { color: next });
          }}
        />
      )}

      <div className="min-w-0 flex-1 space-y-0.5">
        {onChange && !isOverlay ? (
          <>
            <input
              type="text"
              value={phase.name}
              onChange={(e) => onChange(phase.id, { name: e.target.value })}
              placeholder="Phase name"
              className="w-full border-none bg-transparent p-0 text-nb-label font-bold tracking-tight text-nb-on-surface outline-none placeholder:text-nb-on-surface-variant/25"
            />
            <input
              type="text"
              value={phase.description}
              onChange={(e) => onChange(phase.id, { description: e.target.value })}
              placeholder="What happens in this phase…"
              className="w-full truncate border-none bg-transparent p-0 text-[11px] font-medium text-nb-on-surface-variant outline-none placeholder:text-nb-on-surface-variant/25"
            />
          </>
        ) : (
          <>
            <div className="truncate text-nb-label font-bold tracking-tight text-nb-on-surface">
              {phase.name || "Phase name"}
            </div>
            <div className="truncate text-[11px] font-medium text-nb-on-surface-variant">
              {phase.description || " "}
            </div>
          </>
        )}
      </div>

      {onRemove && !isOverlay ? (
        <IconButton
          aria-label="Remove phase"
          variant="danger"
          className="shrink-0 opacity-60 transition-opacity group-hover:opacity-100"
          onClick={() => onRemove(phase.id)}
        >
          <Trash2 size={15} />
        </IconButton>
      ) : (
        <span className="h-8 w-8 shrink-0" aria-hidden />
      )}
    </div>
  );
}

function SortablePhase({
  phase,
  onChange,
  onRemove,
}: {
  phase: PhaseRow;
  onChange: (id: string, patch: Partial<ProjectPhase>) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: phase.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={isDragging ? "relative z-10" : undefined}
    >
      <PhaseRowView
        phase={phase}
        onChange={onChange}
        onRemove={onRemove}
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

export function NotebookPhasesEditor({
  value,
  onChange,
}: {
  value: Record<string, ProjectPhase> | undefined;
  onChange: (phases: Record<string, ProjectPhase>) => void;
}) {
  const [phases, setPhases] = useState<PhaseRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overlayWidth, setOverlayWidth] = useState<number | null>(null);
  const sensors = useAppDndSensors(sortableKeyboardCoordinates);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (draggingRef.current) return;
    const rows = Object.entries(value || {})
      .map(([id, p]) => ({ id, ...p }))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    setPhases(rows);
  }, [value]);

  function emit(next: PhaseRow[]) {
    const densified = densify(next);
    setPhases(densified);
    onChange(
      Object.fromEntries(densified.map(({ id, ...rest }) => [id, rest satisfies ProjectPhase]))
    );
  }

  function onDragStart(event: DragStartEvent) {
    draggingRef.current = true;
    setActiveId(String(event.active.id));
    setOverlayWidth(event.active.rect.current.initial?.width ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    draggingRef.current = false;
    setActiveId(null);
    setOverlayWidth(null);
    if (!over || active.id === over.id) return;
    const from = phases.findIndex((p) => p.id === active.id);
    const to = phases.findIndex((p) => p.id === over.id);
    if (from < 0 || to < 0) return;
    emit(arrayMove(phases, from, to));
  }

  function onDragCancel() {
    draggingRef.current = false;
    setActiveId(null);
    setOverlayWidth(null);
  }

  const activePhase = activeId ? phases.find((p) => p.id === activeId) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-nb-title font-semibold">Design phases</h2>
          <p className="text-nb-caption text-nb-on-surface-variant">
            Used on entries and in the calendar. Click the icon to set glyph and color; drag to
            reorder.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              emit([
                ...phases,
                {
                  id:
                    typeof crypto !== "undefined" && "randomUUID" in crypto
                      ? crypto.randomUUID()
                      : `phase-${Date.now()}`,
                  name: "New phase",
                  description: "",
                  iconName: "Shapes",
                  color: "#94a3b8",
                  order: phases.length,
                },
              ])
            }
          >
            <Plus size={14} /> Add
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              emit(
                STARTER_PHASES.map((p) => ({
                  ...p,
                  id:
                    typeof crypto !== "undefined" && "randomUUID" in crypto
                      ? crypto.randomUUID()
                      : `${p.id}-${Date.now()}`,
                }))
              )
            }
          >
            Load starter set
          </Button>
        </div>
      </div>

      {phases.length === 0 ? (
        <p className="rounded-nb-xl border border-dashed border-nb-outline-variant/40 px-4 py-8 text-center text-nb-caption text-nb-on-surface-variant">
          No phases yet. Add one or load the starter design-process set.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <SortableContext items={phases.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-1.5">
              {phases.map((p) => (
                <SortablePhase
                  key={p.id}
                  phase={p}
                  onChange={(id, patch) =>
                    emit(phases.map((row) => (row.id === id ? { ...row, ...patch } : row)))
                  }
                  onRemove={(id) => emit(phases.filter((row) => row.id !== id))}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {activePhase ? (
              <div style={overlayWidth ? { width: overlayWidth } : undefined}>
                <PhaseRowView phase={activePhase} isOverlay />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
