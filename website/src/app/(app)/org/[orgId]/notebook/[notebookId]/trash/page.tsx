"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import type { ProjectPhase } from "@engineering-notebook/shared";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
import { isEntryTrashed } from "@/components/cloud/notebook-types";
import { Button, EmptyState } from "@/components/ui";
import { showNotification } from "@/components/overlays/Notification";
import {
  cloudApi,
  type NotebookMemberSummary,
  type RubricRecord,
} from "@/lib/cloud/api";
import { formatEntryListDate } from "@/lib/utils";

export default function NotebookTrashPage() {
  const router = useRouter();
  const {
    orgId,
    notebookId,
    entries,
    folders,
    notebookSummary,
    isArchived,
    refresh,
    setEntries,
    setError,
  } = useNotebookWorkspace();
  const basePath = `/org/${orgId}/notebook/${notebookId}`;
  const [purgeId, setPurgeId] = useState<string | null>(null);
  const [purgeRubricId, setPurgeRubricId] = useState<string | null>(null);
  const [purgeMemberId, setPurgeMemberId] = useState<string | null>(null);
  const [purgePhaseId, setPurgePhaseId] = useState<string | null>(null);
  const [emptyOpen, setEmptyOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [trashedRubrics, setTrashedRubrics] = useState<RubricRecord[]>([]);
  const [trashedMembers, setTrashedMembers] = useState<NotebookMemberSummary[]>([]);

  const trashed = useMemo(
    () =>
      Object.entries(entries)
        .filter(([, e]) => isEntryTrashed(e))
        .sort((a, b) =>
          String(b[1].deletedAt || "").localeCompare(String(a[1].deletedAt || ""))
        ),
    [entries]
  );

  const trashedPhases = useMemo(() => {
    const phases = (notebookSummary?.phases || {}) as Record<string, ProjectPhase>;
    return Object.entries(phases)
      .filter(([, p]) => Boolean(p.deletedAt))
      .sort((a, b) =>
        String(b[1].deletedAt || "").localeCompare(String(a[1].deletedAt || ""))
      );
  }, [notebookSummary?.phases]);

  const refreshRubrics = useCallback(() => {
    return cloudApi
      .listRubrics(orgId, notebookId, { trashed: true })
      .then(setTrashedRubrics)
      .catch((err) => setError((err as Error).message));
  }, [orgId, notebookId, setError]);

  const refreshMembers = useCallback(() => {
    return cloudApi
      .listNotebookMembers(orgId, notebookId, { trashed: true })
      .then(setTrashedMembers)
      .catch((err) => setError((err as Error).message));
  }, [orgId, notebookId, setError]);

  useEffect(() => {
    void refreshRubrics();
    void refreshMembers();
  }, [refreshRubrics, refreshMembers]);

  const totalCount =
    trashed.length + trashedRubrics.length + trashedMembers.length + trashedPhases.length;

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
            onClick: () => router.push(`${basePath}/judge/rubric`),
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

  function restoreMember(id: string) {
    setBusy(true);
    void cloudApi
      .restoreNotebookMember(orgId, notebookId, id)
      .then(() => {
        void refreshMembers();
        showNotification("Contributor restored", "success");
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setBusy(false));
  }

  function purgeMember(id: string) {
    setBusy(true);
    void cloudApi
      .purgeNotebookMember(orgId, notebookId, id)
      .then(() => {
        void refreshMembers();
        showNotification("Contributor permanently deleted", "success");
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setBusy(false));
  }

  function restorePhase(id: string) {
    const phases = { ...((notebookSummary?.phases || {}) as Record<string, ProjectPhase>) };
    const cur = phases[id];
    if (!cur) return;
    setBusy(true);
    phases[id] = { ...cur, deletedAt: null };
    void cloudApi
      .patchNotebook(orgId, notebookId, { phases })
      .then(() => {
        refresh();
        showNotification("Phase restored", "success");
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setBusy(false));
  }

  function purgePhase(id: string) {
    const phases = { ...((notebookSummary?.phases || {}) as Record<string, ProjectPhase>) };
    if (!(id in phases)) return;
    setBusy(true);
    delete phases[id];
    void cloudApi
      .patchNotebook(orgId, notebookId, { phases })
      .then(() => {
        refresh();
        showNotification("Phase permanently deleted", "success");
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setBusy(false));
  }

  function emptyTrash() {
    const entryIds = trashed.map(([id]) => id);
    const rubricIds = trashedRubrics.map((r) => r.id);
    const memberIds = trashedMembers.map((m) => m.id);
    const phaseIds = trashedPhases.map(([id]) => id);
    if (!entryIds.length && !rubricIds.length && !memberIds.length && !phaseIds.length) {
      return;
    }
    setBusy(true);
    setEntries?.((prev) => {
      const next = { ...prev };
      for (const id of entryIds) delete next[id];
      return next;
    });
    const phases = { ...((notebookSummary?.phases || {}) as Record<string, ProjectPhase>) };
    for (const id of phaseIds) delete phases[id];
    void Promise.all([
      ...entryIds.map((id) => cloudApi.purgeEntry(orgId, notebookId, id)),
      ...rubricIds.map((id) => cloudApi.purgeRubric(orgId, notebookId, id)),
      ...memberIds.map((id) => cloudApi.purgeNotebookMember(orgId, notebookId, id)),
      phaseIds.length
        ? cloudApi.patchNotebook(orgId, notebookId, { phases })
        : Promise.resolve(null),
    ])
      .then(() => {
        refresh();
        void refreshRubrics();
        void refreshMembers();
        showNotification("Trash emptied", "success");
      })
      .catch((err) => {
        setError((err as Error).message);
        refresh();
        void refreshRubrics();
        void refreshMembers();
      })
      .finally(() => setBusy(false));
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6">
      {isArchived && (
        <div className="rounded-nb-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-medium text-amber-900 dark:text-amber-200">
          <strong>This notebook is archived.</strong> Trashed entries and rubrics cannot be restored or permanently deleted.
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-nb-title font-semibold text-nb-on-surface">Trash</h1>
          <p className="mt-1 text-nb-body text-nb-on-surface-variant">
            Deleted entries, rubrics, contributors, and phases stay here until you restore
            them or delete them forever.
          </p>
        </div>
        {totalCount > 0 && !isArchived && (
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
                  disabled={busy || isArchived}
                  onClick={() => restoreOne(id)}
                >
                  <RotateCcw size={14} /> Restore
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="text-nb-danger"
                  disabled={busy || isArchived}
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
                  disabled={busy || isArchived}
                  onClick={() => restoreRubric(r.id)}
                >
                  <RotateCcw size={14} /> Restore
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="text-nb-danger"
                  disabled={busy || isArchived}
                  onClick={() => setPurgeRubricId(r.id)}
                >
                  Delete forever
                </Button>
              </div>
            </li>
          ))}
          {trashedMembers.map((m) => (
            <li
              key={`member-${m.id}`}
              className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-nb-body"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-nb-on-surface">
                  {m.name || "Contributor"}
                  <span className="ml-2 text-nb-caption font-normal text-nb-on-surface-variant">
                    Contributor
                  </span>
                </div>
                <div className="mt-0.5 text-nb-caption text-nb-on-surface-variant">
                  {m.role || "—"}
                  {m.deletedAt
                    ? ` · Deleted ${formatEntryListDate(m.deletedAt.slice(0, 10))}`
                    : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || isArchived}
                  onClick={() => restoreMember(m.id)}
                >
                  <RotateCcw size={14} /> Restore
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="text-nb-danger"
                  disabled={busy || isArchived}
                  onClick={() => setPurgeMemberId(m.id)}
                >
                  Delete forever
                </Button>
              </div>
            </li>
          ))}
          {trashedPhases.map(([id, p]) => (
            <li
              key={`phase-${id}`}
              className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-nb-body"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-nb-on-surface">
                  {p.name || "Phase"}
                  <span className="ml-2 text-nb-caption font-normal text-nb-on-surface-variant">
                    Phase
                  </span>
                </div>
                <div className="mt-0.5 text-nb-caption text-nb-on-surface-variant">
                  {p.deletedAt
                    ? `Deleted ${formatEntryListDate(String(p.deletedAt).slice(0, 10))}`
                    : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || isArchived}
                  onClick={() => restorePhase(id)}
                >
                  <RotateCcw size={14} /> Restore
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="text-nb-danger"
                  disabled={busy || isArchived}
                  onClick={() => setPurgePhaseId(id)}
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
          description="Entries, rubrics, contributors, and phases you delete appear here."
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
        isOpen={Boolean(purgeMemberId)}
        title="Delete contributor forever?"
        message="This permanently removes the contributor from the notebook roster."
        confirmLabel="Delete forever"
        variant="danger"
        onCancel={() => setPurgeMemberId(null)}
        onConfirm={() => {
          const id = purgeMemberId;
          setPurgeMemberId(null);
          if (id) purgeMember(id);
        }}
      />

      <ConfirmationDialog
        isOpen={Boolean(purgePhaseId)}
        title="Delete phase forever?"
        message="Entries that still reference this phase will keep the id until you change them. This cannot be undone."
        confirmLabel="Delete forever"
        variant="danger"
        onCancel={() => setPurgePhaseId(null)}
        onConfirm={() => {
          const id = purgePhaseId;
          setPurgePhaseId(null);
          if (id) purgePhase(id);
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
