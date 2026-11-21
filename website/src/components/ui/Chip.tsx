"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "./cn";

export function Chip({
  children,
  className,
  onRemove,
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  onRemove?: () => void;
  tone?: "neutral" | "primary" | "tertiary" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-nb px-2 py-0.5 text-nb-caption font-semibold",
        tone === "neutral" && "bg-nb-surface-low text-nb-on-surface-variant",
        tone === "primary" && "bg-nb-primary/10 text-nb-primary",
        tone === "tertiary" && "bg-nb-tertiary/10 text-nb-tertiary",
        tone === "danger" && "bg-nb-danger/10 text-nb-danger",
        className
      )}
    >
      <span className="truncate">{children}</span>
      {onRemove && (
        <button
          type="button"
          aria-label="Remove"
          className="shrink-0 rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
          onClick={onRemove}
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
}
