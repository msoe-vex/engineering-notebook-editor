"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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

function usePersistedWidthPx(
  storageKey: string,
  defaultWidth: number,
  minWidth: number,
  maxWidth: number
) {
  const [width, setWidth] = useState(defaultWidth);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const n = raw ? Number(raw) : NaN;
      if (Number.isFinite(n)) {
        setWidth(Math.min(maxWidth, Math.max(minWidth, n)));
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [storageKey, minWidth, maxWidth]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, String(width));
    } catch {
      /* ignore */
    }
  }, [width, hydrated, storageKey]);

  return [width, setWidth] as const;
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
 * Desktop: collapsible + optional resize with persisted width.
 * Mobile: stacked panel (no strip collapse).
 */
export function NotebookSideRail({
  storageKey,
  title,
  headerActions,
  footer,
  children,
  widthClassName = "md:w-64",
  defaultWidthPx = 256,
  minWidthPx = 200,
  maxWidthPx = 480,
  resizable = true,
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
  /** Used when `resizable` is false. */
  widthClassName?: string;
  defaultWidthPx?: number;
  minWidthPx?: number;
  maxWidthPx?: number;
  resizable?: boolean;
  mobileMaxHeightClassName?: string;
  className?: string;
  expandLabel?: string;
  collapseLabel?: string;
}) {
  const [collapsed, setCollapsed] = usePersistedCollapsed(storageKey, false);
  const [widthPx, setWidthPx] = usePersistedWidthPx(
    `${storageKey}:w`,
    defaultWidthPx,
    minWidthPx,
    maxWidthPx
  );
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!resizable) return;
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startW: widthPx };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [resizable, widthPx]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const delta = e.clientX - dragRef.current.startX;
      setWidthPx(
        Math.min(maxWidthPx, Math.max(minWidthPx, dragRef.current.startW + delta))
      );
    },
    [maxWidthPx, minWidthPx, setWidthPx]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

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
        // Mobile: full width stacked. Desktop: fixed rail width so the sibling main pane keeps flex-1 space.
        "relative flex w-full shrink-0 flex-col border-b border-nb-outline-variant/30 bg-nb-surface-low md:max-h-none md:border-b-0 md:border-r",
        mobileMaxHeightClassName,
        resizable ? "md:w-[var(--rail-w)]" : widthClassName,
        className
      )}
      style={
        resizable
          ? ({ ["--rail-w" as string]: `${widthPx}px` } as React.CSSProperties)
          : undefined
      }
    >
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
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
      </div>
      {resizable && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          title="Drag to resize"
          className="absolute inset-y-0 right-0 z-10 hidden w-1.5 cursor-col-resize md:block hover:bg-nb-primary/30 active:bg-nb-primary/40"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      )}
    </aside>
  );
}
