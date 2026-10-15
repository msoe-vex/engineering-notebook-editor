"use client";

import { Loader2 } from "lucide-react";
import { cn } from "./cn";

export function Spinner({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <Loader2
      size={size}
      className={cn("animate-spin text-nb-primary", className)}
      aria-hidden
    />
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-nb-on-surface-variant">
      <Spinner size={18} />
      <span>{label}</span>
    </div>
  );
}
