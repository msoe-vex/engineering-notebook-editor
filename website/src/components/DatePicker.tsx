import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  className?: string;
}

export default function DatePicker({ value, onChange, className = "" }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  // Parse current value or default to today
  const selectedDate = value ? new Date(value + "T12:00:00") : new Date();

  // State for the calendar view (month/year)
  const [viewDate, setViewDate] = useState(new Date(selectedDate.getTime()));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const updateCoords = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX
      });
    }
  };

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const handleDateSelect = (day: number) => {
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const year = newDate.getFullYear();
    const month = String(newDate.getMonth() + 1).padStart(2, '0');
    const d = String(newDate.getDate()).padStart(2, '0');
    onChange(`${year}-${month}-${d}`);
    setIsOpen(false);
  };

  const renderCalendar = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const totalDays = daysInMonth(year, month);
    const firstDay = firstDayOfMonth(year, month);

    const days = [];
    // Padding for first week
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`pad-${i}`} className="w-8 h-8" />);
    }

    for (let d = 1; d <= totalDays; d++) {
      const isSelected = selectedDate.getFullYear() === year &&
        selectedDate.getMonth() === month &&
        selectedDate.getDate() === d;
      const isToday = new Date().getFullYear() === year &&
        new Date().getMonth() === month &&
        new Date().getDate() === d;

      days.push(
        <button
          key={d}
          onClick={(e) => { e.stopPropagation(); handleDateSelect(d); }}
          className={`w-8 h-8 flex items-center justify-center text-[11px] font-bold rounded-lg transition-all cursor-pointer
            ${isSelected
              ? "bg-nb-primary text-white shadow-md shadow-nb-primary/20 scale-110"
              : isToday
                ? "text-nb-primary bg-nb-primary/10 border border-nb-primary/20"
                : "text-nb-on-surface hover:bg-nb-surface-mid hover:scale-105"
            }
          `}
        >
          {d}
        </button>
      );
    }

    return days;
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const [inputValue, setInputValue] = useState(value);
  const [prevValue, setPrevValue] = useState(value);

  // Sync internal input value when external value changes (e.g. from picker)
  if (value !== prevValue) {
    setPrevValue(value);
    if (typeof document !== 'undefined' && document.activeElement?.tagName !== 'INPUT') {
      setInputValue(value);
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);

    const d = new Date(val + "T12:00:00");
    if (!isNaN(d.getTime()) && d.getFullYear() > 1900) {
      setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
      if (val.length >= 10 || /^\d{4}-\d{1,2}-\d{1,2}$/.test(val)) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const ISO = `${year}-${month}-${day}`;
        if (ISO !== value) onChange(ISO);
      }
    }
  };

  return (
    <div
      className={`flex items-center gap-2.5 px-3 rounded-xl bg-nb-surface-low border border-nb-outline-variant/30 group transition-all hover:border-nb-primary/50 relative cursor-pointer ${className}`}
      ref={containerRef}
      onClick={() => {
        if (!isOpen) {
          updateCoords();
          setViewDate(new Date(selectedDate.getTime()));
          setInputValue(value);
        }
        setIsOpen(!isOpen);
      }}
    >
      <CalendarIcon size={18} className="text-nb-primary shrink-0 drop-shadow-sm" />
      <span className="text-[11px] font-bold text-nb-on-surface-variant tracking-tight flex-1 truncate">
        {value ? new Date(value + "T12:00:00").toLocaleDateString(undefined, { dateStyle: 'medium' }) : "Select Date"}
      </span>

      {isOpen && createPortal(
        <div
          style={{
            position: 'fixed',
            top: coords.top + 8,
            left: coords.left,
            zIndex: 9999
          }}
          className="p-4 bg-nb-surface border border-nb-outline-variant shadow-nb-xl rounded-2xl w-64 animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4">
            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setIsOpen(false);
                }
              }}
              placeholder="YYYY-MM-DD"
              autoFocus
              className="w-full bg-nb-surface-low border border-nb-outline-variant/30 rounded-xl px-3 py-2 text-[11px] font-bold text-nb-on-surface outline-none focus:border-nb-primary/50 transition-all placeholder:opacity-30"
            />
          </div>

          <div className="flex items-center justify-between mb-4 pt-4 border-t border-nb-outline-variant/30">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-nb-surface-low rounded-lg transition-colors cursor-pointer text-nb-on-surface-variant"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="text-[11px] font-black tracking-widest text-nb-on-surface">
              {monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}
            </div>
            <button
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-nb-surface-low rounded-lg transition-colors cursor-pointer text-nb-on-surface-variant"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="w-8 h-8 flex items-center justify-center text-[9px] font-black text-nb-on-surface-variant/40">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {renderCalendar()}
          </div>

          <div className="mt-4 pt-4 border-t border-nb-outline-variant/30 flex justify-between">
            <button
              onClick={(e) => {
                e.stopPropagation();
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const d = String(now.getDate()).padStart(2, '0');
                onChange(`${year}-${month}-${d}`);
                setIsOpen(false);
              }}
              className="text-[9px] font-bold text-nb-primary hover:underline cursor-pointer"
            >
              Today
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
              className="text-[9px] font-bold text-nb-on-surface-variant/60 hover:text-nb-on-surface cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
