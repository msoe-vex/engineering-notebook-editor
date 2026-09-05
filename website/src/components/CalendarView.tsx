import { useWorkspace } from "../hooks/useWorkspace";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from "date-fns";
import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { DndContext, DragOverlay, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EntryMetadata } from "../lib/metadata";

// --- Sortable Item Component ---
function SortableEntry({ entry, phaseName, phaseColor }: { entry: EntryMetadata, phaseName: string, phaseColor: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-2 mb-1 rounded text-sm shadow-sm flex items-center border border-gray-700 bg-gray-800 ${isDragging ? "ring-2 ring-primary" : ""}`}
    >
      <div {...attributes} {...listeners} className="mr-2 cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300">
        <GripVertical size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate text-gray-200">{entry.title || "Untitled"}</div>
        <div className="text-xs text-gray-400 flex justify-between items-center mt-1">
          <span className="truncate max-w-[60%]">{entry.author || "Unknown"}</span>
          <span
            className="px-1.5 rounded-sm text-[10px] font-semibold tracking-wide uppercase max-w-[40%] truncate"
            style={{ backgroundColor: `${phaseColor}20`, color: phaseColor, border: `1px solid ${phaseColor}40` }}
            title={phaseName}
          >
            {phaseName}
          </span>
        </div>
      </div>
    </div>
  );
}

// --- Main Calendar View Component ---
export function CalendarView() {
  const { metadata, setShowCalendar, updateEntryMetadata } = useWorkspace();
  const entries = metadata?.entries || [];
  const phases = metadata?.phases || [];
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const phaseMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    if (phases) {
      phases.forEach(p => map.set(p.id, { name: p.name, color: p.color }));
    }
    return map;
  }, [phases]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Map entries to days
  const entriesByDay = useMemo(() => {
    const map = new Map<string, EntryMetadata[]>();
    entries.forEach(e => {
      if (e.isTemplate) return;
      const dateStr = e.date || format(new Date(e.createdAt), "yyyy-MM-dd");
      if (!map.has(dateStr)) map.set(dateStr, []);
      map.get(dateStr)!.push(e);
    });
    // Sort entries within each day by order
    for (const [, dayEntries] of map.entries()) {
      dayEntries.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    return map;
  }, [entries]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string; // Could be an entry ID or a day ID (e.g. "day-2023-10-01")

    const activeEntry = entries.find(e => e.id === activeId);
    if (!activeEntry) return;

    let targetDateStr = activeEntry.date;
    let targetEntries: EntryMetadata[] = [];

    if (overId.startsWith("day-")) {
      targetDateStr = overId.replace("day-", "");
      targetEntries = entriesByDay.get(targetDateStr) || [];
      // Moved to an empty day or bottom of a day
      if (targetDateStr !== activeEntry.date) {
         await updateEntryMetadata(activeId, { date: targetDateStr, order: targetEntries.length });
      }
    } else {
      // Reordering relative to another entry
      const overEntry = entries.find(e => e.id === overId);
      if (overEntry) {
        targetDateStr = overEntry.date;
        targetEntries = entriesByDay.get(targetDateStr) || [];

        const oldIndex = targetEntries.findIndex(e => e.id === activeId);
        const newIndex = targetEntries.findIndex(e => e.id === overId);

        // If moving to a new day, we just insert at the overIndex
        if (activeEntry.date !== targetDateStr) {
          await updateEntryMetadata(activeId, { date: targetDateStr, order: newIndex });
          // Note: we might need to update order of other items, but for now just setting order is a start.
          // In a real app we'd re-sequence the order field for all items in that day.

          // Re-sequence all items in the target day
          const updatedTargetEntries = [...targetEntries];
          updatedTargetEntries.splice(newIndex, 0, activeEntry);
          for (let i = 0; i < updatedTargetEntries.length; i++) {
             if (updatedTargetEntries[i].id !== activeId) {
                 await updateEntryMetadata(updatedTargetEntries[i].id, { order: i });
             } else {
                 await updateEntryMetadata(activeId, { date: targetDateStr, order: i });
             }
          }
        } else {
          // Reordering within the same day
           if (oldIndex !== newIndex) {
              const updatedEntries = [...targetEntries];
              updatedEntries.splice(oldIndex, 1);
              updatedEntries.splice(newIndex, 0, activeEntry);
              for (let i = 0; i < updatedEntries.length; i++) {
                 await updateEntryMetadata(updatedEntries[i].id, { order: i });
              }
           }
        }
      }
    }
  };

  const activeDragEntry = useMemo(() => entries.find(e => e.id === activeDragId), [activeDragId, entries]);

  return (
    <div className="absolute inset-0 bg-background flex flex-col z-10 border-l border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/50">
        <h2 className="text-lg font-semibold flex items-center">
          <span className="mr-2">Calendar</span>
          <span className="text-sm font-normal text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full">
            {format(currentDate, "MMMM yyyy")}
          </span>
        </h2>
        <div className="flex space-x-2">
          <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))} className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors">
            <ChevronLeft size={20} />
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-sm hover:bg-gray-800 rounded font-medium text-gray-300 hover:text-white transition-colors">
            Today
          </button>
          <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))} className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors">
            <ChevronRight size={20} />
          </button>
          <button onClick={() => setShowCalendar(false)} className="ml-4 p-1.5 hover:bg-red-900/30 rounded text-gray-400 hover:text-red-400 transition-colors">
            Close
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 overflow-auto bg-[#0a0a0a] p-4">
          <div className="grid grid-cols-7 gap-3 h-full min-h-[600px]">
            {/* Day Headers */}
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
              <div key={day} className="text-center font-semibold text-gray-500 text-xs uppercase tracking-wider mb-2">
                {day}
              </div>
            ))}

            {/* Empty slots for start of month */}
            {Array.from({ length: monthStart.getDay() }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[120px] bg-gray-900/20 rounded-lg border border-gray-800/50" />
            ))}

            {/* Days */}
            {days.map(day => {
              const dateStr = format(day, "yyyy-MM-dd");
              const dayEntries = entriesByDay.get(dateStr) || [];
              const isToday = isSameDay(day, new Date());

              return (
                <SortableContext key={dateStr} items={dayEntries.map(e => e.id)} strategy={verticalListSortingStrategy}>
                  <div
                    id={`day-${dateStr}`}
                    className={`min-h-[120px] rounded-lg border p-2 flex flex-col transition-colors ${
                      isToday ? "bg-primary/5 border-primary/30" : "bg-gray-900/40 border-gray-800/60 hover:border-gray-700"
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className={`text-sm font-medium ${isToday ? "text-primary font-bold" : "text-gray-400"}`}>
                        {format(day, "d")}
                      </span>
                      {dayEntries.length > 0 && (
                        <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full">
                          {dayEntries.length}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1 -mx-1 px-1">
                      {dayEntries.map(entry => {
                        const phase = entry.phase ? phaseMap.get(entry.phase) : null;
                        return (
                          <SortableEntry
                            key={entry.id}
                            entry={entry}
                            phaseName={phase?.name || "No Phase"}
                            phaseColor={phase?.color || "#6b7280"}
                          />
                        );
                      })}
                    </div>
                  </div>
                </SortableContext>
              );
            })}
          </div>
        </div>

        <DragOverlay>
          {activeDragEntry ? (
            <SortableEntry
              entry={activeDragEntry}
              phaseName={activeDragEntry.phase ? phaseMap.get(activeDragEntry.phase)?.name || "No Phase" : "No Phase"}
              phaseColor={activeDragEntry.phase ? phaseMap.get(activeDragEntry.phase)?.color || "#6b7280" : "#6b7280"}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
