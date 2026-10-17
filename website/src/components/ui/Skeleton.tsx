"use client";

import type { HTMLAttributes } from "react";
import { cn } from "./cn";

/** Pulsing placeholder block for in-shell loading. */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-nb-lg bg-nb-outline-variant/25 dark:bg-nb-outline-variant/20",
        className
      )}
      {...rest}
    />
  );
}

export function SkeletonLines({
  lines = 4,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className="h-3"
          style={{ width: `${88 - (i % 3) * 12}%` }}
        />
      ))}
    </div>
  );
}
