import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Plus, User, X } from "lucide-react";
import { formatAuthors } from "@/lib/metadata";

interface AuthorsInputProps {
  authors: string[];
  options: string[];
  onChange: (authors: string[]) => void;
  placeholder?: string;
  className?: string;
}

export default function AuthorsInput({
  authors,
  options,
  onChange,
  placeholder = "Author",
  className = "",
}: AuthorsInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 280 });

  const commit = (raw: string) => {
    const name = raw.trim().replace(/,+$/, "").trim();
    if (!name) return;
    if (!authors.some((a) => a.toLowerCase() === name.toLowerCase())) {
      onChange([...authors, name]);
    }
    setDraft("");
  };

  const suggestions = options.filter((opt) => {
    if (authors.some((a) => a.toLowerCase() === opt.toLowerCase())) return false;
    const q = draft.trim().toLowerCase();
    return !q || opt.toLowerCase().includes(q);
  });

  const updateCoords = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setCoords({
      top: rect.bottom + 8,
      left: rect.left,
      width: Math.max(rect.width, 280),
    });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current?.contains(target) ||
        popupRef.current?.contains(target)
      ) return;
      setIsOpen(false);
      setDraft("");
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const summary = formatAuthors(authors);

  return (
    <div
      ref={containerRef}
      className={`flex items-center gap-2.5 px-3 rounded-xl bg-nb-surface-low border border-nb-outline-variant/30 group transition-all hover:border-nb-primary/50 relative cursor-pointer select-none overflow-hidden min-w-0 ${className}`}
      onClick={() => {
        if (!isOpen) updateCoords();
        setIsOpen((open) => !open);
      }}
    >
      <User size={15} className="text-nb-primary shrink-0 drop-shadow-sm" />
      <span className={`text-[12px] font-bold tracking-tight flex-1 min-w-0 truncate ${summary ? "text-nb-on-surface-variant" : "text-nb-on-surface-variant/30"}`}>
        {summary || placeholder}
      </span>
      <ChevronDown size={12} className={`text-nb-on-surface-variant/40 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />

      {isOpen && createPortal(
        <div
          ref={popupRef}
          style={{
            position: "fixed",
            top: coords.top,
            left: coords.left,
            width: coords.width,
            zIndex: 9999,
          }}
          className="p-3 bg-nb-surface border border-nb-outline-variant shadow-nb-xl rounded-2xl animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-2.5">
            <label className="block text-[9px] font-black uppercase tracking-wider text-nb-on-surface-variant/50">
              {authors.length === 1 ? "Author" : "Authors"}
            </label>
            <button
              type="button"
              onClick={() => { setIsOpen(false); setDraft(""); }}
              className="text-[10px] font-bold text-nb-primary hover:text-nb-primary/80 transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>

          {authors.length > 0 && (
            <ul className="mb-2.5 max-h-36 overflow-y-auto space-y-1">
              {authors.map((name) => (
                <li
                  key={name}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-nb-surface-low text-[12px] font-bold text-nb-on-surface"
                >
                  <span className="flex-1 min-w-0 truncate">{name}</span>
                  <button
                    type="button"
                    className="shrink-0 p-0.5 rounded text-nb-on-surface-variant/50 hover:text-red-500 hover:bg-nb-surface-mid cursor-pointer"
                    aria-label={`Remove ${name}`}
                    onClick={() => onChange(authors.filter((a) => a !== name))}
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-nb-surface-low border border-nb-outline-variant/30 focus-within:border-nb-primary/50">
            <Plus size={13} className="text-nb-primary shrink-0" />
            <input
              ref={inputRef}
              type="text"
              autoComplete="off"
              value={draft}
              placeholder="Add name"
              className="flex-1 min-w-0 bg-transparent border-none outline-none text-[12px] font-bold text-nb-on-surface placeholder:text-nb-on-surface-variant/30"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  commit(draft);
                } else if (e.key === "Escape") {
                  setIsOpen(false);
                  setDraft("");
                }
              }}
            />
          </div>

          {suggestions.length > 0 && (
            <ul className="mt-1.5 max-h-40 overflow-y-auto">
              {suggestions.map((opt) => (
                <li key={opt}>
                  <button
                    type="button"
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-[12px] font-bold text-nb-on-surface-variant hover:bg-nb-surface-low hover:text-nb-on-surface cursor-pointer"
                    onClick={() => commit(opt)}
                  >
                    {opt}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
