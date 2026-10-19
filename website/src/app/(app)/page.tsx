"use client";

import { useEffect, useState, type MouseEvent as ReactMouseEvent, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, BookOpen, Mail, Plus, ArrowRight, Edit2, Share2, Trash2, Users } from "lucide-react";
import Logo from "@/components/icons/Logo";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import TextPromptDialog from "@/components/dialogs/TextPromptDialog";
import { ShareNotebookDialog } from "@/components/cloud/ShareNotebookDialog";
import {
  Alert,
  Button,
  ContextMenu,
  DropdownMenu,
  EmptyState,
  ListRow,
  Skeleton,
  type MenuItem,
} from "@/components/ui";
import { cloudApi, type NotebookSummary, type OrgSummary } from "@/lib/cloud/api";
import { isOrgAdminRole, orgRoleLabel } from "@/lib/cloud/roles";
import { getDevToken, getFirebaseAuth } from "@/lib/cloud/firebase";

type RecentNotebook = NotebookSummary & { orgId: string; orgName: string };

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [recent, setRecent] = useState<RecentNotebook[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listReady, setListReady] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [shareNb, setShareNb] = useState<RecentNotebook | null>(null);
  const [renameTarget, setRenameTarget] = useState<OrgSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrgSummary | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  function orgMenuItems(org: OrgSummary): MenuItem[] {
    const items: MenuItem[] = [
      {
        id: "open",
        label: "Open",
        onSelect: () => router.push(`/orgs/${org.id}`),
      },
      {
        id: "people",
        label: "People",
        icon: <Users size={14} />,
        onSelect: () => router.push(`/orgs/${org.id}/people`),
      },
    ];
    if (isOrgAdminRole(org.role)) {
      items.push(
        { id: "sep", label: "", separator: true },
        {
          id: "rename",
          label: "Rename",
          icon: <Edit2 size={14} />,
          onSelect: () => setRenameTarget(org),
        }
      );
      if (org.role === "owner") {
        items.push({
          id: "delete",
          label: "Delete",
          icon: <Trash2 size={14} />,
          danger: true,
          onSelect: () => setDeleteTarget(org),
        });
      }
    }
    return items;
  }

  function onOrgContextMenu(e: ReactMouseEvent, org: OrgSummary) {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, items: orgMenuItems(org) });
  }

  useEffect(() => {
    const invite = searchParams.get("invite");
    if (invite) setInviteOpen(true);
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      const ok = Boolean(getFirebaseAuth().currentUser || getDevToken());
      queueMicrotask(() => {
        if (cancelled) return;
        setAuthed(ok);
        if (!ok) return;
        void (async () => {
          try {
            const list = await cloudApi.listOrgs();
            if (cancelled) return;
            setOrgs(list);
            const notebookLists = await Promise.all(
              list.slice(0, 8).map(async (org) => {
                try {
                  const nbs = await cloudApi.listNotebooks(org.id);
                  return nbs.map((nb) => ({
                    ...nb,
                    orgId: org.id,
                    orgName: org.name,
                  }));
                } catch {
                  return [] as RecentNotebook[];
                }
              })
            );
            const flat = notebookLists
              .flat()
              .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
              .slice(0, 6);
            if (!cancelled) {
              setRecent(flat);
              setError(null);
              setListReady(true);
            }
          } catch (err) {
            if (!cancelled) {
              setError((err as Error).message);
              setListReady(true);
            }
          }
        })();
      });
    };
    tick();
    const t = setInterval(tick, 8000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [reloadToken]);

  function refresh() {
    setReloadToken((n) => n + 1);
  }

  if (!authed) return null;

  const inviteDefault = searchParams.get("invite") || "";

  return (
    <div className="font-sans">
      <div className="mb-10 flex flex-wrap items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-nb-xl bg-nb-primary shadow-nb-lg shadow-nb-primary/25">
          <Logo className="text-white" size={28} strokeWidth={18} />
        </div>
        <div>
          <h1 className="text-nb-display font-bold tracking-tight text-nb-on-surface">ENGen</h1>
          <p className="text-nb-body text-nb-on-surface-variant">Engineering notebook workspace</p>
        </div>
      </div>

      {error && (
        <Alert variant="error" className="mb-6">
          {error}
        </Alert>
      )}

      <section className="mb-10 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-nb-title font-semibold">Recent notebooks</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setInviteOpen(true)}>
              <Mail size={14} /> Accept invite
            </Button>
            <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus size={14} /> Create organization
            </Button>
          </div>
        </div>
        {!listReady ? (
          <div className="grid gap-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 rounded-nb-xl border border-nb-outline-variant/20 p-3">
                <Skeleton className="h-10 w-10 shrink-0 rounded-nb-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : recent.length > 0 ? (
          <div className="grid gap-2">
            {recent.map((nb) => (
              <ListRow key={`${nb.orgId}-${nb.id}`} interactive>
                <Link
                  href={`/orgs/${nb.orgId}/notebooks/${nb.id}`}
                  className="flex min-w-0 flex-1 items-center gap-4"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-nb-lg bg-nb-tertiary/10 text-nb-tertiary">
                    <BookOpen size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-nb-on-surface">
                      {nb.title || nb.name}
                    </div>
                    <div className="text-nb-caption text-nb-on-surface-variant">{nb.orgName}</div>
                  </div>
                  <ArrowRight size={16} className="text-nb-on-surface-variant opacity-50" />
                </Link>
                <DropdownMenu
                  items={[
                    {
                      id: "open",
                      label: "Open",
                      onSelect: () => router.push(`/orgs/${nb.orgId}/notebooks/${nb.id}`),
                    },
                    {
                      id: "share",
                      label: "Share…",
                      icon: <Share2 size={14} />,
                      onSelect: () => setShareNb(nb),
                    },
                  ]}
                />
              </ListRow>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No notebooks yet"
            description="Create an organization, then add a notebook."
          />
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-nb-title font-semibold">Organizations</h2>
        <div className="grid gap-2">
          {orgs.map((org) => (
            <ListRow
              key={org.id}
              interactive
              onContextMenu={(e) => onOrgContextMenu(e, org)}
            >
              <Link
                href={`/orgs/${org.id}`}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-4"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-nb-lg bg-nb-primary/10 text-nb-primary">
                  <Building2 size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-nb-on-surface">{org.name}</h3>
                  <p className="text-nb-caption text-nb-on-surface-variant">
                    {org.role ? orgRoleLabel(org.role) : "Member"}
                  </p>
                </div>
              </Link>
              <DropdownMenu items={orgMenuItems(org)} />
            </ListRow>
          ))}
          {!orgs.length && (
            <EmptyState
              title="No organizations yet"
              description="Create one or accept an invite to get started."
              action={
                <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
                  Create organization
                </Button>
              }
            />
          )}
        </div>
      </section>

      <TextPromptDialog
        isOpen={createOpen}
        title="Create organization"
        label="Organization name"
        initialValue="My Organization"
        confirmLabel="Create"
        onCancel={() => setCreateOpen(false)}
        onConfirm={(name) => {
          setCreateOpen(false);
          setBusy(true);
          void cloudApi
            .createOrg(name)
            .then(refresh)
            .catch((err) => setError((err as Error).message))
            .finally(() => setBusy(false));
        }}
      />

      <TextPromptDialog
        isOpen={inviteOpen}
        title="Accept invite"
        label="Paste invite link or enter share code"
        placeholder="e.g. 5fa5ba86-96fd... or https://.../?invite=..."
        initialValue={inviteDefault}
        confirmLabel="Accept"
        onCancel={() => setInviteOpen(false)}
        onConfirm={(raw) => {
          setInviteOpen(false);
          const id = raw.includes("invite=")
            ? (new URL(raw, window.location.origin).searchParams.get("invite") || raw)
            : raw.trim();
          setBusy(true);
          void cloudApi
            .acceptInvite(id)
            .then((res) => {
              refresh();
              if (res.orgId) window.location.href = `/orgs/${res.orgId}`;
            })
            .catch((err) => setError((err as Error).message))
            .finally(() => setBusy(false));
        }}
      />

      <TextPromptDialog
        isOpen={Boolean(renameTarget)}
        title="Rename organization"
        label="Organization name"
        initialValue={renameTarget?.name || ""}
        confirmLabel="Save"
        onCancel={() => setRenameTarget(null)}
        onConfirm={(name) => {
          const id = renameTarget?.id;
          setRenameTarget(null);
          if (!id) return;
          void cloudApi
            .patchOrg(id, { name })
            .then(refresh)
            .catch((err) => setError((err as Error).message));
        }}
      />

      <ShareNotebookDialog
        open={Boolean(shareNb)}
        onClose={() => setShareNb(null)}
        orgId={shareNb?.orgId}
        notebookId={shareNb?.id}
        notebookName={shareNb?.title || shareNb?.name}
        initialAccess={shareNb?.access}
        onSaved={() => refresh()}
      />

      <ConfirmationDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete organization?"
        message={`Delete “${deleteTarget?.name}” and all of its notebooks? This cannot be undone.`}
        confirmLabel="Delete organization"
        confirmText={deleteTarget?.name}
        variant="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          const id = deleteTarget?.id;
          setDeleteTarget(null);
          if (!id) return;
          void cloudApi
            .deleteOrg(id)
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

export default function CloudHomePage() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
