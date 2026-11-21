"use client";

import { useEffect, useMemo, useState } from "react";
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
import { GripVertical, Plus, UserRound, X } from "lucide-react";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
import { showNotification } from "@/components/overlays/Notification";
import { ContributorsPageSkeleton } from "@/components/cloud/notebookPageSkeletons";
import { Button, Dialog, EmptyState } from "@/components/ui";
import { cloudApi, type MemberSummary } from "@/lib/cloud/api";
import { useAppDndSensors } from "@/lib/dnd/dndSensors";

type ContributorRow = {
  uid: string;
  name: string;
  title?: string;
  photoUrl?: string;
};

function SortableContributor({
  row,
  onRemove,
  readOnly,
}: {
  row: ContributorRow;
  onRemove: () => void;
  readOnly?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.uid,
    disabled: readOnly,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
      }}
      className="flex items-center gap-2 rounded-nb-xl border border-nb-outline-variant/25 bg-nb-surface px-2 py-2"
    >
      {!readOnly && (
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
      )}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-nb-lg bg-nb-surface-low">
        {row.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <UserRound size={18} className="text-nb-on-surface-variant" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-nb-on-surface">{row.name}</p>
        <p className="truncate text-nb-caption text-nb-on-surface-variant">
          {row.title || "Member"}
        </p>
      </div>
      {!readOnly && (
        <Button size="sm" variant="ghost" className="text-nb-danger" onClick={onRemove} title="Remove">
          <X size={14} />
        </Button>
      )}
    </div>
  );
}

export default function NotebookContributorsPage() {
  const {
    orgId,
    notebookId,
    notebookSummary,
    isArchived,
    refresh,
    setError,
  } = useNotebookWorkspace();
  const sensors = useAppDndSensors();
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [orgPeople, setOrgPeople] = useState<MemberSummary[]>([]);
  const [rows, setRows] = useState<ContributorRow[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const contributorUids = useMemo(
    () =>
      ((notebookSummary as { contributorUids?: string[] } | null)?.contributorUids ||
        rows.map((r) => r.uid)) as string[],
    [notebookSummary, rows]
  );

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    void (async () => {
      try {
        const people = await cloudApi.listMembers(orgId);
        if (cancelled) return;
        setOrgPeople(people);

        const uids =
          (notebookSummary as { contributorUids?: string[] } | null)?.contributorUids || [];
        const photos: Record<string, string> = {};
        await Promise.all(
          people.map(async (p) => {
            if (!p.imageAssetId) return;
            try {
              const { url } = await cloudApi.getOrgAssetUrl(orgId, p.imageAssetId);
              photos[p.uid] = url;
            } catch {
              /* ignore */
            }
          })
        );
        if (cancelled) return;

        if (uids.length) {
          setRows(
            uids
              .map((uid) => {
                const p = people.find((x) => x.uid === uid);
                if (!p) return null;
                return {
                  uid,
                  name: p.displayName || p.email || "Member",
                  title: (p as MemberSummary & { title?: string }).title,
                  photoUrl: photos[uid],
                };
              })
              .filter(Boolean) as ContributorRow[]
          );
        } else {
          // Seed from legacy roster API once.
          const legacy = await cloudApi.listNotebookMembers(orgId, notebookId);
          const mapped = legacy
            .map((m) => {
              const uid = m.orgMemberUid || m.id;
              const p = people.find((x) => x.uid === uid);
              if (!p) return null;
              return {
                uid,
                name: p.displayName || p.email || m.name,
                title: (p as MemberSummary & { title?: string }).title || m.role,
                photoUrl: photos[uid],
              };
            })
            .filter(Boolean) as ContributorRow[];
          setRows(mapped);
          if (mapped.length) {
            await cloudApi.patchNotebook(orgId, notebookId, {
              contributorUids: mapped.map((r) => r.uid),
            });
            refresh();
          }
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, notebookId]);

  async function persist(next: ContributorRow[]) {
    setRows(next);
    setBusy(true);
    try {
      await cloudApi.patchNotebook(orgId, notebookId, {
        contributorUids: next.map((r) => r.uid),
      });
      refresh();
    } catch (err) {
      setError((err as Error).message);
      showNotification((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    if (isArchived || !event.over) return;
    const from = rows.findIndex((r) => r.uid === event.active.id);
    const to = rows.findIndex((r) => r.uid === event.over?.id);
    if (from < 0 || to < 0 || from === to) return;
    void persist(arrayMove(rows, from, to));
  }

  const available = orgPeople.filter((p) => !rows.some((r) => r.uid === p.uid));

  if (!loaded) return <ContributorsPageSkeleton />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-nb-title font-semibold text-nb-on-surface">Contributors</h1>
          <p className="mt-1 text-nb-body text-nb-on-surface-variant">
            Choose who appears in this notebook’s credits from organization members. Titles and
            photos are edited under People.
          </p>
        </div>
        {!isArchived && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !available.length}
            onClick={() => setPickerOpen(true)}
          >
            <Plus size={14} /> Add
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No contributors yet"
          description="Add organization members to the credits list."
          action={
            !isArchived ? (
              <Button size="sm" variant="secondary" onClick={() => setPickerOpen(true)}>
                <Plus size={14} /> Add contributor
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rows.map((r) => r.uid)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {rows.map((row) => (
                <SortableContributor
                  key={row.uid}
                  row={row}
                  readOnly={isArchived || busy}
                  onRemove={() => void persist(rows.filter((r) => r.uid !== row.uid))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Dialog
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Add contributors"
        size="md"
        footer={
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setPickerOpen(false)}>
              Done
            </Button>
          </div>
        }
      >
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {available.map((p) => (
            <li key={p.uid}>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-nb-lg px-2 py-2 text-left hover:bg-nb-surface-low"
                disabled={busy}
                onClick={() => {
                  void persist([
                    ...rows,
                    {
                      uid: p.uid,
                      name: p.displayName || p.email || "Member",
                      title: (p as MemberSummary & { title?: string }).title,
                    },
                  ]);
                }}
              >
                <UserRound size={16} className="text-nb-on-surface-variant" />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {p.displayName || p.email || "Member"}
                </span>
                <span className="text-nb-caption text-nb-on-surface-variant">
                  {[
                    (p as MemberSummary & { title?: string }).title || p.role,
                    p.status === "alumni" ? "Alumni" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            </li>
          ))}
          {!available.length && (
            <li className="py-6 text-center text-nb-caption text-nb-on-surface-variant">
              Every org member is already on the credits list.
            </li>
          )}
        </ul>
      </Dialog>
    </div>
  );
}
