"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";

export function Alert({
  variant = "info",
  children,
  className,
}: {
  variant?: "info" | "warning" | "error";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border px-3 py-2 text-sm",
        variant === "info" && "border-nb-tertiary/30 bg-nb-tertiary/5 text-nb-on-surface",
        variant === "warning" && "border-nb-warning/30 bg-nb-warning/10 text-nb-on-surface",
        variant === "error" && "border-nb-danger/30 bg-nb-danger/10 text-nb-danger",
        className
      )}
    >
      {children}
    </div>
  );
}
