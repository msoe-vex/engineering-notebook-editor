"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";

export function FormSection({
  title,
  description,
  children,
  className,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-nb-body font-semibold text-nb-on-surface">{title}</h3>
          {description ? (
            <p className="mt-1 text-nb-caption text-nb-on-surface-variant">{description}</p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
