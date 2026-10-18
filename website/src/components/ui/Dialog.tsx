"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "./IconButton";
import { cn } from "./cn";

export function Dialog({
  isOpen,
  onClose,
  title,
  children,
  footer,
  className,
  wide,
  size = "sm",
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** Sticky action bar below the scrollable body. */
  footer?: ReactNode;
  className?: string;
  /** @deprecated prefer `size` */
  wide?: boolean;
  size?: "sm" | "md" | "xl";
}) {
  if (!isOpen) return null;

  const sizeClass =
    size === "xl" ? "max-w-5xl" : size === "md" || wide ? "max-w-lg" : "max-w-sm";

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        className={cn(
          "relative flex max-h-[min(90vh,56rem)] w-full flex-col overflow-hidden rounded-nb-2xl border border-nb-outline-variant/30 bg-nb-surface shadow-nb-2xl animate-in zoom-in-95 fade-in duration-200",
          sizeClass,
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-nb-outline-variant/20 px-6 pt-5 pb-3">
          {title ? (
            <h3 className="text-nb-body font-semibold text-nb-on-surface">{title}</h3>
          ) : (
            <span />
          )}
          <IconButton onClick={onClose} aria-label="Close">
            <X size={18} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6 pt-4">{children}</div>
        {footer ? (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-nb-outline-variant/20 bg-nb-surface px-6 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
