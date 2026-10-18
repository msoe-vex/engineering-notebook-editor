"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui";
import { showNotification } from "@/components/overlays/Notification";
import {
  cloudApi,
  type MemberSummary,
  type NotebookAccess,
  type TeamSummary,
} from "@/lib/cloud/api";
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
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAccessMode(access?.mode === "restricted" ? "restricted" : "org");
    setTeamIds(access?.teamIds || []);
    setUserIds(access?.userIds || []);
    setQuery("");
    void Promise.all([
      cloudApi.listTeams(orgId).catch(() => [] as TeamSummary[]),
      cloudApi.listMembers(orgId).catch(() => [] as MemberSummary[]),
    ]).then(([t, m]) => {
      setTeams(t);
      setPeople(m);
    });
  }, [open, access, orgId]);

  const q = query.trim().toLowerCase();
  const filteredTeams = useMemo(
    () => teams.filter((t) => !q || t.name.toLowerCase().includes(q)),
    [teams, q]
  );
  const filteredPeople = useMemo(
    () =>
      people.filter(
        (p) =>
          !q ||
          (p.email || "").toLowerCase().includes(q) ||
          p.uid.toLowerCase().includes(q)
      ),
    [people, q]
  );

  const selectedTeams = teams.filter((t) => teamIds.includes(t.id));
  const selectedPeople = people.filter((p) => userIds.includes(p.uid));

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
          <>
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-nb-on-surface-variant/60"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people or teams"
                className="w-full rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface py-2 pr-3 pl-8 text-nb-label outline-none focus:border-nb-primary"
              />
            </div>

            {(selectedTeams.length > 0 || selectedPeople.length > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {selectedTeams.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-nb-outline-variant/40 bg-nb-surface-low px-2 py-0.5 text-[11px] font-medium"
                    onClick={() => setTeamIds((prev) => prev.filter((id) => id !== t.id))}
                  >
                    Team: {t.name}
                    <X size={12} />
                  </button>
                ))}
                {selectedPeople.map((p) => (
                  <button
                    key={p.uid}
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-nb-outline-variant/40 bg-nb-surface-low px-2 py-0.5 text-[11px] font-medium"
                    onClick={() => setUserIds((prev) => prev.filter((id) => id !== p.uid))}
                  >
                    {p.email || p.uid}
                    <X size={12} />
                  </button>
                ))}
              </div>
            )}

            <div className="grid max-h-48 gap-3 overflow-auto rounded-nb-xl border border-nb-outline-variant/30 p-3 sm:max-h-64 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 text-nb-caption font-semibold text-nb-on-surface-variant">
                  Teams
                </h3>
                <div className="flex flex-col gap-1.5">
                  {filteredTeams.map((t) => {
                    const on = teamIds.includes(t.id);
                    return (
                      <label key={t.id} className="flex items-center gap-2 text-nb-label">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setTeamIds((prev) =>
                              on ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                            )
                          }
                        />
                        {t.name}
                      </label>
                    );
                  })}
                  {!filteredTeams.length && (
                    <p className="text-nb-caption text-nb-on-surface-variant/60">No teams</p>
                  )}
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-nb-caption font-semibold text-nb-on-surface-variant">
                  People
                </h3>
                <div className="flex flex-col gap-1.5">
                  {filteredPeople.map((p) => {
                    const on = userIds.includes(p.uid);
                    return (
                      <label key={p.uid} className="flex items-center gap-2 text-nb-label">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setUserIds((prev) =>
                              on ? prev.filter((id) => id !== p.uid) : [...prev, p.uid]
                            )
                          }
                        />
                        {p.email || p.uid}
                      </label>
                    );
                  })}
                  {!filteredPeople.length && (
                    <p className="text-nb-caption text-nb-on-surface-variant/60">No people</p>
                  )}
                </div>
              </div>
            </div>
          </>
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
