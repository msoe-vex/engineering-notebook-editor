"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
import { isEntryTrashed } from "@/components/cloud/notebook-types";
import { Button, EmptyState } from "@/components/ui";
import { showNotification } from "@/components/overlays/Notification";
import { cloudApi, type RubricRecord } from "@/lib/cloud/api";
import { formatEntryListDate } from "@/lib/utils";

export default function NotebookTrashPage() {
  const router = useRouter();
  const {
    orgId,
    notebookId,
    entries,
    folders,
    refresh,
    setEntries,
    setError,
  } = useNotebookWorkspace();
  const basePath = `/orgs/${orgId}/notebooks/${notebookId}`;
  const [purgeId, setPurgeId] = useState<string | null>(null);
  const [purgeRubricId, setPurgeRubricId] = useState<string | null>(null);
  const [emptyOpen, setEmptyOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [trashedRubrics, setTrashedRubrics] = useState<RubricRecord[]>([]);

  const trashed = useMemo(
    () =>
      Object.entries(entries)
        .filter(([, e]) => isEntryTrashed(e))
        .sort((a, b) =>
          String(b[1].deletedAt || "").localeCompare(String(a[1].deletedAt || ""))
        ),
    [entries]
  );

  const refreshRubrics = useCallback(() => {
    return cloudApi
      .listRubrics(orgId, notebookId, { trashed: true })
      .then(setTrashedRubrics)
      .catch((err) => setError((err as Error).message));
  }, [orgId, notebookId, setError]);

  useEffect(() => {
    void refreshRubrics();
  }, [refreshRubrics]);

  const totalCount = trashed.length + trashedRubrics.length;

  function folderLabel(folderId: string | null | undefined) {
    if (!folderId) return "Root";
    return folders[folderId]?.name || "Root";
  }

  function restoreOne(id: string) {
    setBusy(true);
    setEntries?.((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      return { ...prev, [id]: { ...cur, deletedAt: null } };
    });
    void cloudApi
      .restoreEntry(orgId, notebookId, id)
      .then(() => {
        refresh();
        showNotification("Entry restored", "success");
      })
      .catch((err) => {
        setError((err as Error).message);
        refresh();
      })
      .finally(() => setBusy(false));
  }

  function restoreRubric(id: string) {
    setBusy(true);
    void cloudApi
      .restoreRubric(orgId, notebookId, id)
      .then(() => {
        void refreshRubrics();
        showNotification("Rubric restored", "success", {
          action: {
            label: "Open Judge",
            onClick: () => router.push(`${basePath}/judge/rubrics`),
          },
        });
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setBusy(false));
  }

  function purgeOne(id: string) {
    setBusy(true);
    setEntries?.((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    void cloudApi
      .purgeEntry(orgId, notebookId, id)
      .then(() => {
        refresh();
        showNotification("Entry permanently deleted", "success");
      })
      .catch((err) => {
        setError((err as Error).message);
        refresh();
      })
      .finally(() => setBusy(false));
  }

  function purgeRubric(id: string) {
    setBusy(true);
    void cloudApi
      .purgeRubric(orgId, notebookId, id)
      .then(() => {
        void refreshRubrics();
        showNotification("Rubric permanently deleted", "success");
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setBusy(false));
  }

  function emptyTrash() {
    const entryIds = trashed.map(([id]) => id);
    const rubricIds = trashedRubrics.map((r) => r.id);
    if (!entryIds.length && !rubricIds.length) return;
    setBusy(true);
    setEntries?.((prev) => {
      const next = { ...prev };
      for (const id of entryIds) delete next[id];
      return next;
    });
    void Promise.all([
      ...entryIds.map((id) => cloudApi.purgeEntry(orgId, notebookId, id)),
      ...rubricIds.map((id) => cloudApi.purgeRubric(orgId, notebookId, id)),
    ])
      .then(() => {
        refresh();
        void refreshRubrics();
        showNotification("Trash emptied", "success");
      })
      .catch((err) => {
        setError((err as Error).message);
        refresh();
        void refreshRubrics();
      })
      .finally(() => setBusy(false));
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-nb-title font-semibold text-nb-on-surface">Trash</h1>
          <p className="mt-1 text-nb-body text-nb-on-surface-variant">
            Deleted entries and rubrics stay here until you restore them or delete them
            forever.
          </p>
        </div>
        {totalCount > 0 && (
          <Button
            size="sm"
            variant="danger"
            disabled={busy}
            onClick={() => setEmptyOpen(true)}
          >
            <Trash2 size={14} /> Empty trash
          </Button>
        )}
      </div>

      {totalCount > 0 ? (
        <ul className="divide-y divide-nb-outline-variant/20 overflow-hidden rounded-nb-xl border border-nb-outline-variant/30 bg-nb-surface">
          {trashed.map(([id, e]) => (
            <li
              key={`entry-${id}`}
              className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-nb-body"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-nb-on-surface">
                  {e.title || "Untitled"}
                  {e.isTemplate ? (
                    <span className="ml-2 text-nb-caption font-normal text-nb-on-surface-variant">
                      Template
                    </span>
                  ) : (
                    <span className="ml-2 text-nb-caption font-normal text-nb-on-surface-variant">
                      Entry
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-nb-caption text-nb-on-surface-variant">
                  {folderLabel(e.folderId)}
                  {e.deletedAt
                    ? ` · Deleted ${formatEntryListDate(e.deletedAt.slice(0, 10))}`
                    : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => restoreOne(id)}
                >
                  <RotateCcw size={14} /> Restore
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="text-nb-danger"
                  disabled={busy}
                  onClick={() => setPurgeId(id)}
                >
                  Delete forever
                </Button>
              </div>
            </li>
          ))}
          {trashedRubrics.map((r) => (
            <li
              key={`rubric-${r.id}`}
              className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-nb-body"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-nb-on-surface">
                  {r.name || "Untitled rubric"}
                  <span className="ml-2 text-nb-caption font-normal text-nb-on-surface-variant">
                    Rubric
                  </span>
                </div>
                <div className="mt-0.5 text-nb-caption text-nb-on-surface-variant">
                  {r.matrix
                    ? `${r.matrix.categories.length} criteria · ${r.matrix.totalMaxPoints} pts`
                    : r.status || "—"}
                  {r.deletedAt
                    ? ` · Deleted ${formatEntryListDate(r.deletedAt.slice(0, 10))}`
                    : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => restoreRubric(r.id)}
                >
                  <RotateCcw size={14} /> Restore
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="text-nb-danger"
                  disabled={busy}
                  onClick={() => setPurgeRubricId(r.id)}
                >
                  Delete forever
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="Trash is empty"
          description="Entries and rubrics you delete appear here."
          action={
            <Button size="sm" variant="secondary" onClick={() => router.push(basePath)}>
              Back to entries
            </Button>
          }
        />
      )}

      <ConfirmationDialog
        isOpen={Boolean(purgeId)}
        title="Delete forever?"
        message="This permanently removes the entry and its content. This cannot be undone."
        confirmLabel="Delete forever"
        variant="danger"
        onCancel={() => setPurgeId(null)}
        onConfirm={() => {
          const id = purgeId;
          setPurgeId(null);
          if (id) purgeOne(id);
        }}
      />

      <ConfirmationDialog
        isOpen={Boolean(purgeRubricId)}
        title="Delete rubric forever?"
        message="This permanently removes the rubric and its source file. Past grades are kept. This cannot be undone."
        confirmLabel="Delete forever"
        variant="danger"
        onCancel={() => setPurgeRubricId(null)}
        onConfirm={() => {
          const id = purgeRubricId;
          setPurgeRubricId(null);
          if (id) purgeRubric(id);
        }}
      />

      <ConfirmationDialog
        isOpen={emptyOpen}
        title="Empty trash?"
        message={`Permanently delete ${totalCount} ${
          totalCount === 1 ? "item" : "items"
        }? This cannot be undone.`}
        confirmLabel="Empty trash"
        variant="danger"
        onCancel={() => setEmptyOpen(false)}
        onConfirm={() => {
          setEmptyOpen(false);
          emptyTrash();
        }}
      />
    </div>
  );
}
