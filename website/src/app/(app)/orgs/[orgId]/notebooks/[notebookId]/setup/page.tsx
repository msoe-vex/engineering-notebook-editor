"use client";

import { useEffect, useState } from "react";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
import { Button, TextField } from "@/components/ui";
import {
  cloudApi,
  type MemberSummary,
  type NotebookAccess,
  type TeamSummary,
} from "@/lib/cloud/api";

export default function NotebookSetupPage() {
  const { orgId, notebookId, notebookSummary, refresh, setError } = useNotebookWorkspace();
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [name, setName] = useState("");
  const [accessMode, setAccessMode] = useState<"org" | "restricted">("org");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [people, setPeople] = useState<MemberSummary[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTitle(notebookSummary?.title || notebookSummary?.name || "");
    setSubtitle(notebookSummary?.subtitle || "");
    setName(notebookSummary?.name || "");
    const access = notebookSummary?.access;
    setAccessMode(access?.mode === "restricted" ? "restricted" : "org");
    setTeamIds(access?.teamIds ?? []);
    setUserIds(access?.userIds ?? []);
  }, [notebookSummary]);

  useEffect(() => {
    void Promise.all([
      cloudApi.listTeams(orgId).catch(() => [] as TeamSummary[]),
      cloudApi.listMembers(orgId).catch(() => [] as MemberSummary[]),
    ]).then(([t, m]) => {
      setTeams(t);
      setPeople(m);
    });
  }, [orgId]);

  async function save() {
    setBusy(true);
    setSaved(false);
    setError(null);
    const access: NotebookAccess = {
      mode: accessMode,
      teamIds: accessMode === "restricted" ? teamIds : [],
      userIds: accessMode === "restricted" ? userIds : [],
    };
    try {
      await cloudApi.patchNotebook(orgId, notebookId, {
        name: name.trim() || title.trim() || "Untitled Notebook",
        title: title.trim() || name.trim(),
        subtitle: subtitle.trim() || undefined,
        access,
      });
      setSaved(true);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-nb-display font-bold tracking-tight">Setup</h1>
        <p className="mt-1 text-nb-body text-nb-on-surface-variant">
          Notebook branding and who can open this notebook.
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-nb-title font-semibold">Branding</h2>
        <TextField label="Display title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextField
          label="Subtitle"
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
        />
        <TextField
          label="Internal name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-nb-title font-semibold">Access</h2>
        <p className="text-nb-body text-nb-on-surface-variant">
          Organization owners and admins can always open every notebook.
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
          <div className="grid gap-4 rounded-nb-xl border border-nb-outline-variant/30 p-4">
            <div>
              <h3 className="mb-2 text-nb-label font-semibold">Teams</h3>
              <div className="flex flex-col gap-2">
                {teams.map((t) => {
                  const on = teamIds.includes(t.id);
                  return (
                    <label key={t.id} className="flex items-center gap-2 text-nb-body">
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
                {!teams.length && (
                  <p className="text-nb-caption text-nb-on-surface-variant">
                    No teams yet. Create teams under the organization.
                  </p>
                )}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-nb-label font-semibold">People</h3>
              <div className="flex flex-col gap-2">
                {people.map((p) => {
                  const on = userIds.includes(p.uid);
                  return (
                    <label key={p.uid} className="flex items-center gap-2 text-nb-body">
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
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={busy} onClick={() => void save()}>
          Save setup
        </Button>
        {saved && <span className="text-nb-label text-nb-success">Saved</span>}
      </div>
    </div>
  );
}
