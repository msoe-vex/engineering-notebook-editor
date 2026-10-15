"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PanelLeftClose, PanelLeft, Plus, Search } from "lucide-react";
import { Button, IconButton } from "@/components/ui";
import { cloudApi } from "@/lib/cloud/api";
import { useNotebookWorkspace } from "./NotebookWorkspaceContext";

export function NotebookEntryList({
  activeEntryId,
  collapsed,
  onToggleCollapsed,
  basePath,
}: {
  activeEntryId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  basePath: string;
}) {
  const { orgId, notebookId, entries, refresh, setError, showPrompt } = useNotebookWorkspace();
  const [query, setQuery] = useState("");

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.entries(entries)
      .filter(([, e]) => !e.isTemplate)
      .filter(([, e]) => !q || e.title.toLowerCase().includes(q))
      .sort((a, b) => a[1].order - b[1].order || a[1].date.localeCompare(b[1].date));
  }, [entries, query]);

  if (collapsed) {
    return (
      <div className="flex w-10 shrink-0 flex-col items-center border-r border-nb-outline-variant/30 bg-nb-surface-low py-2">
        <IconButton aria-label="Expand entry list" onClick={onToggleCollapsed}>
          <PanelLeft size={16} />
        </IconButton>
      </div>
    );
  }

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-nb-outline-variant/30 bg-nb-surface-low md:w-[280px]">
      <div className="flex items-center gap-1 border-b border-nb-outline-variant/20 px-2 py-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-nb-on-surface-variant"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter entries"
            className="w-full rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface py-1.5 pr-2 pl-8 text-nb-label outline-none focus:border-nb-primary"
          />
        </div>
        <IconButton aria-label="Collapse entry list" onClick={onToggleCollapsed}>
          <PanelLeftClose size={16} />
        </IconButton>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="text-nb-label font-semibold text-nb-on-surface-variant">
          {sorted.length} entries
        </span>
        <Button
          size="sm"
          variant="primary"
          onClick={() =>
            showPrompt("New entry", "Untitled entry", (title) => {
              void cloudApi
                .createEntry(orgId, notebookId, {
                  title,
                  order: Object.keys(entries).length,
                  date: new Date().toISOString().slice(0, 10),
                })
                .then((created) => {
                  refresh();
                  window.location.href = `${basePath}/entries/${created.id}`;
                })
                .catch((err) => setError((err as Error).message));
            })
          }
        >
          <Plus size={14} /> New
        </Button>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {sorted.map(([id, e]) => (
          <Link
            key={id}
            href={`${basePath}/entries/${id}`}
            className={`mb-0.5 block rounded-nb-lg px-2.5 py-2 text-nb-body transition-colors ${
              activeEntryId === id
                ? "bg-nb-primary/10 font-semibold text-nb-primary"
                : "text-nb-on-surface hover:bg-nb-surface"
            }`}
          >
            <div className="truncate">{e.title || "Untitled"}</div>
            <div className="text-nb-caption text-nb-on-surface-variant">{e.date}</div>
          </Link>
        ))}
        {!sorted.length && (
          <p className="px-2 py-6 text-center text-nb-caption text-nb-on-surface-variant">
            No entries yet
          </p>
        )}
      </nav>
    </aside>
  );
}
