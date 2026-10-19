"use client";

import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Edit2, Plus, Search, Trash2, User, Users, X } from "lucide-react";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import TextPromptDialog from "@/components/dialogs/TextPromptDialog";
import { useOrgWorkspace } from "@/components/cloud/OrgWorkspaceContext";
import {
  Button,
  ContextMenu,
  DropdownMenu,
  EmptyState,
  ListRow,
  type MenuItem,
} from "@/components/ui";
import { cloudApi, type MemberSummary, type TeamSummary } from "@/lib/cloud/api";

export default function OrgTeamsPage() {
  const { orgId, teams, members, canManage, busy, setBusy, refresh, setError } =
    useOrgWorkspace();
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTeam, setRenameTeam] = useState<TeamSummary | null>(null);
  const [deleteTeam, setDeleteTeam] = useState<TeamSummary | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [teamUids, setTeamUids] = useState<Record<string, string[]>>({});
  const [memberQuery, setMemberQuery] = useState("");
  const [ctx, setCtx] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  function teamMenuItems(team: TeamSummary): MenuItem[] {
    return [
      {
        id: "toggle",
        label: expandedId === team.id ? "Hide people" : "Show people",
        onSelect: () => setExpandedId(expandedId === team.id ? null : team.id),
      },
      ...(canManage
        ? [
            { id: "sep", label: "", separator: true as const },
            {
              id: "rename",
              label: "Rename",
              icon: <Edit2 size={14} />,
              onSelect: () => setRenameTeam(team),
            },
            {
              id: "delete",
              label: "Delete",
              icon: <Trash2 size={14} />,
              danger: true as const,
              onSelect: () => setDeleteTeam(team),
            },
          ]
        : []),
    ];
  }

  function onTeamContextMenu(e: ReactMouseEvent, team: TeamSummary) {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, items: teamMenuItems(team) });
  }

  useEffect(() => {
    if (!expandedId) return;
    setMemberQuery("");
    let cancelled = false;
    void cloudApi
      .listTeamMembers(orgId, expandedId)
      .then((list) => {
        if (!cancelled) {
          setTeamUids((prev) => ({ ...prev, [expandedId]: list.map((m) => m.uid) }));
        }
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [expandedId, orgId, setError]);

  function refreshTeamMembers(teamId: string) {
    return cloudApi.listTeamMembers(orgId, teamId).then((list) => {
      setTeamUids((prev) => ({
        ...prev,
        [teamId]: list.map((x) => x.uid),
      }));
    });
  }

  function addMember(teamId: string, uid: string) {
    void cloudApi
      .addTeamMember(orgId, teamId, uid)
      .then(() => refreshTeamMembers(teamId))
      .then(() => setMemberQuery(""))
      .catch((err) => setError((err as Error).message));
  }

  function removeMember(teamId: string, uid: string) {
    void cloudApi
      .removeTeamMember(orgId, teamId, uid)
      .then(() => refreshTeamMembers(teamId))
      .catch((err) => setError((err as Error).message));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-nb-title font-semibold text-nb-on-surface">Teams</h2>
        {canManage && (
          <Button size="sm" variant="primary" disabled={busy} onClick={() => setCreateOpen(true)}>
            <Plus size={14} /> Create team
          </Button>
        )}
      </div>

      <p className="text-nb-body text-nb-on-surface-variant">
        Named groups of people used to control notebook access. Teams have a name only.
      </p>

      <div className="grid grid-cols-1 gap-3">
        {teams.map((team) => {
          const open = expandedId === team.id;
          const uids = teamUids[team.id] || [];
          const onTeam = members.filter((m) => uids.includes(m.uid));
          return (
            <ListRow
              key={team.id}
              className="flex-wrap"
              onContextMenu={(e) => onTeamContextMenu(e, team)}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-4 text-left"
                onClick={() => setExpandedId(open ? null : team.id)}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-nb-lg bg-nb-tertiary/10 text-nb-tertiary">
                  <Users size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-nb-body font-semibold text-nb-on-surface">
                    {team.name}
                  </h3>
                  <p className="mt-0.5 text-nb-caption text-nb-on-surface-variant">
                    {open
                      ? "Hide people"
                      : uids.length
                        ? `${uids.length} ${uids.length === 1 ? "person" : "people"}`
                        : "Show people"}
                  </p>
                </div>
              </button>
              <DropdownMenu items={teamMenuItems(team)} />
              {open && (
                <TeamPeoplePanel
                  canManage={canManage}
                  members={members}
                  onTeam={onTeam}
                  query={memberQuery}
                  onQueryChange={setMemberQuery}
                  onAdd={(uid) => addMember(team.id, uid)}
                  onRemove={(uid) => removeMember(team.id, uid)}
                />
              )}
            </ListRow>
          );
        })}
        {!teams.length && (
          <EmptyState
            title="No teams yet"
            description="Create a team to group people for notebook access."
            action={
              canManage ? (
                <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
                  Create team
                </Button>
              ) : undefined
            }
          />
        )}
      </div>

      <TextPromptDialog
        isOpen={createOpen}
        title="Create team"
        label="Team name"
        initialValue=""
        confirmLabel="Create"
        onCancel={() => setCreateOpen(false)}
        onConfirm={(name) => {
          setCreateOpen(false);
          setBusy(true);
          void cloudApi
            .createTeam(orgId, name)
            .then(refresh)
            .catch((err) => setError((err as Error).message))
            .finally(() => setBusy(false));
        }}
      />

      <TextPromptDialog
        isOpen={Boolean(renameTeam)}
        title="Rename team"
        label="Team name"
        initialValue={renameTeam?.name || ""}
        confirmLabel="Save"
        onCancel={() => setRenameTeam(null)}
        onConfirm={(name) => {
          const id = renameTeam?.id;
          setRenameTeam(null);
          if (!id) return;
          void cloudApi
            .patchTeam(orgId, id, { name })
            .then(refresh)
            .catch((err) => setError((err as Error).message));
        }}
      />

      <ConfirmationDialog
        isOpen={Boolean(deleteTeam)}
        title="Delete team?"
        message={`Delete “${deleteTeam?.name}”? Notebooks that grant access via this team will need their access updated.`}
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setDeleteTeam(null)}
        onConfirm={() => {
          const id = deleteTeam?.id;
          setDeleteTeam(null);
          if (!id) return;
          void cloudApi
            .deleteTeam(orgId, id)
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

function TeamPeoplePanel({
  canManage,
  members,
  onTeam,
  query,
  onQueryChange,
  onAdd,
  onRemove,
}: {
  canManage: boolean;
  members: MemberSummary[];
  onTeam: MemberSummary[];
  query: string;
  onQueryChange: (q: string) => void;
  onAdd: (uid: string) => void;
  onRemove: (uid: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const onTeamIds = useMemo(() => new Set(onTeam.map((m) => m.uid)), [onTeam]);

  const suggestions = useMemo(() => {
    if (!q) return [] as MemberSummary[];
    return members.filter(
      (m) =>
        !onTeamIds.has(m.uid) &&
        ((m.displayName || "").toLowerCase().includes(q) ||
          (m.email || "").toLowerCase().includes(q) ||
          m.uid.toLowerCase().includes(q))
    );
  }, [q, members, onTeamIds]);

  return (
    <div className="mt-3 basis-full w-full space-y-3 border-t border-nb-outline-variant/20 pt-3">
      {canManage && (
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-nb-on-surface-variant/60"
          />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={
              members.length ? "Search people (by name or email) to add…" : "Add people to the organization first"
            }
            disabled={!members.length}
            className="w-full rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface py-2 pr-3 pl-8 text-nb-label outline-none focus:border-nb-primary disabled:opacity-50"
            aria-label="Search people to add to team"
          />
          {q ? (
            <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface shadow-nb-md">
              {suggestions.length > 0 ? (
                <ul className="py-1">
                  {suggestions.map((m) => (
                    <li key={m.uid}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-nb-label hover:bg-nb-surface-low"
                        onClick={() => onAdd(m.uid)}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <User size={14} className="text-nb-on-surface-variant shrink-0" />
                          <div className="truncate">
                            {m.displayName ? (
                              <>
                                <span className="font-semibold text-nb-on-surface">{m.displayName}</span>
                                {m.email && (
                                  <span className="ml-1.5 text-nb-caption text-nb-on-surface-variant">
                                    ({m.email})
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-nb-on-surface">{m.email || m.uid}</span>
                            )}
                          </div>
                        </div>
                        <span className="text-nb-caption text-nb-on-surface-variant shrink-0">Add</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-2 text-nb-caption text-nb-on-surface-variant">No matches</p>
              )}
            </div>
          ) : null}
        </div>
      )}

      {onTeam.length > 0 ? (
        <div className="max-h-56 overflow-y-auto rounded-nb-xl border border-nb-outline-variant/30 bg-nb-surface divide-y divide-nb-outline-variant/15">
          {onTeam.map((m) => (
            <div
              key={m.uid}
              className="flex items-center justify-between gap-3 px-3.5 py-2 text-nb-body"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-nb-primary/10 text-nb-primary">
                  <User size={14} />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-nb-on-surface text-nb-label">
                    {m.displayName || m.email || m.uid}
                  </p>
                  {m.displayName && m.email && (
                    <p className="truncate text-nb-caption text-nb-on-surface-variant">{m.email}</p>
                  )}
                </div>
              </div>
              {canManage && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-nb-on-surface-variant hover:text-nb-danger"
                  onClick={() => onRemove(m.uid)}
                  title={`Remove ${m.displayName || m.email || m.uid} from team`}
                >
                  <X size={14} />
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-nb-caption text-nb-on-surface-variant">
          {canManage ? "No one on this team yet — search above to add people." : "No one on this team yet."}
        </p>
      )}
    </div>
  );
}
