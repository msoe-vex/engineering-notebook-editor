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
  className,
  wide,
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        className={cn(
          "relative w-full overflow-hidden rounded-nb-2xl border border-nb-outline-variant/30 bg-nb-surface shadow-nb-2xl animate-in zoom-in-95 fade-in duration-200",
          wide ? "max-w-lg" : "max-w-sm",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-nb-outline-variant/20 px-6 pt-5 pb-3">
          {title ? (
            <h3 className="text-nb-body font-semibold text-nb-on-surface">{title}</h3>
          ) : (
            <span />
          )}
          <IconButton onClick={onClose} aria-label="Close">
            <X size={18} />
          </IconButton>
        </div>
        <div className="p-6 pt-4">{children}</div>
      </div>
    </div>
  );
}
