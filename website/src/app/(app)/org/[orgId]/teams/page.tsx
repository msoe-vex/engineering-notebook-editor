"use client";

import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Edit2, Plus, Trash2, Users } from "lucide-react";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import TextPromptDialog from "@/components/dialogs/TextPromptDialog";
import { useOrgWorkspace } from "@/components/cloud/OrgWorkspaceContext";
import { OrgPeopleSearchPanel } from "@/components/cloud/OrgPeopleSearchPanel";
import {
  Button,
  ContextMenu,
  DropdownMenu,
  EmptyState,
  ListRow,
  type MenuItem,
} from "@/components/ui";
import { cloudApi, type TeamSummary } from "@/lib/cloud/api";

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
                <div className="mt-3 w-full basis-full border-t border-nb-outline-variant/20 pt-3">
                  <OrgPeopleSearchPanel
                    canManage={canManage}
                    members={members}
                    selected={onTeam}
                    query={memberQuery}
                    onQueryChange={setMemberQuery}
                    onAdd={(uid) => addMember(team.id, uid)}
                    onRemove={(uid) => removeMember(team.id, uid)}
                    emptySelectedHint={
                      canManage
                        ? "No one on this team yet — search above to add people."
                        : "No one on this team yet."
                    }
                  />
                </div>
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

