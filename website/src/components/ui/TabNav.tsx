"use client";

import Link from "next/link";
import { cn } from "./cn";

export type TabItem = {
  id: string;
  label: string;
  href?: string;
  count?: number;
};

export function TabNav({
  items,
  activeId,
  onSelect,
  className,
}: {
  items: TabItem[];
  activeId: string;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex gap-1 border-b border-nb-outline-variant/30", className)}>
      {items.map((item) => {
        const active = activeId === item.id;
        const classNameInner = cn(
          "relative px-4 py-2.5 text-nb-label font-semibold transition-colors",
          active
            ? "text-nb-primary"
            : "text-nb-on-surface-variant hover:text-nb-on-surface"
        );
        const content = (
          <>
            {item.label}
            {typeof item.count === "number" && (
              <span className="ml-1.5 text-nb-caption opacity-50">{item.count}</span>
            )}
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-nb-primary" />
            )}
          </>
        );
        if (item.href) {
          return (
            <Link key={item.id} href={item.href} className={classNameInner}>
              {content}
            </Link>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect?.(item.id)}
            className={classNameInner}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
