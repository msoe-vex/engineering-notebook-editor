"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui";
import { showNotification } from "@/components/overlays/Notification";
import {
  cloudApi,
  type MemberSummary,
  type NotebookAccess,
  type TeamSummary,
} from "@/lib/cloud/api";
import { AccessAllowlistPicker } from "./AccessAllowlistPicker";
import { useOptionalNotebookWorkspace } from "./NotebookWorkspaceContext";

export type ShareNotebookDialogProps = {
  open: boolean;
  onClose: () => void;
  orgId?: string;
  notebookId?: string;
  notebookName?: string;
  initialAccess?: NotebookAccess;
  teams?: TeamSummary[];
  people?: MemberSummary[];
  onSaved?: (access: NotebookAccess) => void;
};

/**
 * Google-style share sheet for notebook ACL (org-open vs restricted user/team allowlists).
 * Does not invite emails outside the org — use org invites for that.
 * Works both inside NotebookShell (auto-reads workspace) and standalone from notebook menus.
 */
export function ShareNotebookDialog({
  open,
  onClose,
  orgId: propOrgId,
  notebookId: propNotebookId,
  notebookName: propNotebookName,
  initialAccess: propInitialAccess,
  teams: propTeams,
  people: propPeople,
  onSaved,
}: ShareNotebookDialogProps) {
  const workspace = useOptionalNotebookWorkspace();
  const effectiveOrgId = propOrgId ?? workspace?.orgId ?? "";
  const effectiveNotebookId = propNotebookId ?? workspace?.notebookId ?? "";
  const effectiveNotebookName = propNotebookName || workspace?.notebookName || "";

  const [accessMode, setAccessMode] = useState<"org" | "restricted">("org");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [people, setPeople] = useState<MemberSummary[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !effectiveOrgId) return;

    let cancelled = false;

    // Load teams & people allowlist options
    if (propTeams && propPeople) {
      setTeams(propTeams);
      setPeople(propPeople);
    } else {
      void Promise.all([
        cloudApi.listTeams(effectiveOrgId).catch(() => [] as TeamSummary[]),
        cloudApi.listMembers(effectiveOrgId).catch(() => [] as MemberSummary[]),
      ]).then(([t, m]) => {
        if (!cancelled) {
          setTeams(t);
          setPeople(m);
        }
      });
    }

    // Set initial access state
    if (propInitialAccess) {
      setAccessMode(propInitialAccess.mode === "restricted" ? "restricted" : "org");
      setTeamIds(propInitialAccess.teamIds || []);
      setUserIds(propInitialAccess.userIds || []);
    } else if (workspace?.notebookSummary?.access) {
      const a = workspace.notebookSummary.access;
      setAccessMode(a.mode === "restricted" ? "restricted" : "org");
      setTeamIds(a.teamIds || []);
      setUserIds(a.userIds || []);
    } else if (effectiveNotebookId) {
      void cloudApi
        .getNotebook(effectiveOrgId, effectiveNotebookId)
        .then((nb) => {
          if (!cancelled && nb?.access) {
            setAccessMode(nb.access.mode === "restricted" ? "restricted" : "org");
            setTeamIds(nb.access.teamIds || []);
            setUserIds(nb.access.userIds || []);
          }
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [
    open,
    effectiveOrgId,
    effectiveNotebookId,
    propInitialAccess,
    propTeams,
    propPeople,
    workspace?.notebookSummary?.access,
  ]);

  async function save() {
    if (!effectiveOrgId || !effectiveNotebookId) return;
    setBusy(true);
    const next: NotebookAccess = {
      mode: accessMode,
      teamIds: accessMode === "restricted" ? teamIds : [],
      userIds: accessMode === "restricted" ? userIds : [],
    };
    try {
      const updated = await cloudApi.patchNotebook(effectiveOrgId, effectiveNotebookId, {
        access: next,
      });
      if (workspace?.setNotebookSummary) {
        const prev = workspace.notebookSummary;
        if (prev) {
          workspace.setNotebookSummary({
            ...prev,
            ...updated,
            phases: (updated.phases as unknown as typeof prev.phases) ?? prev.phases,
            access: next,
          });
        }
        workspace.refresh();
      }
      onSaved?.(next);
      showNotification(
        accessMode === "org" ? "Shared with entire organization" : "Access updated",
        "success"
      );
      onClose();
    } catch (err) {
      showNotification((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const dialogTitle = effectiveNotebookName
    ? `Share “${effectiveNotebookName}”`
    : "Share notebook";

  return (
    <Dialog isOpen={open} onClose={onClose} title={dialogTitle} wide>
      <div className="flex flex-col gap-4">
        <p className="text-nb-body text-nb-on-surface-variant">
          Organization owners and admins can always open every notebook. Choose who else can
          open this one. To add someone new to the org, use Invites.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={accessMode === "org" ? "primary" : "secondary"}
            onClick={() => setAccessMode("org")}
          >
            Entire organization
          </Button>
          <Button
            size="sm"
            variant={accessMode === "restricted" ? "primary" : "secondary"}
            onClick={() => setAccessMode("restricted")}
          >
            Restricted
          </Button>
        </div>

        {accessMode === "restricted" && (
          <AccessAllowlistPicker
            teams={teams}
            people={people}
            teamIds={teamIds}
            userIds={userIds}
            onTeamIdsChange={setTeamIds}
            onUserIdsChange={setUserIds}
          />
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Done"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
