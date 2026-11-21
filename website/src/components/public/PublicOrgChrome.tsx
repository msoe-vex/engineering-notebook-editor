"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function PublicOrgChrome({
  slug,
  orgName,
  logoUrl,
  children,
  active,
}: {
  slug: string;
  orgName: string;
  logoUrl?: string | null;
  children: ReactNode;
  active?: "home" | "projects" | "events" | "members";
}) {
  const linkClass = (key: typeof active) =>
    `text-sm font-semibold transition-colors ${
      active === key ? "text-nb-primary" : "text-nb-on-surface hover:text-nb-primary"
    }`;

  return (
    <div className="min-h-screen bg-nb-surface text-nb-on-surface">
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-6">
        <Link href={`/o/${slug}`} className="flex min-w-0 items-center gap-3 hover:opacity-90">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded-nb-lg object-cover ring-1 ring-nb-outline-variant/40"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-nb-lg bg-nb-surface-low text-sm font-black text-nb-on-surface-variant">
              {orgName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-nb-label text-nb-on-surface-variant">Public org</p>
            <h1 className="truncate text-nb-display font-bold tracking-tight">{orgName}</h1>
          </div>
        </Link>
        <nav className="flex flex-wrap gap-4">
          <Link href={`/o/${slug}`} className={linkClass("home")}>
            Home
          </Link>
          <Link href={`/o/${slug}/projects`} className={linkClass("projects")}>
            Projects
          </Link>
          <Link href={`/o/${slug}/events`} className={linkClass("events")}>
            Events
          </Link>
          <Link href={`/o/${slug}/members`} className={linkClass("members")}>
            Members
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
