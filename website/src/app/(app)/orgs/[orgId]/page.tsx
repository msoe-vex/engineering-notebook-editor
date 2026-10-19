"use client";

import { useState, type MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Edit2, Plus, Settings, Share2, Trash2 } from "lucide-react";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import TextPromptDialog from "@/components/dialogs/TextPromptDialog";
import { useOrgWorkspace } from "@/components/cloud/OrgWorkspaceContext";
import { CreateNotebookDialog } from "@/components/cloud/CreateNotebookDialog";
import { ShareNotebookDialog } from "@/components/cloud/ShareNotebookDialog";
import {
  Button,
  ContextMenu,
  DropdownMenu,
  EmptyState,
  ListRow,
  Skeleton,
  type MenuItem,
} from "@/components/ui";
import { cloudApi, type NotebookSummary } from "@/lib/cloud/api";

export default function OrgNotebooksPage() {
  const router = useRouter();
  const { orgId, notebooks, teams, members, busy, canManage, setBusy, refresh, setError, initialLoaded } =
    useOrgWorkspace();
  const [createOpen, setCreateOpen] = useState(false);
  const [shareNb, setShareNb] = useState<NotebookSummary | null>(null);
  const [renameNb, setRenameNb] = useState<{ id: string; name: string } | null>(null);
  const [deleteNb, setDeleteNb] = useState<{ id: string; name: string } | null>(null);
  const [archiveNb, setArchiveNb] = useState<NotebookSummary | null>(null);
  const [unarchiveNb, setUnarchiveNb] = useState<NotebookSummary | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  function notebookMenuItems(nb: NotebookSummary): MenuItem[] {
    return [
      {
        id: "open",
        label: "Open",
        onSelect: () => router.push(`/orgs/${orgId}/notebooks/${nb.id}`),
      },
      ...(canManage
        ? [
            {
              id: "share",
              label: "Share…",
              icon: <Share2 size={14} />,
              onSelect: () => setShareNb(nb),
            },
            {
              id: "settings",
              label: "Settings",
              icon: <Settings size={14} />,
              onSelect: () => router.push(`/orgs/${orgId}/notebooks/${nb.id}/setup`),
            },
            {
              id: "archive",
              label: nb.archivedAt ? "Unarchive" : "Archive",
              onSelect: () => {
                if (nb.archivedAt) {
                  setUnarchiveNb(nb);
                } else {
                  setArchiveNb(nb);
                }
              },
            },
            { id: "sep", separator: true },
            {
              id: "rename",
              label: "Rename",
              icon: <Edit2 size={14} />,
              onSelect: () => setRenameNb(nb),
            },
            {
              id: "delete",
              label: "Delete",
              icon: <Trash2 size={14} />,
              danger: true,
              onSelect: () => setDeleteNb(nb),
            },
          ]
        : []),
    ];
  }

  function onNotebookContextMenu(
    e: ReactMouseEvent,
    nb: NotebookSummary
  ) {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, items: notebookMenuItems(nb) });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-nb-title font-semibold text-nb-on-surface">Notebooks</h2>
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={14} /> Create notebook
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {!initialLoaded &&
          Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-nb-xl border border-nb-outline-variant/20 p-3"
            >
              <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        {initialLoaded &&
          notebooks.map((nb) => (
          <ListRow
            key={nb.id}
            interactive
            onContextMenu={(e) => onNotebookContextMenu(e, nb)}
          >
            <Link
              href={`/orgs/${orgId}/notebooks/${nb.id}`}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-4"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-nb-tertiary/10 text-nb-tertiary transition-transform group-hover:scale-105">
                <BookOpen size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-bold text-nb-on-surface">
                    {nb.title || nb.name}
                  </h3>
                  {nb.archivedAt && (
                    <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                      Archived
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-nb-caption text-nb-on-surface-variant">
                  {nb.subtitle || "Open notebook"}
                </p>
              </div>
              <ArrowRight
                size={16}
                className="shrink-0 text-nb-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100"
              />
            </Link>
            <DropdownMenu items={notebookMenuItems(nb)} />
          </ListRow>
        ))}
        {initialLoaded && !notebooks.length && (
          <EmptyState
            title="No notebooks yet"
            description="Create a notebook to open the editor workspace."
            action={
              <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
                Create notebook
              </Button>
            }
          />
        )}
      </div>

      <CreateNotebookDialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        orgId={orgId}
        teams={teams}
        members={members}
        onCreated={() => {
          refresh();
        }}
      />

      <ShareNotebookDialog
        open={Boolean(shareNb)}
        onClose={() => setShareNb(null)}
        orgId={orgId}
        notebookId={shareNb?.id}
        notebookName={shareNb?.title || shareNb?.name}
        initialAccess={shareNb?.access}
        teams={teams}
        people={members}
        onSaved={() => {
          refresh();
        }}
      />

      <TextPromptDialog
        isOpen={Boolean(renameNb)}
        title="Rename Notebook"
        label="Notebook name"
        initialValue={renameNb?.name || ""}
        confirmLabel="Save"
        onCancel={() => setRenameNb(null)}
        onConfirm={(name) => {
          const id = renameNb?.id;
          setRenameNb(null);
          if (!id) return;
          void cloudApi
            .patchNotebook(orgId, id, { name })
            .then(refresh)
            .catch((err) => setError((err as Error).message));
        }}
      />

      <ConfirmationDialog
        isOpen={Boolean(deleteNb)}
        title="Delete Notebook?"
        message={`Delete “${deleteNb?.name}”? All entries, assets, and history will be permanently destroyed. This cannot be undone.`}
        confirmLabel="Delete notebook"
        confirmText={deleteNb?.name}
        variant="danger"
        onCancel={() => setDeleteNb(null)}
        onConfirm={() => {
          const id = deleteNb?.id;
          setDeleteNb(null);
          if (!id) return;
          void cloudApi
            .deleteNotebook(orgId, id)
            .then(refresh)
            .catch((err) => setError((err as Error).message));
        }}
      />

      <ConfirmationDialog
        isOpen={Boolean(archiveNb)}
        title="Archive Notebook?"
        message={`Archive “${archiveNb?.name}”? It will become read-only and no further entries or edits will be permitted until it is unarchived.`}
        confirmLabel="Archive notebook"
        confirmText={archiveNb?.name}
        variant="warning"
        onCancel={() => setArchiveNb(null)}
        onConfirm={() => {
          const id = archiveNb?.id;
          setArchiveNb(null);
          if (!id) return;
          void cloudApi
            .archiveNotebook(orgId, id)
            .then(refresh)
            .catch((err) => setError((err as Error).message));
        }}
      />

      <ConfirmationDialog
        isOpen={Boolean(unarchiveNb)}
        title="Unarchive Notebook?"
        message={`Unarchive “${unarchiveNb?.name}”? Write access will be restored for members.`}
        confirmLabel="Unarchive notebook"
        variant="info"
        onCancel={() => setUnarchiveNb(null)}
        onConfirm={() => {
          const id = unarchiveNb?.id;
          setUnarchiveNb(null);
          if (!id) return;
          void cloudApi
            .unarchiveNotebook(orgId, id)
            .then(refresh)
            .catch((err) => setError((err as Error).message));
        }}
      />

      <ContextMenu
        open={Boolean(ctx)}
        x={ctx?.x ?? 0}
        y={ctx?.y ?? 0}
        items={ctx?.items ?? []}
        onClose={() => setCtx(null)}
      />
    </div>
  );
}
