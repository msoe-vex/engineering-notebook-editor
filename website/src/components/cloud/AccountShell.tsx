"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Settings2, UserRound } from "lucide-react";

const NAV = [
  { href: "/account", label: "Profile", icon: UserRound, exact: true },
  { href: "/account/preferences", label: "Preferences", icon: Settings2, exact: false },
] as const;

/** Full-bleed account layout under AppChrome (sidebar + content). */
export function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const onPreferences = pathname?.startsWith("/account/preferences");

  return (
    <div className="flex h-full min-h-0 w-full flex-col font-sans md:flex-row overflow-hidden">
      <aside className="shrink-0 border-b border-nb-outline-variant/30 bg-nb-surface-low px-4 py-4 sm:px-6 md:w-60 md:border-b-0 md:border-r md:p-6 overflow-y-auto custom-scrollbar">
        <div className="mb-4 hidden md:block">
          <h1 className="text-nb-title font-bold tracking-tight text-nb-on-surface">Account</h1>
          <p className="mt-1 text-nb-caption text-nb-on-surface-variant">
            Profile and preferences
          </p>
        </div>
        <nav className="flex flex-row gap-1 md:flex-col">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === "/account" || pathname === "/account/"
              : onPreferences;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-2 rounded-nb-lg px-3 py-2 text-nb-label font-semibold transition-colors ${
                  active
                    ? "bg-nb-primary/10 text-nb-primary"
                    : "text-nb-on-surface-variant hover:bg-nb-surface hover:text-nb-on-surface"
                }`}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto custom-scrollbar bg-nb-surface p-6 sm:p-8 md:p-10 lg:p-12">
        <div className="mx-auto w-full max-w-4xl">{children}</div>
      </div>
    </div>
  );
}
