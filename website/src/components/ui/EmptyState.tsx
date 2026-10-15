"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-nb-outline-variant/40 bg-nb-surface-low/50 px-6 py-10 text-center",
        className
      )}
    >
      <p className="text-sm font-medium text-nb-on-surface-variant">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-nb-on-surface-variant/70">{description}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
