"use client";

import { MoreVertical } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconButton } from "./IconButton";
import { MenuList } from "./MenuList";
import type { MenuItem } from "./menuTypes";
import { cn } from "./cn";

export type { MenuItem } from "./menuTypes";

export function DropdownMenu({
  items,
  align = "right",
  className,
  trigger,
  ariaLabel = "More actions",
}: {
  items: MenuItem[];
  align?: "left" | "right";
  className?: string;
  /** Custom trigger; defaults to ⋮ icon button. */
  trigger?: ReactNode;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative shrink-0", className)}>
      {trigger ? (
        <button
          type="button"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="menu"
          className="inline-flex items-center"
          onClick={() => setOpen((v) => !v)}
        >
          {trigger}
        </button>
      ) : (
        <IconButton
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((v) => !v)}
        >
          <MoreVertical size={16} />
        </IconButton>
      )}
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute top-full z-30 mt-1 min-w-44 overflow-hidden rounded-xl border border-nb-outline-variant/30 bg-nb-surface py-1 shadow-nb-lg",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          <MenuList
            items={items}
            onItemSelect={(item) => {
              setOpen(false);
              item.onSelect?.();
            }}
          />
        </div>
      )}
    </div>
  );
}
