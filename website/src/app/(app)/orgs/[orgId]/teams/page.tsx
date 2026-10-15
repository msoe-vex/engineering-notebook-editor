"use client";

import { useEffect, useState } from "react";
import { Plus, Users } from "lucide-react";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import TextPromptDialog from "@/components/dialogs/TextPromptDialog";
import { useOrgWorkspace } from "@/components/cloud/OrgWorkspaceContext";
import { Button, EmptyState, ListRow } from "@/components/ui";
import { cloudApi, type TeamSummary } from "@/lib/cloud/api";

export default function OrgTeamsPage() {
  const { orgId, teams, members, canManage, busy, setBusy, refresh, setError } =
    useOrgWorkspace();
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTeam, setRenameTeam] = useState<TeamSummary | null>(null);
  const [deleteTeam, setDeleteTeam] = useState<TeamSummary | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [teamUids, setTeamUids] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!expandedId) return;
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
          return (
            <ListRow key={team.id} className="flex-wrap">
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
                    {open ? "Hide people" : "Show people"}
                  </p>
                </div>
              </button>
              {canManage && (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setRenameTeam(team)}>
                    Rename
                  </Button>
                  <Button size="sm" variant="link" className="text-nb-danger" onClick={() => setDeleteTeam(team)}>
                    Delete
                  </Button>
                </div>
              )}
              {open && (
                <div className="mt-3 basis-full w-full border-t border-nb-outline-variant/20 pt-3">
                  <ul className="space-y-2">
                    {members.map((m) => {
                      const onTeam = uids.includes(m.uid);
                      return (
                        <li
                          key={m.uid}
                          className="flex items-center justify-between gap-2 text-nb-body"
                        >
                          <span className="truncate">{m.email || m.uid}</span>
                          {canManage && (
                            <Button
                              size="sm"
                              variant={onTeam ? "secondary" : "primary"}
                              onClick={() => {
                                const op = onTeam
                                  ? cloudApi.removeTeamMember(orgId, team.id, m.uid)
                                  : cloudApi.addTeamMember(orgId, team.id, m.uid);
                                void op
                                  .then(() =>
                                    cloudApi.listTeamMembers(orgId, team.id).then((list) => {
                                      setTeamUids((prev) => ({
                                        ...prev,
                                        [team.id]: list.map((x) => x.uid),
                                      }));
                                    })
                                  )
                                  .catch((err) => setError((err as Error).message));
                              }}
                            >
                              {onTeam ? "Remove" : "Add"}
                            </Button>
                          )}
                        </li>
                      );
                    })}
                    {!members.length && (
                      <li className="text-nb-on-surface-variant">
                        Add people to the organization first.
                      </li>
                    )}
                  </ul>
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
    </div>
  );
}
