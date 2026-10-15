"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  backHref,
  backLabel = "Back",
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-8 flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        {backHref && (
          <Link
            href={backHref}
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-nb-on-surface-variant hover:text-nb-primary"
          >
            <ArrowLeft size={14} /> {backLabel}
          </Link>
        )}
        {eyebrow && (
          <p className="text-nb-label font-semibold text-nb-on-surface-variant">{eyebrow}</p>
        )}
        <h1 className="mt-1 text-nb-display font-bold tracking-tight text-nb-on-surface">{title}</h1>
        {description && (
          <div className="mt-1 text-sm text-nb-on-surface-variant">{description}</div>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
