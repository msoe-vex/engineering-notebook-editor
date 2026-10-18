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
import { useNotebookWorkspace } from "./NotebookWorkspaceContext";

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * Google-style share sheet for notebook ACL (org-open vs restricted user/team allowlists).
 * Does not invite emails outside the org — use org invites for that.
 */
export function ShareNotebookDialog({ open, onClose }: Props) {
  const { orgId, notebookId, notebookSummary, setNotebookSummary, refresh } =
    useNotebookWorkspace();
  const access = notebookSummary?.access;
  const [accessMode, setAccessMode] = useState<"org" | "restricted">(
    access?.mode === "restricted" ? "restricted" : "org"
  );
  const [teamIds, setTeamIds] = useState<string[]>(access?.teamIds || []);
  const [userIds, setUserIds] = useState<string[]>(access?.userIds || []);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [people, setPeople] = useState<MemberSummary[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAccessMode(access?.mode === "restricted" ? "restricted" : "org");
    setTeamIds(access?.teamIds || []);
    setUserIds(access?.userIds || []);
    void Promise.all([
      cloudApi.listTeams(orgId).catch(() => [] as TeamSummary[]),
      cloudApi.listMembers(orgId).catch(() => [] as MemberSummary[]),
    ]).then(([t, m]) => {
      setTeams(t);
      setPeople(m);
    });
  }, [open, access, orgId]);

  async function save() {
    setBusy(true);
    const next: NotebookAccess = {
      mode: accessMode,
      teamIds: accessMode === "restricted" ? teamIds : [],
      userIds: accessMode === "restricted" ? userIds : [],
    };
    try {
      const updated = await cloudApi.patchNotebook(orgId, notebookId, { access: next });
      setNotebookSummary(
        notebookSummary
          ? { ...notebookSummary, ...updated, access: next }
          : notebookSummary
      );
      refresh();
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

  return (
    <Dialog isOpen={open} onClose={onClose} title="Share notebook" wide>
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
