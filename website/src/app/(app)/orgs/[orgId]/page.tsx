"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Edit2, Plus, Trash2 } from "lucide-react";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import TextPromptDialog from "@/components/dialogs/TextPromptDialog";
import { useOrgWorkspace } from "@/components/cloud/OrgWorkspaceContext";
import { Button, DropdownMenu, EmptyState, ListRow, Skeleton } from "@/components/ui";
import { cloudApi } from "@/lib/cloud/api";

export default function OrgNotebooksPage() {
  const { orgId, notebooks, busy, setBusy, refresh, setError, initialLoaded } =
    useOrgWorkspace();
  const [createOpen, setCreateOpen] = useState(false);
  const [renameNb, setRenameNb] = useState<{ id: string; name: string } | null>(null);
  const [deleteNb, setDeleteNb] = useState<{ id: string; name: string } | null>(null);

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
          <ListRow key={nb.id} interactive>
            <Link
              href={`/orgs/${orgId}/notebooks/${nb.id}`}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-4"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-nb-tertiary/10 text-nb-tertiary transition-transform group-hover:scale-105">
                <BookOpen size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-bold text-nb-on-surface">
                  {nb.title || nb.name}
                </h3>
                <p className="mt-0.5 text-nb-caption text-nb-on-surface-variant">
                  {nb.subtitle || "Open notebook"}
                </p>
              </div>
              <ArrowRight
                size={16}
                className="shrink-0 text-nb-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100"
              />
            </Link>
            <DropdownMenu
              items={[
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
              ]}
            />
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

      <TextPromptDialog
        isOpen={createOpen}
        title="Create Notebook"
        label="Notebook name"
        initialValue="Competition Notebook"
        confirmLabel="Create"
        onCancel={() => setCreateOpen(false)}
        onConfirm={(name) => {
          setCreateOpen(false);
          setBusy(true);
          void cloudApi
            .createNotebook(orgId, name)
            .then(refresh)
            .catch((err) => setError((err as Error).message))
            .finally(() => setBusy(false));
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
        message={`Delete “${deleteNb?.name}”? This cannot be undone.`}
        confirmLabel="Delete"
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
    </div>
  );
}
