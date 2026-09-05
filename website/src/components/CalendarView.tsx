"use client";

import React, { useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, Rows3 } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { sortedEntries } from "@/lib/metadata";
import { getPhaseConfig, getPhases } from "@/lib/phases";

const UNDATED = "__undated__";

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - copy.getDay());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

interface CardProps {
  id: string;
  title: string;
  color?: string;
  onOpen: () => void;
}

function SortableCard({ id, title, color, onOpen }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { type: "entry" },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    borderLeftColor: color || "var(--color-nb-outline-variant)",
  };
  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onDoubleClick={onOpen}
      className="nb-cal-card"
      title={title || "Untitled"}
    >
      {title || "Untitled"}
    </button>
  );
}

function DayColumn({
  dateKey,
  label,
  isToday,
  isMuted,
  ids,
  cards,
  onOpen,
}: {
  dateKey: string;
  label: string;
  isToday?: boolean;
  isMuted?: boolean;
  ids: string[];
  cards: Record<string, { title: string; color?: string }>;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${dateKey}`, data: { date: dateKey, type: "day" } });
  return (
    <div ref={setNodeRef} className={`nb-cal-day ${isToday ? "is-today" : ""} ${isMuted ? "is-muted" : ""} ${isOver ? "is-over" : ""}`}>
      <div className="nb-cal-day-label">{label}</div>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="nb-cal-day-list">
          {ids.map((id) => (
            <SortableCard
              key={id}
              id={id}
              title={cards[id]?.title || ""}
              color={cards[id]?.color}
              onOpen={() => onOpen(id)}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

export default function CalendarView() {
  const { metadata, navigateTo, reorderCalendarEntry } = useWorkspace();
  const [mode, setMode] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const phases = getPhases(metadata.phases);
  const phaseConfig = getPhaseConfig(phases);

  const calendarEntries = useMemo(
    () => sortedEntries(metadata.entries).filter((e) => !e.isTemplate),
    [metadata.entries]
  );

  const cards = useMemo(() => {
    const map: Record<string, { title: string; color?: string }> = {};
    for (const e of calendarEntries) {
      map[e.id] = {
        title: e.title,
        color: e.phase ? phaseConfig[e.phase]?.color : undefined,
      };
    }
    return map;
  }, [calendarEntries, phaseConfig]);

  const byDate = useMemo(() => {
    const map: Record<string, string[]> = { [UNDATED]: [] };
    for (const e of calendarEntries) {
      const key = e.date?.trim() ? e.date : UNDATED;
      if (!map[key]) map[key] = [];
      map[key].push(e.id);
    }
    return map;
  }, [calendarEntries]);

  const today = toYmd(new Date());

  const monthCells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const heading = mode === "month"
    ? cursor.toLocaleString(undefined, { month: "long", year: "numeric" })
    : `${weekDays[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekDays[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  const shift = (dir: number) => {
    setCursor((prev) => {
      const next = new Date(prev);
      if (mode === "month") next.setMonth(next.getMonth() + dir);
      else next.setDate(next.getDate() + 7 * dir);
      return next;
    });
  };

  const resolveDrop = (overId: string | undefined): { date: string; index: number } | null => {
    if (!overId) return null;
    if (typeof overId === "string" && overId.startsWith("day:")) {
      const date = overId.slice(4);
      const ids = byDate[date] || [];
      return { date, index: ids.length };
    }
    for (const [date, ids] of Object.entries(byDate)) {
      const idx = ids.indexOf(overId);
      if (idx !== -1) return { date, index: idx };
    }
    return null;
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const movedId = String(event.active.id);
    setActiveId(null);
    const drop = resolveDrop(event.over?.id != null ? String(event.over.id) : undefined);
    if (!drop) return;
    const destKey = drop.date;
    const destIds = [...(byDate[destKey] || [])];
    const targetDate = destKey === UNDATED ? "" : destKey;
    await reorderCalendarEntry(movedId, targetDate, destIds, drop.index);
  };

  const openEntry = (id: string) => navigateTo({ entry: id, resource: null }, "/workspace/editor");

  const daysToRender = mode === "month" ? monthCells : weekDays;

  return (
    <div className="nb-cal">
      <header className="nb-cal-header">
        <div className="flex items-center gap-3">
          <CalendarDays size={20} className="text-nb-primary" />
          <h1 className="text-lg font-bold tracking-tight text-nb-on-surface">Calendar</h1>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="nb-cal-nav" onClick={() => shift(-1)} aria-label="Previous">
            <ChevronLeft size={16} />
          </button>
          <button type="button" className="nb-cal-title" onClick={() => setCursor(new Date())}>
            {heading}
          </button>
          <button type="button" className="nb-cal-nav" onClick={() => shift(1)} aria-label="Next">
            <ChevronRight size={16} />
          </button>
          <div className="nb-cal-toggle">
            <button type="button" className={mode === "month" ? "is-active" : ""} onClick={() => setMode("month")}>
              <LayoutGrid size={14} /> Month
            </button>
            <button type="button" className={mode === "week" ? "is-active" : ""} onClick={() => setMode("week")}>
              <Rows3 size={14} /> Week
            </button>
          </div>
        </div>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragEnd={handleDragEnd}
      >
        {(byDate[UNDATED] || []).length > 0 && (
          <div className="nb-cal-undated">
            <DayColumn
              dateKey={UNDATED}
              label="Undated"
              ids={byDate[UNDATED]}
              cards={cards}
              onOpen={openEntry}
            />
          </div>
        )}
        <div className="nb-cal-weekdays">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className={`nb-cal-grid ${mode === "week" ? "is-week" : ""}`}>
          {daysToRender.map((d) => {
            const key = toYmd(d);
            const muted = mode === "month" && d.getMonth() !== cursor.getMonth();
            return (
              <DayColumn
                key={key}
                dateKey={key}
                label={String(d.getDate())}
                isToday={key === today}
                isMuted={muted}
                ids={byDate[key] || []}
                cards={cards}
                onOpen={openEntry}
              />
            );
          })}
        </div>
        <DragOverlay>
          {activeId ? <div className="nb-cal-card is-overlay">{cards[activeId]?.title || "Untitled"}</div> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
