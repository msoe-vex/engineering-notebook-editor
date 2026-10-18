"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
import { Button, EmptyState, ListRow } from "@/components/ui";
import { cloudApi } from "@/lib/cloud/api";
import type { ProjectPhase } from "@/lib/notebook/metadata";
import { getPhaseConfig, getPhases } from "@/lib/notebook/phases";
import { formatEntryListDate, getLocalDateString } from "@/lib/utils";

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
  const phases = (notebookSummary?.phases || null) as Record<string, ProjectPhase> | null;
  const phaseCfg = useMemo(
    () => getPhaseConfig(getPhases(phases || {})),
    [phases]
  );

  const recent = Object.entries(entries)
    .filter(([, e]) => !e.isTemplate && !e.deletedAt)
    .sort((a, b) => (b[1].updatedAt || b[1].date).localeCompare(a[1].updatedAt || a[1].date))
    .slice(0, 8);

  function createEntry() {
    showPrompt("New entry", "Untitled entry", (title) => {
      void cloudApi
        .createEntry(orgId, notebookId, {
          title,
          order: Object.keys(entries).length,
          date: getLocalDateString(),
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

      <section className="flex flex-col gap-3">
        <h2 className="text-nb-title font-semibold">Recent entries</h2>
        {recent.length > 0 ? (
          <div className="grid gap-2">
            {recent.map(([id, e]) => {
              const cfg = e.phase ? phaseCfg[e.phase] : null;
              const Icon = cfg?.icon || FileText;
              const phaseName = e.phase && phases?.[e.phase]?.name;
              return (
                <ListRow key={id} interactive>
                  <Link
                    href={`${basePath}/entries/${id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <span
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-nb-lg"
                      style={
                        cfg
                          ? {
                              backgroundColor: cfg.bg,
                              color: cfg.color,
                              border: `1px solid ${cfg.border}`,
                            }
                          : undefined
                      }
                    >
                      <Icon
                        size={16}
                        className={cfg ? undefined : "text-nb-on-surface-variant/55"}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-nb-on-surface">
                        {e.title || "Untitled"}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-nb-caption text-nb-on-surface-variant">
                        {e.date ? <span>{formatEntryListDate(e.date)}</span> : null}
                        {phaseName ? (
                          <span className="font-semibold" style={cfg ? { color: cfg.color } : undefined}>
                            {phaseName}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                </ListRow>
              );
            })}
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
