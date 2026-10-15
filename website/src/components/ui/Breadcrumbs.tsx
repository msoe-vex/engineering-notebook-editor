"use client";

import Link from "next/link";
import { cn } from "./cn";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex flex-wrap items-center gap-1.5 text-nb-label font-medium text-nb-on-surface-variant",
        className
      )}
    >
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex items-center gap-1.5">
          {i > 0 && <span className="opacity-40">/</span>}
          {item.href ? (
            <Link href={item.href} className="hover:text-nb-primary truncate max-w-[12rem] normal-case">
              {item.label}
            </Link>
          ) : (
            <span className="truncate max-w-[14rem] normal-case text-nb-on-surface">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
