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
import { GripVertical, UserRound, X } from "lucide-react";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
import { OrgPeopleSearchPanel } from "@/components/cloud/OrgPeopleSearchPanel";
import { showNotification } from "@/components/overlays/Notification";
import { ContributorsPageSkeleton } from "@/components/cloud/notebookPageSkeletons";
import { Button, EmptyState } from "@/components/ui";
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

function rowFromMember(p: MemberSummary, photoUrl?: string): ContributorRow {
  return {
    uid: p.uid,
    name: p.displayName || p.email || "Member",
    title: (p as MemberSummary & { title?: string }).title,
    photoUrl,
  };
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
  const [memberQuery, setMemberQuery] = useState("");
  const [photos, setPhotos] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    void (async () => {
      try {
        const people = await cloudApi.listMembers(orgId);
        if (cancelled) return;
        setOrgPeople(people);

        const nextPhotos: Record<string, string> = {};
        await Promise.all(
          people.map(async (p) => {
            if (!p.imageAssetId) return;
            try {
              const { url } = await cloudApi.getOrgAssetUrl(orgId, p.imageAssetId);
              nextPhotos[p.uid] = url;
            } catch {
              /* ignore */
            }
          })
        );
        if (cancelled) return;
        setPhotos(nextPhotos);

        const uids =
          (notebookSummary as { contributorUids?: string[] } | null)?.contributorUids || [];

        if (uids.length) {
          setRows(
            uids
              .map((uid) => {
                const p = people.find((x) => x.uid === uid);
                if (!p) return null;
                return rowFromMember(p, nextPhotos[uid]);
              })
              .filter(Boolean) as ContributorRow[]
          );
        } else {
          const legacy = await cloudApi.listNotebookMembers(orgId, notebookId);
          const mapped = legacy
            .map((m) => {
              const uid = m.orgMemberUid || m.id;
              const p = people.find((x) => x.uid === uid);
              if (!p) return null;
              return {
                ...rowFromMember(p, nextPhotos[uid]),
                title:
                  (p as MemberSummary & { title?: string }).title || m.role || undefined,
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

  const selectedMembers = useMemo(() => {
    return rows
      .map((r) => orgPeople.find((p) => p.uid === r.uid))
      .filter(Boolean) as MemberSummary[];
  }, [rows, orgPeople]);

  if (!loaded) return <ContributorsPageSkeleton />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-nb-title font-semibold text-nb-on-surface">Contributors</h1>
        <p className="mt-1 text-nb-body text-nb-on-surface-variant">
          Choose who appears in this notebook’s credits from organization members. Titles and
          photos are edited under People. Drag to reorder.
        </p>
      </div>

      {!isArchived && (
        <OrgPeopleSearchPanel
          canManage={!busy}
          members={orgPeople}
          selected={selectedMembers}
          query={memberQuery}
          onQueryChange={setMemberQuery}
          onAdd={(uid) => {
            if (rows.some((r) => r.uid === uid)) return;
            const p = orgPeople.find((x) => x.uid === uid);
            if (!p) return;
            setMemberQuery("");
            void persist([...rows, rowFromMember(p, photos[uid])]);
          }}
          onRemove={(uid) => void persist(rows.filter((r) => r.uid !== uid))}
          showSelectedList={false}
        />
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="No contributors yet"
          description={
            isArchived
              ? "This archived notebook has no credits list."
              : "Search people above to add them to the credits list."
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
    </div>
  );
}
