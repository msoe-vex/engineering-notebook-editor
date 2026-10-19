"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Alert, Button } from "@/components/ui";
import { showNotification } from "@/components/overlays/Notification";
import {
  cloudApi,
  type MemberSummary,
  type NotebookAccess,
  type NotebookSummary,
  type TeamSummary,
} from "@/lib/cloud/api";
import { AccessAllowlistPicker } from "./AccessAllowlistPicker";

export type CreateNotebookDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  teams?: TeamSummary[];
  members?: MemberSummary[];
  onCreated?: (notebook: NotebookSummary) => void;
};

/**
 * Dialog to create a new notebook with permissions / access controls configured up front.
 */
export function CreateNotebookDialog({
  isOpen,
  onClose,
  orgId,
  teams: propTeams,
  members: propMembers,
  onCreated,
}: CreateNotebookDialogProps) {
  const [name, setName] = useState("Competition Notebook");
  const [accessMode, setAccessMode] = useState<"org" | "restricted">("org");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [teamsList, setTeamsList] = useState<TeamSummary[]>([]);
  const [peopleList, setPeopleList] = useState<MemberSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setName("Competition Notebook");
    setAccessMode("org");
    setTeamIds([]);
    setUserIds([]);
    setError(null);

    let cancelled = false;
    if (propTeams && propMembers) {
      setTeamsList(propTeams);
      setPeopleList(propMembers);
    } else {
      void Promise.all([
        cloudApi.listTeams(orgId).catch(() => [] as TeamSummary[]),
        cloudApi.listMembers(orgId).catch(() => [] as MemberSummary[]),
      ]).then(([t, m]) => {
        if (!cancelled) {
          setTeamsList(t);
          setPeopleList(m);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [isOpen, orgId, propTeams, propMembers]);

  async function handleCreate(e?: FormEvent) {
    if (e) e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setBusy(true);
    setError(null);

    const access: NotebookAccess = {
      mode: accessMode,
      teamIds: accessMode === "restricted" ? teamIds : [],
      userIds: accessMode === "restricted" ? userIds : [],
    };

    try {
      const created = await cloudApi.createNotebook(orgId, {
        name: trimmed,
        title: trimmed,
        access,
      });
      showNotification("Notebook created", "success");
      onCreated?.(created);
      onClose();
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      showNotification(message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Create notebook" wide>
      <form onSubmit={(e) => void handleCreate(e)} className="flex flex-col gap-5">
        {error && <Alert variant="error">{error}</Alert>}

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="create-notebook-name"
            className="text-nb-label font-medium text-nb-on-surface"
          >
            Notebook name
          </label>
          <input
            id="create-notebook-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Competition Notebook"
            autoFocus
            className="w-full rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface px-3 py-2 text-nb-body text-nb-on-surface outline-none transition-colors focus:border-nb-primary"
          />
        </div>

        <div className="flex flex-col gap-2.5 rounded-nb-xl border border-nb-outline-variant/20 bg-nb-surface-low/30 p-4">
          <div>
            <h4 className="text-nb-label font-semibold text-nb-on-surface">
              Permissions & access
            </h4>
            <p className="mt-0.5 text-nb-caption text-nb-on-surface-variant">
              Organization owners and admins can always open every notebook. Choose who else can
              access this notebook.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant={accessMode === "org" ? "primary" : "secondary"}
              onClick={() => setAccessMode("org")}
            >
              Entire organization
            </Button>
            <Button
              type="button"
              size="sm"
              variant={accessMode === "restricted" ? "primary" : "secondary"}
              onClick={() => setAccessMode("restricted")}
            >
              Restricted
            </Button>
          </div>

          {accessMode === "restricted" && (
            <div className="mt-2 pt-2 border-t border-nb-outline-variant/15">
              <AccessAllowlistPicker
                teams={teamsList}
                people={peopleList}
                teamIds={teamIds}
                userIds={userIds}
                onTeamIdsChange={setTeamIds}
                onUserIdsChange={setUserIds}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" size="sm" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            variant="primary"
            disabled={busy || !name.trim()}
          >
            {busy ? "Creating…" : "Create notebook"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

