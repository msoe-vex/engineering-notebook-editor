"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Calendar, Plus, Users } from "lucide-react";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
import { Button, EmptyState, ListRow } from "@/components/ui";
import { cloudApi } from "@/lib/cloud/api";

/** Notebook overview — does not auto-jump to an entry. */
export default function NotebookOverviewPage() {
  const router = useRouter();
  const {
    orgId,
    notebookId,
    notebookName,
    notebookSummary,
    entries,
    refresh,
    setError,
    showPrompt,
  } = useNotebookWorkspace();
  const basePath = `/orgs/${orgId}/notebooks/${notebookId}`;

  const recent = Object.entries(entries)
    .filter(([, e]) => !e.isTemplate)
    .sort((a, b) => (b[1].updatedAt || b[1].date).localeCompare(a[1].updatedAt || a[1].date))
    .slice(0, 8);

  function createEntry() {
    showPrompt("New entry", "Untitled entry", (title) => {
      void cloudApi
        .createEntry(orgId, notebookId, {
          title,
          order: Object.keys(entries).length,
          date: new Date().toISOString().slice(0, 10),
        })
        .then((created) => {
          refresh();
          router.push(`${basePath}/entries/${created.id}`);
        })
        .catch((err) => setError((err as Error).message));
    });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-nb-display font-bold tracking-tight text-nb-on-surface">
            {notebookSummary?.title || notebookName}
          </h1>
          {notebookSummary?.subtitle && (
            <p className="mt-1 text-nb-body text-nb-on-surface-variant">
              {notebookSummary.subtitle}
            </p>
          )}
        </div>
        <Button variant="primary" onClick={createEntry}>
          <Plus size={16} /> New entry
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`${basePath}/schedule`}
          className="inline-flex items-center gap-1.5 rounded-nb-lg border border-nb-outline-variant/30 px-3 py-1.5 text-nb-label font-semibold text-nb-on-surface hover:bg-nb-surface-low"
        >
          <Calendar size={14} /> Schedule
        </Link>
        <Link
          href={`${basePath}/members`}
          className="inline-flex items-center gap-1.5 rounded-nb-lg border border-nb-outline-variant/30 px-3 py-1.5 text-nb-label font-semibold text-nb-on-surface hover:bg-nb-surface-low"
        >
          <Users size={14} /> Members
        </Link>
        <Link
          href={`${basePath}/setup`}
          className="inline-flex items-center gap-1.5 rounded-nb-lg border border-nb-outline-variant/30 px-3 py-1.5 text-nb-label font-semibold text-nb-on-surface hover:bg-nb-surface-low"
        >
          <BookOpen size={14} /> Setup
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-nb-title font-semibold">Recent entries</h2>
        {recent.length > 0 ? (
          <div className="grid gap-2">
            {recent.map(([id, e]) => (
              <ListRow key={id} interactive>
                <Link href={`${basePath}/entries/${id}`} className="min-w-0 flex-1">
                  <div className="font-semibold text-nb-on-surface">{e.title}</div>
                  <div className="text-nb-caption text-nb-on-surface-variant">{e.date}</div>
                </Link>
              </ListRow>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No entries yet"
            description="Create your first entry to start writing."
            action={
              <Button variant="primary" onClick={createEntry}>
                Create first entry
              </Button>
            }
          />
        )}
      </section>
    </div>
  );
}
