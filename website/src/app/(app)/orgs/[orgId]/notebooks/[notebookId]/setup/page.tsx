"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ImagePlus } from "lucide-react";
import { AccessAllowlistPicker } from "@/components/cloud/AccessAllowlistPicker";
import { NotebookPhasesEditor } from "@/components/cloud/NotebookPhasesEditor";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
import { SettingsPageSkeleton } from "@/components/cloud/notebookPageSkeletons";
import { showNotification } from "@/components/overlays/Notification";
import { Button, TextField } from "@/components/ui";
import {
  cloudApi,
  type MemberSummary,
  type NotebookAccess,
  type TeamSummary,
} from "@/lib/cloud/api";
import {
  NOTEBOOK_SCHEMA_VERSION,
  type ProjectPhase,
} from "@engineering-notebook/shared";

export default function NotebookSetupPage() {
  const {
    orgId,
    notebookId,
    notebookSummary,
    initialLoaded,
    canManage,
    refresh,
    setError,
    setNotebookSummary,
  } = useNotebookWorkspace();
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [name, setName] = useState("");
  const [logoAssetId, setLogoAssetId] = useState<string | undefined>();
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [phases, setPhases] = useState<Record<string, ProjectPhase>>({});
  const [accessMode, setAccessMode] = useState<"org" | "restricted">("org");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [people, setPeople] = useState<MemberSummary[]>([]);
  const [aclListsLoaded, setAclListsLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(notebookSummary?.title || notebookSummary?.name || "");
    setSubtitle(notebookSummary?.subtitle || "");
    setName(notebookSummary?.name || "");
    setLogoAssetId(notebookSummary?.logoAssetId);
    setPhases((notebookSummary?.phases as Record<string, ProjectPhase>) || {});
    const access = notebookSummary?.access;
    setAccessMode(access?.mode === "restricted" ? "restricted" : "org");
    setTeamIds(access?.teamIds ?? []);
    setUserIds(access?.userIds ?? []);
  }, [notebookSummary]);

  const initialTitle = notebookSummary?.title || notebookSummary?.name || "";
  const initialSubtitle = notebookSummary?.subtitle || "";
  const initialName = notebookSummary?.name || "";
  const initialLogoAssetId = notebookSummary?.logoAssetId;
  const initialPhases = useMemo(
    () => (notebookSummary?.phases as Record<string, ProjectPhase>) || {},
    [notebookSummary?.phases]
  );
  const initialAccess = notebookSummary?.access;
  const initialAccessMode = initialAccess?.mode === "restricted" ? "restricted" : "org";
  const initialTeamIds = useMemo(() => initialAccess?.teamIds ?? [], [initialAccess?.teamIds]);
  const initialUserIds = useMemo(() => initialAccess?.userIds ?? [], [initialAccess?.userIds]);

  const isDirty = useMemo(() => {
    if (!notebookSummary) return false;
    if (title !== initialTitle) return true;
    if (subtitle !== initialSubtitle) return true;
    if (name !== initialName) return true;
    if (logoAssetId !== initialLogoAssetId) return true;
    if (JSON.stringify(phases) !== JSON.stringify(initialPhases)) return true;
    if (accessMode !== initialAccessMode) return true;
    if (JSON.stringify([...teamIds].sort()) !== JSON.stringify([...initialTeamIds].sort())) return true;
    if (JSON.stringify([...userIds].sort()) !== JSON.stringify([...initialUserIds].sort())) return true;
    return false;
  }, [
    notebookSummary,
    title,
    initialTitle,
    subtitle,
    initialSubtitle,
    name,
    initialName,
    logoAssetId,
    initialLogoAssetId,
    phases,
    initialPhases,
    accessMode,
    initialAccessMode,
    teamIds,
    initialTeamIds,
    userIds,
    initialUserIds,
  ]);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!logoAssetId) {
      setLogoPreview(null);
      return;
    }
    let cancelled = false;
    void cloudApi
      .getAssetUrl(orgId, notebookId, logoAssetId)
      .then((r) => {
        if (!cancelled) setLogoPreview(r.url);
      })
      .catch(() => {
        if (!cancelled) setLogoPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, notebookId, logoAssetId]);

  useEffect(() => {
    setAclListsLoaded(false);
    void Promise.all([
      cloudApi.listTeams(orgId).catch(() => [] as TeamSummary[]),
      cloudApi.listMembers(orgId).catch(() => [] as MemberSummary[]),
    ]).then(([t, m]) => {
      setTeams(t);
      setPeople(m);
      setAclListsLoaded(true);
    });
  }, [orgId]);

  async function uploadLogo(file: File) {
    setBusy(true);
    setError(null);
    try {
      const { asset } = await cloudApi.createAsset(orgId, notebookId, {
        contentType: file.type || "image/png",
        byteSize: file.size,
      });
      await cloudApi.uploadAssetContent(
        orgId,
        notebookId,
        asset.id,
        file,
        file.type || "image/png"
      );
      setLogoAssetId(asset.id);
      setLogoPreview(URL.createObjectURL(file));
      showNotification("Logo uploaded", "success");
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      showNotification(message, "error");
    } finally {
      setBusy(false);
    }
  }

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
      const payload: Record<string, unknown> = {
        name: name.trim() || title.trim() || "Untitled Notebook",
        title: title.trim() || name.trim(),
        subtitle: subtitle.trim() || undefined,
        logoAssetId: logoAssetId || undefined,
        phases,
      };
      if (canManage) {
        payload.access = access;
      }
      const updated = await cloudApi.patchNotebook(orgId, notebookId, payload);
      setNotebookSummary({
        ...(notebookSummary || {
          schemaVersion: NOTEBOOK_SCHEMA_VERSION,
          orgId,
          name: updated.name,
          folders: {},
          updatedAt: new Date().toISOString(),
        }),
        ...updated,
        phases,
        logoAssetId,
        access,
      });
      setSaved(true);
      refresh();
      showNotification("Settings saved", "success");
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      showNotification(message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (!initialLoaded || !aclListsLoaded || !notebookSummary) {
    return <SettingsPageSkeleton />;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-nb-display font-bold tracking-tight">Settings</h1>
          <p className="mt-1 text-nb-body text-nb-on-surface-variant">
            Notebook branding, design phases, and who can open this notebook.
          </p>
        </div>
        {isDirty && (
          <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-nb-caption font-semibold text-amber-700 dark:text-amber-400">
            Unsaved changes
          </span>
        )}
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-nb-title font-semibold">Branding</h2>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-nb-xl border border-nb-outline-variant/30 bg-nb-surface-low">
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreview} alt="Notebook logo" className="h-full w-full object-contain" />
            ) : (
              <ImagePlus size={22} className="text-nb-on-surface-variant/50" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => logoInputRef.current?.click()}
            >
              Upload logo
            </Button>
            {logoAssetId && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setLogoAssetId(undefined);
                  setLogoPreview(null);
                }}
              >
                Remove logo
              </Button>
            )}
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void uploadLogo(file);
              }}
            />
          </div>
        </div>
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

      <section>
        <NotebookPhasesEditor value={phases} onChange={setPhases} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-nb-title font-semibold">Access</h2>
        <p className="text-nb-body text-nb-on-surface-variant">
          Organization owners and admins can always open every notebook. This controls who else
          can open it — not the credits list on the Contributors page.
        </p>
        {!canManage ? (
          <div className="rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface-low/50 p-3 text-nb-label text-nb-on-surface-variant">
            Current mode:{" "}
            <strong className="text-nb-on-surface">
              {accessMode === "org" ? "Entire organization" : "Restricted"}
            </strong>
            . Only organization admins and owners can modify notebook access permissions.
          </div>
        ) : (
          <>
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
              <div className="rounded-nb-xl border border-nb-outline-variant/30 p-4">
                <AccessAllowlistPicker
                  teams={teams}
                  people={people}
                  teamIds={teamIds}
                  userIds={userIds}
                  onTeamIdsChange={setTeamIds}
                  onUserIdsChange={setUserIds}
                />
                {!teams.length && !people.length && (
                  <p className="mt-2 text-nb-caption text-nb-on-surface-variant">
                    No teams or people yet. Create teams or invite people under the organization.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={busy || !isDirty} onClick={() => void save()}>
          {busy ? "Saving…" : "Save settings"}
        </Button>
        {saved && !isDirty && (
          <span className="text-nb-label text-nb-success flex items-center gap-1 font-medium">
            <Check size={14} /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
