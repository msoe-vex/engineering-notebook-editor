"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function Card({
  className,
  children,
  interactive,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-nb-outline-variant/30 bg-nb-surface p-4 shadow-nb-sm",
        interactive &&
          "transition-all hover:border-nb-primary/30 hover:shadow-nb-lg",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function ListRow({
  className,
  children,
  interactive,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative flex items-center gap-4 rounded-2xl border border-nb-outline-variant/30 bg-nb-surface p-4",
        interactive &&
          "transition-all hover:border-nb-primary/30 hover:shadow-nb-lg",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
