"use client";

import { useMemo, useState } from "react";
import * as LucideIcons from "lucide-react";
import { Search, Shapes, type LucideIcon } from "lucide-react";
import { AVAILABLE_ICONS } from "@/lib/notebook/phases";

function resolveIcon(name: string): LucideIcon {
  return (LucideIcons as unknown as Record<string, LucideIcon>)[name] || Shapes;
}

export function CmsIconPicker({
  value,
  onChange,
  label = "Icon",
}: {
  value?: string;
  onChange: (iconName: string) => void;
  label?: string;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return AVAILABLE_ICONS;
    return AVAILABLE_ICONS.filter((i) => i.toLowerCase().includes(q));
  }, [search]);
  const Current = resolveIcon(value || "Shapes");

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-nb-on-surface-variant">{label}</span>
        <span className="inline-flex items-center gap-1.5 rounded-nb-md border border-nb-outline-variant/30 bg-nb-surface-low px-2 py-1 text-nb-caption text-nb-on-surface">
          <Current size={14} />
          {value || "None"}
        </span>
      </div>
      <div className="relative">
        <Search
          size={12}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-nb-on-surface-variant/40"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search icons…"
          className="w-full rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface-low py-1.5 pl-8 pr-2 text-[10px] font-semibold text-nb-on-surface outline-none focus:ring-2 focus:ring-nb-primary/20"
        />
      </div>
      <div className="custom-scrollbar grid max-h-40 grid-cols-6 gap-1 overflow-y-auto pr-0.5">
        <button
          type="button"
          title="Clear icon"
          onClick={() => onChange("")}
          className={`flex h-8 items-center justify-center rounded-nb text-[9px] font-bold ${
            !value
              ? "bg-nb-primary text-white"
              : "border border-nb-outline-variant/20 bg-nb-surface-low text-nb-on-surface-variant"
          }`}
        >
          None
        </button>
        {filtered.map((iconName) => {
          const Icon = resolveIcon(iconName);
          const selected = value === iconName;
          return (
            <button
              key={iconName}
              type="button"
              title={iconName}
              onClick={() => onChange(iconName)}
              className={`flex h-8 w-8 items-center justify-center rounded-nb transition hover:scale-105 ${
                selected
                  ? "bg-nb-primary text-white"
                  : "border border-nb-outline-variant/20 bg-nb-surface-low text-nb-on-surface-variant hover:border-nb-primary hover:text-nb-primary"
              }`}
            >
              <Icon size={14} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CmsIcon({ name, size = 16 }: { name?: string; size?: number }) {
  if (!name) return null;
  const Icon = resolveIcon(name);
  return <Icon size={size} aria-hidden />;
}
