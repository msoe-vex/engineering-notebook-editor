"use client";

import { useEffect, useState } from "react";
import { Plus, UserRound } from "lucide-react";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import TextPromptDialog from "@/components/dialogs/TextPromptDialog";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
import { Button, EmptyState, ListRow } from "@/components/ui";
import { cloudApi, type NotebookMemberSummary } from "@/lib/cloud/api";

export default function NotebookMembersPage() {
  const { orgId, notebookId, setError } = useNotebookWorkspace();
  const [members, setMembers] = useState<NotebookMemberSummary[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editMember, setEditMember] = useState<NotebookMemberSummary | null>(null);
  const [deleteMember, setDeleteMember] = useState<NotebookMemberSummary | null>(null);

  function load() {
    void cloudApi
      .listNotebookMembers(orgId, notebookId)
      .then(setMembers)
      .catch((err) => setError((err as Error).message));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, notebookId]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-nb-display font-bold tracking-tight">Members</h1>
          <p className="mt-1 text-nb-body text-nb-on-surface-variant">
            Contributors listed in this notebook. They do not need an app account.
          </p>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)}>
          <Plus size={14} /> Add member
        </Button>
      </div>

      {members.length > 0 ? (
        <div className="grid gap-2">
          {members
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((m) => (
              <ListRow key={m.id}>
                <div className="flex h-10 w-10 items-center justify-center rounded-nb-lg bg-nb-surface-low text-nb-on-surface-variant">
                  <UserRound size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-nb-on-surface">{m.name}</div>
                  <div className="text-nb-caption text-nb-on-surface-variant">{m.role}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEditMember(m)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="link"
                  className="text-nb-danger"
                  onClick={() => setDeleteMember(m)}
                >
                  Remove
                </Button>
              </ListRow>
            ))}
        </div>
      ) : (
        <EmptyState
          title="No members yet"
          description="Add people who should appear as contributors in this notebook."
          action={
            <Button variant="primary" onClick={() => setAddOpen(true)}>
              Add member
            </Button>
          }
        />
      )}

      <TextPromptDialog
        isOpen={addOpen}
        title="Add member"
        label="Name"
        initialValue=""
        confirmLabel="Add"
        onCancel={() => setAddOpen(false)}
        onConfirm={(name) => {
          setAddOpen(false);
          void cloudApi
            .createNotebookMember(orgId, notebookId, {
              name,
              role: "Member",
              order: members.length,
            })
            .then(load)
            .catch((err) => setError((err as Error).message));
        }}
      />

      <TextPromptDialog
        isOpen={Boolean(editMember)}
        title="Edit member"
        label="Name"
        initialValue={editMember?.name || ""}
        confirmLabel="Save"
        onCancel={() => setEditMember(null)}
        onConfirm={(name) => {
          const id = editMember?.id;
          setEditMember(null);
          if (!id) return;
          void cloudApi
            .patchNotebookMember(orgId, notebookId, id, { name })
            .then(load)
            .catch((err) => setError((err as Error).message));
        }}
      />

      <ConfirmationDialog
        isOpen={Boolean(deleteMember)}
        title="Remove member?"
        message={`Remove ${deleteMember?.name} from this notebook roster?`}
        confirmLabel="Remove"
        variant="danger"
        onCancel={() => setDeleteMember(null)}
        onConfirm={() => {
          const id = deleteMember?.id;
          setDeleteMember(null);
          if (!id) return;
          void cloudApi
            .deleteNotebookMember(orgId, notebookId, id)
            .then(load)
            .catch((err) => setError((err as Error).message));
        }}
      />
    </div>
  );
}
