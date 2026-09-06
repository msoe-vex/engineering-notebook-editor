"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  CollisionDetection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, LayoutGrid, Rows3, X } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { formatAuthors, sortedEntries } from "@/lib/metadata";
import { getPhaseConfig, getPhases } from "@/lib/phases";

const UNDATED = "__undated__";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmd(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date();
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? new Date() : date;
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

function addMonthsClamped(d: Date, n: number): Date {
  const year = d.getFullYear();
  const month = d.getMonth() + n;
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(d.getDate(), last));
}

function monthCells(year: number, month: number): Date[] {
  const start = startOfWeek(new Date(year, month, 1));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

const calendarCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const nav = hits.filter((hit) => String(hit.id).startsWith("nav:"));
  if (nav.length > 0) return nav;
  const days = hits.filter((hit) => String(hit.id).startsWith("day:"));
  if (days.length > 0) return days;
  if (hits.length > 0) return hits;
  return [];
};

function pointerY(event: DragEndEvent): number | null {
  const translated = event.active.rect.current.translated;
  if (translated) return translated.top + translated.height / 2;
  const src = event.activatorEvent;
  if (src && "clientY" in src) return (src as PointerEvent).clientY + event.delta.y;
  return null;
}

function insertIndexFromPointer(dateKey: string, ids: string[], movedId: string, y: number | null): number {
  const others = ids.filter((id) => id !== movedId);
  if (y == null || others.length === 0) return others.length;
  const root = document.querySelector(`[data-cal-day="${CSS.escape(dateKey)}"]`);
  if (!root) return others.length;
  for (let i = 0; i < others.length; i++) {
    const el = root.querySelector(`[data-cal-entry="${CSS.escape(others[i])}"]`);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) return i;
  }
  return others.length;
}

interface CardProps {
  id: string;
  title: string;
  color?: string;
  onOpen: () => void;
  onHover: (el: HTMLElement | null) => void;
}

function SortableCard({ id, title, color, onOpen, onHover }: CardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { type: "entry" },
  });
  const pointerStart = React.useRef<{ x: number; y: number } | null>(null);
  const style = {
    opacity: isDragging ? 0.4 : 1,
    borderLeftColor: color || "var(--color-nb-outline-variant)",
  };
  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      {...attributes}
      {...listeners}
      onPointerDown={(e) => {
        pointerStart.current = { x: e.clientX, y: e.clientY };
        listeners?.onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        const start = pointerStart.current;
        pointerStart.current = null;
        if (!start || isDragging) return;
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) onOpen();
      }}
      onMouseEnter={(e) => {
        if (!isDragging) onHover(e.currentTarget);
      }}
      onMouseLeave={() => onHover(null)}
      className="nb-cal-card"
      data-cal-entry={id}
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
  onHover,
}: {
  dateKey: string;
  label: string;
  isToday?: boolean;
  isMuted?: boolean;
  ids: string[];
  cards: Record<string, { title: string; color?: string }>;
  onOpen: (id: string) => void;
  onHover: (id: string | null, el: HTMLElement | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${dateKey}`, data: { date: dateKey, type: "day" } });
  return (
    <div
      ref={setNodeRef}
      data-cal-day={dateKey}
      className={`nb-cal-day ${isToday ? "is-today" : ""} ${isMuted ? "is-muted" : ""} ${isOver ? "is-over" : ""}`}
    >
      <div className="nb-cal-day-label">{label}</div>
      <div className="nb-cal-day-list">
        {ids.map((id) => (
          <SortableCard
            key={id}
            id={id}
            title={cards[id]?.title || ""}
            color={cards[id]?.color}
            onOpen={() => onOpen(id)}
            onHover={(el) => onHover(id, el)}
          />
        ))}
      </div>
    </div>
  );
}

function CalNavButton({
  navId,
  label,
  onClick,
  children,
}: {
  navId: string;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: navId, data: { type: "nav" } });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`nb-cal-nav ${isOver ? "is-drop" : ""}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function ScrollPickList({
  items,
  selectedKey,
  ariaLabel,
}: {
  items: { key: string; label: string; onSelect: () => void }[];
  selectedKey: string;
  ariaLabel: string;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "center" });
  }, [selectedKey]);
  return (
    <div className="nb-cal-scroll-list" role="listbox" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.key}
          ref={item.key === selectedKey ? selectedRef : undefined}
          type="button"
          role="option"
          aria-selected={item.key === selectedKey}
          className={item.key === selectedKey ? "is-selected" : ""}
          onClick={item.onSelect}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function MonthGridPicker({
  year,
  selectedMonth,
  years,
  onPick,
  onSelectYear,
  onShiftYear,
}: {
  year: number;
  selectedMonth: number;
  years: number[];
  onPick: (month: number) => void;
  onSelectYear: (year: number) => void;
  onShiftYear: (dir: number) => void;
}) {
  const now = new Date();
  return (
    <div className="nb-cal-picker" role="dialog" aria-label="Choose month">
      <div className="nb-cal-picker-head">
        <button type="button" className="nb-cal-nav" onClick={() => onShiftYear(-1)} aria-label="Previous year">
          <ChevronLeft size={16} />
        </button>
        <span>{year}</span>
        <button type="button" className="nb-cal-nav" onClick={() => onShiftYear(1)} aria-label="Next year">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="nb-cal-picker-body">
        <div className="nb-cal-month-grid">
          {MONTHS.map((name, i) => {
            const isCurrent = now.getFullYear() === year && now.getMonth() === i;
            return (
              <button
                key={name}
                type="button"
                className={`${selectedMonth === i ? "is-selected" : ""} ${isCurrent ? "is-today" : ""}`}
                onClick={() => onPick(i)}
              >
                {name.slice(0, 3)}
              </button>
            );
          })}
        </div>
        <ScrollPickList
          ariaLabel="Years"
          selectedKey={String(year)}
          items={years.map((y) => ({
            key: String(y),
            label: String(y),
            onSelect: () => onSelectYear(y),
          }))}
        />
      </div>
    </div>
  );
}

function WeekGridPicker({
  viewDate,
  selected,
  monthItems,
  onPickWeek,
  onSelectMonth,
  onShiftMonth,
}: {
  viewDate: Date;
  selected: Date;
  monthItems: { year: number; month: number }[];
  onPickWeek: (weekStart: Date) => void;
  onSelectMonth: (year: number, month: number) => void;
  onShiftMonth: (dir: number) => void;
}) {
  const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)));
  const selectedKey = toYmd(startOfWeek(selected));
  const todayKey = toYmd(new Date());
  const monthKey = `${viewDate.getFullYear()}-${viewDate.getMonth()}`;
  return (
    <div className="nb-cal-picker" role="dialog" aria-label="Choose week">
      <div className="nb-cal-picker-head">
        <button type="button" className="nb-cal-nav" onClick={() => onShiftMonth(-1)} aria-label="Previous month">
          <ChevronLeft size={16} />
        </button>
        <span>{MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}</span>
        <button type="button" className="nb-cal-nav" onClick={() => onShiftMonth(1)} aria-label="Next month">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="nb-cal-picker-body">
        <div>
          <div className="nb-cal-mini-weekdays">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={`${d}-${i}`}>{d}</span>)}
          </div>
          <div className="nb-cal-week-grid">
            {weeks.map((days) => {
              const key = toYmd(days[0]);
              return (
                <button
                  key={key}
                  type="button"
                  className={`nb-cal-week-row ${key === selectedKey ? "is-selected" : ""}`}
                  onClick={() => onPickWeek(days[0])}
                >
                  {days.map((day) => {
                    const muted = day.getMonth() !== viewDate.getMonth();
                    const isToday = toYmd(day) === todayKey;
                    return (
                      <span key={toYmd(day)} className={`nb-cal-mini-day ${muted ? "is-muted" : ""} ${isToday ? "is-today" : ""}`}>
                        {day.getDate()}
                      </span>
                    );
                  })}
                </button>
              );
            })}
          </div>
        </div>
        <ScrollPickList
          ariaLabel="Months"
          selectedKey={monthKey}
          items={monthItems.map((item) => ({
            key: `${item.year}-${item.month}`,
            label: `${MONTHS[item.month].slice(0, 3)} ${item.year}`,
            onSelect: () => onSelectMonth(item.year, item.month),
          }))}
        />
      </div>
    </div>
  );
}

function formatEntryDate(dateStr?: string): string {
  if (!dateStr) return "No date";
  const match = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const localDate = new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
    if (!isNaN(localDate.getTime())) {
      return localDate.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" });
    }
  }
  return dateStr;
}

export default function CalendarView({ onClose }: { onClose?: () => void }) {
  const { metadata, navigateTo, reorderCalendarEntry, calendarMode, calendarCursor } = useWorkspace();
  const mode = calendarMode;
  const cursor = useMemo(() => parseYmd(calendarCursor), [calendarCursor]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerDate, setPickerDate] = useState(() => new Date());
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef(cursor);
  const modeRef = useRef(mode);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navHoverRef = useRef<string | null>(null);
  cursorRef.current = cursor;
  modeRef.current = mode;
  const commitView = useCallback((nextMode: "month" | "week", nextCursor: Date) => {
    navigateTo(
      {
        date: toYmd(nextCursor),
        view: nextMode,
        month: null,
        week: null,
      },
      "/workspace/calendar",
      { replace: true }
    );
  }, [navigateTo]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const phases = getPhases(metadata.phases);
  const phaseConfig = getPhaseConfig(phases);

  const calendarEntries = useMemo(
    () => sortedEntries(metadata.entries).filter((e) => !e.isTemplate),
    [metadata.entries]
  );

  const pickerYears = useMemo(() => {
    const nowYear = new Date().getFullYear();
    const fromEntries = calendarEntries
      .map((e) => (e.date || "").slice(0, 4))
      .map(Number)
      .filter((y) => Number.isFinite(y) && y > 1900);
    const min = Math.min(nowYear - 20, ...fromEntries, pickerDate.getFullYear());
    const max = Math.max(nowYear + 5, ...fromEntries, pickerDate.getFullYear());
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }, [calendarEntries, pickerDate]);

  const pickerMonths = useMemo(
    () => pickerYears.flatMap((year) => MONTHS.map((_, month) => ({ year, month }))),
    [pickerYears]
  );

  const cards = useMemo(() => {
    const map: Record<string, { title: string; color?: string; author: string; phaseName: string; date: string }> = {};
    for (const e of calendarEntries) {
      map[e.id] = {
        title: e.title,
        color: e.phase ? phaseConfig[e.phase]?.color : undefined,
        author: formatAuthors(e.authors),
        phaseName: e.phase ? (phases.find((p) => p.id === e.phase)?.name || "") : "",
        date: formatEntryDate(e.date),
      };
    }
    return map;
  }, [calendarEntries, phaseConfig, phases]);

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

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const heading = mode === "month"
    ? `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
    : `${weekDays[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekDays[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  const NAV_DWELL_MS = 500;

  const clearNavTimer = () => {
    if (navTimerRef.current) {
      clearTimeout(navTimerRef.current);
      navTimerRef.current = null;
    }
    navHoverRef.current = null;
  };

  const shift = (dir: number) => {
    if (modeRef.current === "month") {
      commitView(modeRef.current, addMonthsClamped(cursorRef.current, dir));
      return;
    }
    commitView(modeRef.current, addDays(cursorRef.current, 7 * dir));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id != null ? String(event.over.id) : "";
    if (overId !== "nav:prev" && overId !== "nav:next") {
      clearNavTimer();
      return;
    }
    if (navHoverRef.current === overId && navTimerRef.current) return;
    clearNavTimer();
    navHoverRef.current = overId;
    const tick = () => {
      shift(overId === "nav:prev" ? -1 : 1);
      navTimerRef.current = setTimeout(tick, NAV_DWELL_MS);
    };
    navTimerRef.current = setTimeout(tick, NAV_DWELL_MS);
  };

  const resolveDrop = (event: DragEndEvent): { date: string; index: number } | null => {
    const overId = event.over?.id != null ? String(event.over.id) : "";
    if (!overId || overId.startsWith("nav:")) return null;
    const movedId = String(event.active.id);
    const y = pointerY(event);

    let date: string | undefined;
    if (overId.startsWith("day:")) {
      date = overId.slice(4);
    } else {
      date = Object.entries(byDate).find(([, ids]) => ids.includes(overId))?.[0];
    }
    if (!date) return null;

    const ids = byDate[date] || [];
    return { date, index: insertIndexFromPointer(date, ids, movedId, y) };
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const movedId = String(event.active.id);
    clearNavTimer();
    setActiveId(null);
    const drop = resolveDrop(event);
    if (!drop) return;
    const destKey = drop.date;
    const destIds = [...(byDate[destKey] || [])];
    const targetDate = destKey === UNDATED ? "" : destKey;
    await reorderCalendarEntry(movedId, targetDate, destIds, drop.index);
  };

  const openEntry = (id: string) => navigateTo({ entry: id, resource: null }, "/workspace/editor");

  const handleHover = (id: string | null, el: HTMLElement | null) => {
    if (!id || !el || activeId) {
      setHover(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setHover({ id, x: rect.left + rect.width / 2, y: rect.bottom + 8 });
  };

  const hoverCard = hover ? cards[hover.id] : null;

  const renderDay = (d: Date) => {
    const key = toYmd(d);
    return (
      <DayColumn
        key={key}
        dateKey={key}
        label={String(d.getDate())}
        isToday={key === today}
        isMuted={mode === "month" && d.getMonth() !== cursor.getMonth()}
        ids={byDate[key] || []}
        cards={cards}
        onOpen={openEntry}
        onHover={handleHover}
      />
    );
  };

  return (
    <div className="nb-cal">
      <DndContext
        sensors={sensors}
        collisionDetection={calendarCollision}
        autoScroll={{
          canScroll: (element) =>
            element instanceof HTMLElement && element.classList.contains("nb-cal-day-list"),
        }}
        onDragStart={(e) => {
          setActiveId(String(e.active.id));
          setHover(null);
          setPickerOpen(false);
        }}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
      <header className="nb-cal-header">
        <div className="flex items-center gap-3">
          <CalendarDays size={20} className="text-nb-primary" />
          <h1 className="text-lg font-bold tracking-tight text-nb-on-surface">Calendar</h1>
        </div>
        <div className="nb-cal-header-controls">
          <CalNavButton navId="nav:prev" label="Previous" onClick={() => shift(-1)}>
            <ChevronLeft size={16} />
          </CalNavButton>
          <div className="nb-cal-picker-wrap">
            <button
              type="button"
              className={`nb-cal-title ${pickerOpen ? "is-open" : ""}`}
              aria-expanded={pickerOpen}
              onClick={() => {
                setPickerDate(new Date(cursor));
                setPickerOpen((open) => !open);
              }}
            >
              {heading}
              <ChevronDown size={14} />
            </button>
            {pickerOpen && (
              <>
                <div className="nb-cal-picker-backdrop" onClick={() => setPickerOpen(false)} />
                {mode === "month" ? (
                  <MonthGridPicker
                    year={pickerDate.getFullYear()}
                    selectedMonth={cursor.getFullYear() === pickerDate.getFullYear() ? cursor.getMonth() : -1}
                    years={pickerYears}
                    onPick={(month) => {
                      const last = new Date(pickerDate.getFullYear(), month + 1, 0).getDate();
                      commitView("month", new Date(pickerDate.getFullYear(), month, Math.min(cursor.getDate(), last)));
                      setPickerOpen(false);
                    }}
                    onSelectYear={(year) => setPickerDate((prev) => new Date(year, prev.getMonth(), 1))}
                    onShiftYear={(dir) => setPickerDate((prev) => new Date(prev.getFullYear() + dir, prev.getMonth(), 1))}
                  />
                ) : (
                  <WeekGridPicker
                    viewDate={pickerDate}
                    selected={cursor}
                    monthItems={pickerMonths}
                    onPickWeek={(weekStart) => {
                      commitView("week", addDays(weekStart, cursor.getDay()));
                      setPickerOpen(false);
                    }}
                    onSelectMonth={(year, month) => setPickerDate(new Date(year, month, 1))}
                    onShiftMonth={(dir) => setPickerDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + dir, 1))}
                  />
                )}
              </>
            )}
          </div>
          <CalNavButton navId="nav:next" label="Next" onClick={() => shift(1)}>
            <ChevronRight size={16} />
          </CalNavButton>
          <button type="button" className="nb-cal-today" onClick={() => { commitView(mode, new Date()); setPickerOpen(false); }}>
            Today
          </button>
          <div className="nb-cal-toggle" role="tablist" aria-label="Calendar view">
            <button type="button" role="tab" aria-selected={mode === "month"} className={mode === "month" ? "is-active" : ""} onClick={() => { commitView("month", cursor); setPickerOpen(false); }}>
              <LayoutGrid size={14} /> Month
            </button>
            <button type="button" role="tab" aria-selected={mode === "week"} className={mode === "week" ? "is-active" : ""} onClick={() => { commitView("week", cursor); setPickerOpen(false); }}>
              <Rows3 size={14} /> Week
            </button>
          </div>
          {onClose && (
            <button
              type="button"
              className="nb-cal-nav"
              onClick={onClose}
              title="Close Calendar"
              aria-label="Close Calendar"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </header>
        <div className="nb-cal-body">
        {(byDate[UNDATED] || []).length > 0 && (
          <div className="nb-cal-undated">
            <DayColumn
              dateKey={UNDATED}
              label="Undated"
              ids={byDate[UNDATED]}
              cards={cards}
              onOpen={openEntry}
              onHover={handleHover}
            />
          </div>
        )}
        <div className="nb-cal-weekdays">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div
          ref={scrollRef}
          className={`nb-cal-scroll ${mode === "week" ? "is-week" : "is-month"}`}
        >
          {mode === "month" ? (
            <section className="nb-cal-month-block">
              <div className="nb-cal-grid">
                {monthCells(cursor.getFullYear(), cursor.getMonth()).map((d) => renderDay(d))}
              </div>
            </section>
          ) : (
            <section className="nb-cal-week-block">
              <div className="nb-cal-grid">
                {weekDays.map((d) => renderDay(d))}
              </div>
            </section>
          )}
        </div>
        </div>
        <DragOverlay>
          {activeId ? <div className="nb-cal-card is-overlay">{cards[activeId]?.title || "Untitled"}</div> : null}
        </DragOverlay>
      </DndContext>
      {hoverCard && hover && (
        <div className="nb-cal-tip" style={{ left: hover.x, top: hover.y }} role="tooltip">
          <div className="nb-cal-tip-title">{hoverCard.title || "Untitled"}</div>
          {hoverCard.phaseName && (
            <div className="nb-cal-tip-row">
              <span className="nb-cal-tip-swatch" style={{ background: hoverCard.color }} />
              {hoverCard.phaseName}
            </div>
          )}
          {hoverCard.author && <div className="nb-cal-tip-row">By {hoverCard.author}</div>}
          <div className="nb-cal-tip-row">{hoverCard.date}</div>
        </div>
      )}
    </div>
  );
}
