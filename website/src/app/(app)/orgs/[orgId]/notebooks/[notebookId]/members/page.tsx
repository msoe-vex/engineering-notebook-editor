"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Camera, GripVertical, Plus, UserRound } from "lucide-react";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
import { showNotification } from "@/components/overlays/Notification";
import { Button, EmptyState, TextField } from "@/components/ui";
import { Dialog } from "@/components/ui/Dialog";
import { cloudApi, type MemberSummary, type NotebookMemberSummary } from "@/lib/cloud/api";
import { useAppDndSensors } from "@/lib/dnd/dndSensors";

function SortableMember({
  member,
  photoUrl,
  onEdit,
  onRemove,
  onPhoto,
}: {
  member: NotebookMemberSummary;
  photoUrl?: string;
  onEdit: () => void;
  onRemove: () => void;
  onPhoto: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: member.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
      }}
      className="flex items-center gap-2 rounded-nb-xl border border-nb-outline-variant/25 bg-nb-surface px-2 py-2"
    >
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none p-1 text-nb-on-surface-variant/40 hover:text-nb-on-surface-variant active:cursor-grabbing"
        title="Drag to reorder"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
      <button
        type="button"
        onClick={onPhoto}
        className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-nb-lg bg-nb-surface-low text-nb-on-surface-variant"
        title="Upload photo"
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <UserRound size={18} />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity hover:bg-black/35 hover:opacity-100">
          <Camera size={14} className="text-white" />
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-nb-on-surface">{member.name}</div>
        <div className="truncate text-nb-caption text-nb-on-surface-variant">
          {member.role || "Member"}
          {member.linkedUid ? " · linked account" : ""}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="ghost" onClick={onEdit}>
          Edit
        </Button>
        <Button size="sm" variant="link" className="text-nb-danger" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </div>
  );
}

export default function NotebookMembersPage() {
  const { orgId, notebookId, setError } = useNotebookWorkspace();
  const [members, setMembers] = useState<NotebookMemberSummary[]>([]);
  const [orgPeople, setOrgPeople] = useState<MemberSummary[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [editor, setEditor] = useState<Partial<NotebookMemberSummary> & { id?: string } | null>(
    null
  );
  const [deleteMember, setDeleteMember] = useState<NotebookMemberSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoTargetRef = useRef<string | null>(null);
  const sensors = useAppDndSensors();

  function load() {
    void cloudApi
      .listNotebookMembers(orgId, notebookId)
      .then(setMembers)
      .catch((err) => setError((err as Error).message));
  }

  useEffect(() => {
    load();
    void cloudApi.listMembers(orgId).then(setOrgPeople).catch(() => setOrgPeople([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, notebookId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        members.map(async (m) => {
          if (!m.imageAssetId) return;
          try {
            const { url } = await cloudApi.getAssetUrl(orgId, notebookId, m.imageAssetId);
            next[m.id] = url;
          } catch {
            /* ignore */
          }
        })
      );
      if (!cancelled) setPhotos(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [members, orgId, notebookId]);

  const sorted = members.slice().sort((a, b) => a.order - b.order);

  async function persistOrder(ordered: NotebookMemberSummary[]) {
    setMembers(ordered.map((m, i) => ({ ...m, order: i })));
    try {
      await Promise.all(
        ordered.map((m, i) =>
          cloudApi.patchNotebookMember(orgId, notebookId, m.id, { order: i })
        )
      );
    } catch (err) {
      setError((err as Error).message);
      load();
    }
  }

  function onDragEnd(event: DragEndEvent) {
    if (!event.over) return;
    const from = sorted.findIndex((m) => m.id === event.active.id);
    const to = sorted.findIndex((m) => m.id === event.over?.id);
    if (from < 0 || to < 0 || from === to) return;
    void persistOrder(arrayMove(sorted, from, to));
  }

  async function saveEditor() {
    if (!editor?.name?.trim()) return;
    setBusy(true);
    try {
      if (editor.id) {
        await cloudApi.patchNotebookMember(orgId, notebookId, editor.id, {
          name: editor.name.trim(),
          role: editor.role || "Member",
          linkedUid: editor.linkedUid || undefined,
        });
      } else {
        await cloudApi.createNotebookMember(orgId, notebookId, {
          name: editor.name.trim(),
          role: editor.role || "Member",
          order: members.length,
          linkedUid: editor.linkedUid || undefined,
        });
      }
      setEditor(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(memberId: string, file: File) {
    setBusy(true);
    try {
      const { asset } = await cloudApi.createAsset(orgId, notebookId, {
        contentType: file.type || "image/jpeg",
        byteSize: file.size,
      });
      await cloudApi.uploadAssetContent(
        orgId,
        notebookId,
        asset.id,
        file,
        file.type || "image/jpeg"
      );
      await cloudApi.patchNotebookMember(orgId, notebookId, memberId, {
        imageAssetId: asset.id,
      });
      load();
      showNotification("Photo uploaded", "success");
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      showNotification(message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-nb-display font-bold tracking-tight">Contributors</h1>
          <p className="mt-1 text-nb-body text-nb-on-surface-variant">
            Credits for this notebook (export / LaTeX). Separate from org access — manage who can
            open the notebook under Settings.
          </p>
        </div>
        <Button variant="primary" onClick={() => setEditor({ name: "", role: "Member" })}>
          <Plus size={14} /> Add person
        </Button>
      </div>

      {sorted.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={sorted.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            <div className="grid gap-2">
              {sorted.map((m) => (
                <SortableMember
                  key={m.id}
                  member={m}
                  photoUrl={photos[m.id]}
                  onEdit={() => setEditor({ ...m })}
                  onRemove={() => setDeleteMember(m)}
                  onPhoto={() => {
                    photoTargetRef.current = m.id;
                    photoInputRef.current?.click();
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <EmptyState
          title="No roster yet"
          description="Add contributors who should appear in this notebook’s credits."
          action={
            <Button variant="primary" onClick={() => setEditor({ name: "", role: "Member" })}>
              Add person
            </Button>
          }
        />
      )}

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const id = photoTargetRef.current;
          e.target.value = "";
          photoTargetRef.current = null;
          if (file && id) void uploadPhoto(id, file);
        }}
      />

      <Dialog
        isOpen={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor?.id ? "Edit roster person" : "Add roster person"}
      >
        <div className="flex flex-col gap-3">
          <TextField
            label="Name"
            value={editor?.name || ""}
            onChange={(e) => setEditor((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
          />
          <TextField
            label="Role"
            value={editor?.role || ""}
            onChange={(e) => setEditor((prev) => (prev ? { ...prev, role: e.target.value } : prev))}
          />
          <label className="flex flex-col gap-1 text-nb-caption font-semibold text-nb-on-surface-variant">
            Link org account (optional)
            <select
              className="rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface px-2 py-2 text-nb-label"
              value={editor?.linkedUid || ""}
              onChange={(e) =>
                setEditor((prev) =>
                  prev ? { ...prev, linkedUid: e.target.value || undefined } : prev
                )
              }
            >
              <option value="">None</option>
              {orgPeople.map((p) => (
                <option key={p.uid} value={p.uid}>
                  {p.email || p.uid}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={busy || !editor?.name?.trim()} onClick={() => void saveEditor()}>
              Save
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmationDialog
        isOpen={Boolean(deleteMember)}
        title="Remove from roster?"
        message={`Remove ${deleteMember?.name} from this notebook’s credits?`}
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
