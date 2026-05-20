import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Calendar as CalendarIcon } from "lucide-react";

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  className?: string;
}

export default function DatePicker({ value, onChange, className = "" }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  // Robust date parser for YYYY-MM-DD or YYYY-M-D format in local time
  const parseDateString = (str: string): Date => {
    if (!str) return new Date();
    const match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
      const y = parseInt(match[1], 10);
      const m = parseInt(match[2], 10) - 1;
      const d = parseInt(match[3], 10);
      const tempDate = new Date(y, m, d, 12, 0, 0);
      if (!isNaN(tempDate.getTime())) return tempDate;
    }
    const fallback = new Date(str + "T12:00:00");
    return isNaN(fallback.getTime()) ? new Date() : fallback;
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        (!popupRef.current || !popupRef.current.contains(event.target as Node))
      ) {
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

  return (
    <div
      className={`flex items-center gap-2.5 px-3 rounded-xl bg-nb-surface-low border border-nb-outline-variant/30 group transition-all hover:border-nb-primary/50 relative cursor-pointer ${className}`}
      ref={containerRef}
      onClick={() => {
        if (!isOpen) {
          updateCoords();
        }
        setIsOpen(!isOpen);
      }}
    >
      <CalendarIcon size={18} className="text-nb-primary shrink-0 drop-shadow-sm" />
      <span className="text-[11px] font-bold text-nb-on-surface-variant tracking-tight flex-1 truncate">
        {value ? parseDateString(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : "Select Date"}
      </span>

      {isOpen && createPortal(
        <div
          ref={popupRef}
          style={{
            position: 'fixed',
            top: coords.top + 8,
            left: coords.left,
            zIndex: 9999
          }}
          className="p-4 bg-nb-surface border border-nb-outline-variant shadow-nb-xl rounded-2xl w-60 animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-[9px] font-black uppercase tracking-wider text-nb-on-surface-variant/50">Select Date</label>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                }}
                className="text-[10px] font-bold text-nb-primary hover:text-nb-primary/80 transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
            <input
              type="date"
              value={value || ""}
              onChange={(e) => {
                onChange(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") {
                  setIsOpen(false);
                }
              }}
              className="w-full bg-nb-surface-low border border-nb-outline-variant/30 rounded-xl px-3 py-2 text-[11px] font-bold text-nb-on-surface outline-none focus:border-nb-primary/50 transition-all cursor-pointer"
              autoFocus
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
