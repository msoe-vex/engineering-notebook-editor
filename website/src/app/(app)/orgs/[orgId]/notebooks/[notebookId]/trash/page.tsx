"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
import { isEntryTrashed } from "@/components/cloud/notebook-types";
import { Button, EmptyState } from "@/components/ui";
import { showNotification } from "@/components/overlays/Notification";
import { cloudApi } from "@/lib/cloud/api";
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
  const [emptyOpen, setEmptyOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const trashed = useMemo(
    () =>
      Object.entries(entries)
        .filter(([, e]) => isEntryTrashed(e))
        .sort((a, b) =>
          String(b[1].deletedAt || "").localeCompare(String(a[1].deletedAt || ""))
        ),
    [entries]
  );

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

  function emptyTrash() {
    const ids = trashed.map(([id]) => id);
    if (!ids.length) return;
    setBusy(true);
    setEntries?.((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
    void Promise.all(ids.map((id) => cloudApi.purgeEntry(orgId, notebookId, id)))
      .then(() => {
        refresh();
        showNotification("Trash emptied", "success");
      })
      .catch((err) => {
        setError((err as Error).message);
        refresh();
      })
      .finally(() => setBusy(false));
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-nb-title font-semibold text-nb-on-surface">Trash</h1>
          <p className="mt-1 text-nb-body text-nb-on-surface-variant">
            Deleted entries stay here until you restore them or delete them forever.
          </p>
        </div>
        {trashed.length > 0 && (
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

      {trashed.length > 0 ? (
        <ul className="divide-y divide-nb-outline-variant/20 overflow-hidden rounded-nb-xl border border-nb-outline-variant/30 bg-nb-surface">
          {trashed.map(([id, e]) => (
            <li
              key={id}
              className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-nb-body"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-nb-on-surface">
                  {e.title || "Untitled"}
                  {e.isTemplate ? (
                    <span className="ml-2 text-nb-caption font-normal text-nb-on-surface-variant">
                      Template
                    </span>
                  ) : null}
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
                  variant="ghost"
                  className="text-nb-danger"
                  disabled={busy}
                  onClick={() => setPurgeId(id)}
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
          description="Entries you delete from the explorer appear here."
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
        isOpen={emptyOpen}
        title="Empty trash?"
        message={`Permanently delete ${trashed.length} ${
          trashed.length === 1 ? "entry" : "entries"
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
