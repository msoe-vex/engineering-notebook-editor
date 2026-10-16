"use client";

import { useEffect, useState } from "react";
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
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button, IconButton, TextField } from "@/components/ui";
import { useAppDndSensors } from "@/lib/dnd/dndSensors";
import { AVAILABLE_ICONS } from "@/lib/notebook/phases";
import type { ProjectPhase } from "@engineering-notebook/shared";

export type PhaseRow = ProjectPhase & { id: string };

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
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
      }}
      className="flex flex-col gap-2 rounded-nb-xl border border-nb-outline-variant/30 bg-nb-surface p-3 sm:flex-row sm:items-start"
    >
      <button
        type="button"
        className="mt-1 shrink-0 cursor-grab touch-none p-1 text-nb-on-surface-variant/50 hover:text-nb-on-surface-variant active:cursor-grabbing"
        title="Drag to reorder"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
      <div
        className="mt-1 h-8 w-8 shrink-0 rounded-nb-lg border border-nb-outline-variant/20"
        style={{ backgroundColor: phase.color }}
        title={phase.color}
      />
      <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
        <TextField
          label="Name"
          value={phase.name}
          onChange={(e) => onChange(phase.id, { name: e.target.value })}
        />
        <label className="flex flex-col gap-1 text-nb-caption font-semibold text-nb-on-surface-variant">
          Color
          <input
            type="color"
            className="h-10 w-full cursor-pointer rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface"
            value={phase.color}
            onChange={(e) => onChange(phase.id, { color: e.target.value })}
          />
        </label>
        <div className="sm:col-span-2">
          <TextField
            label="Description"
            value={phase.description}
            onChange={(e) => onChange(phase.id, { description: e.target.value })}
          />
        </div>
        <label className="flex flex-col gap-1 text-nb-caption font-semibold text-nb-on-surface-variant sm:col-span-2">
          Icon
          <select
            className="rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface px-2 py-2 text-nb-label text-nb-on-surface"
            value={phase.iconName}
            onChange={(e) => onChange(phase.id, { iconName: e.target.value })}
          >
            {AVAILABLE_ICONS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <IconButton
        aria-label="Remove phase"
        variant="danger"
        className="shrink-0 self-start"
        onClick={() => onRemove(phase.id)}
      >
        <Trash2 size={16} />
      </IconButton>
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
  const sensors = useAppDndSensors();

  useEffect(() => {
    const rows = Object.entries(value || {})
      .map(([id, p]) => ({ id, ...p }))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    setPhases(rows);
  }, [value]);

  function emit(next: PhaseRow[]) {
    const densified = densify(next);
    setPhases(densified);
    onChange(
      Object.fromEntries(
        densified.map(({ id, ...rest }) => [id, rest satisfies ProjectPhase])
      )
    );
  }

  function onDragEnd(event: DragEndEvent) {
    if (!event.over) return;
    const from = phases.findIndex((p) => p.id === event.active.id);
    const to = phases.findIndex((p) => p.id === event.over?.id);
    if (from < 0 || to < 0 || from === to) return;
    emit(arrayMove(phases, from, to));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-nb-title font-semibold">Design phases</h2>
          <p className="text-nb-caption text-nb-on-surface-variant">
            Used on entries and in the calendar. Drag to reorder.
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={phases.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
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
        </DndContext>
      )}
    </div>
  );
}
