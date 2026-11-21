"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { IconButton } from "@/components/ui";
import { cn } from "@/components/ui/cn";

/** Persist sidebar collapse preference (`1` / `0`) under a stable key. */
export function usePersistedCollapsed(storageKey: string, initial = false) {
  const [collapsed, setCollapsed] = useState(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === "1") setCollapsed(true);
      else if (raw === "0") setCollapsed(false);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed, hydrated, storageKey]);

  return [collapsed, setCollapsed] as const;
}

/** Narrow strip shown when a notebook side rail is collapsed (desktop). */
export function NotebookSideRailCollapsedStrip({
  label = "Expand sidebar",
  onExpand,
  className,
}: {
  label?: string;
  onExpand: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-10 shrink-0 flex-col items-center border-r border-nb-outline-variant/30 bg-nb-surface-low py-2 max-md:hidden",
        className
      )}
    >
      <IconButton aria-label={label} title={label} onClick={onExpand}>
        <PanelLeft size={16} />
      </IconButton>
    </div>
  );
}

/**
 * Shared left rail chrome for Compile / Judge (and align Entries collapse look).
 * Desktop: collapsible to a thin strip; preference persisted via `storageKey`.
 * Mobile: stacked panel (no strip collapse) — matches prior Compile/Judge layout.
 */
export function NotebookSideRail({
  storageKey,
  title,
  headerActions,
  footer,
  children,
  widthClassName = "md:w-64",
  mobileMaxHeightClassName = "max-h-48",
  className,
  expandLabel = "Expand sidebar",
  collapseLabel = "Collapse sidebar",
}: {
  storageKey: string;
  title?: ReactNode;
  headerActions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  widthClassName?: string;
  mobileMaxHeightClassName?: string;
  className?: string;
  expandLabel?: string;
  collapseLabel?: string;
}) {
  const [collapsed, setCollapsed] = usePersistedCollapsed(storageKey, false);

  if (collapsed) {
    return (
      <NotebookSideRailCollapsedStrip
        label={expandLabel}
        onExpand={() => setCollapsed(false)}
        className={className}
      />
    );
  }

  return (
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col border-b border-nb-outline-variant/30 bg-nb-surface-low md:max-h-none md:border-b-0 md:border-r",
        mobileMaxHeightClassName,
        widthClassName,
        className
      )}
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-nb-outline-variant/20 px-2 py-2">
        {title != null ? (
          <div className="min-w-0 flex-1 truncate text-nb-label font-semibold text-nb-on-surface">
            {title}
          </div>
        ) : (
          <div className="min-w-0 flex-1" />
        )}
        {headerActions}
        <IconButton
          className="hidden md:inline-flex"
          aria-label={collapseLabel}
          title={collapseLabel}
          onClick={() => setCollapsed(true)}
        >
          <PanelLeftClose size={16} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">{children}</div>
      {footer ? (
        <div className="shrink-0 border-t border-nb-outline-variant/20">{footer}</div>
      ) : null}
    </aside>
  );
}
