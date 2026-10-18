"use client";

import Link from "next/link";
import {
  CalendarDays,
  FileText,
  Printer,
  Settings,
  Users,
} from "lucide-react";
import type { WorkspaceHeaderNavItem } from "@/lib/cloud/workspaceHeaderStore";

const ICONS: Record<string, typeof FileText> = {
  entries: FileText,
  schedule: CalendarDays,
  compile: Printer,
  members: Users,
  setup: Settings,
};

/** Slim horizontal strip for ≥ md (under AppChrome). */
export function NotebookSectionStrip({
  items,
  activeId,
}: {
  items: WorkspaceHeaderNavItem[];
  activeId: string;
}) {
  if (items.length === 0) return null;
  return (
    <nav
      className="hidden shrink-0 items-center gap-0.5 border-b border-nb-outline-variant/30 bg-nb-surface px-2 py-1 md:flex"
      aria-label="Notebook sections"
    >
      {items.map((item) => {
        const active = activeId === item.id;
        const Icon = ICONS[item.id] ?? FileText;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-nb-lg px-3 py-1.5 text-nb-label font-semibold transition-colors ${
              active
                ? "bg-nb-primary/10 text-nb-primary"
                : "text-nb-on-surface-variant hover:bg-nb-surface-low hover:text-nb-on-surface"
            }`}
          >
            <Icon size={14} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Bottom tab bar for &lt; md (thumb reach). */
export function NotebookSectionBottomTabs({
  items,
  activeId,
}: {
  items: WorkspaceHeaderNavItem[];
  activeId: string;
}) {
  if (items.length === 0) return null;
  return (
    <nav
      className="flex shrink-0 border-t border-nb-outline-variant/30 bg-nb-surface/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Notebook sections"
    >
      {items.map((item) => {
        const active = activeId === item.id;
        const Icon = ICONS[item.id] ?? FileText;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-semibold transition-colors ${
              active
                ? "text-nb-primary"
                : "text-nb-on-surface-variant hover:text-nb-on-surface"
            }`}
          >
            <Icon size={18} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
