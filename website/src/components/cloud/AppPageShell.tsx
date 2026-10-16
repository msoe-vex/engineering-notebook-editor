"use client";

import type { ReactNode } from "react";

/** Consistent content frame under AppChrome for non-notebook pages. */
export function AppPageShell({
  title,
  description,
  children,
  sidebar,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  sidebar?: ReactNode;
}) {
  return (
    <div className="font-sans">
      {(title || description) && (
        <div className="mb-6">
          {title && (
            <h1 className="text-nb-display font-bold tracking-tight text-nb-on-surface">{title}</h1>
          )}
          {description && (
            <p className="mt-1 text-nb-body text-nb-on-surface-variant">{description}</p>
          )}
        </div>
      )}
      {sidebar ? (
        <div className="flex min-h-[420px] flex-col gap-6 md:flex-row md:gap-8">
          <aside className="w-full shrink-0 md:w-48">{sidebar}</aside>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
