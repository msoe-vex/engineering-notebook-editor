"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Trash2 } from "lucide-react";
import { NotebookAccessFields } from "@/components/cloud/NotebookAccessFields";
import { NotebookPhasesEditor } from "@/components/cloud/NotebookPhasesEditor";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
import { SettingsPageSkeleton } from "@/components/cloud/notebookPageSkeletons";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import { showNotification } from "@/components/overlays/Notification";
import { Button, FormSection, ImageField, TabNav, TextField } from "@/components/ui";
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

type SetupTab = "general" | "access" | "danger";

export default function NotebookSetupPage() {
  const {
    orgId,
    notebookId,
    notebookSummary,
    isArchived,
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
  const router = useRouter();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showUnarchiveConfirm, setShowUnarchiveConfirm] = useState(false);
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const [tab, setTab] = useState<SetupTab>("general");


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

    const handleClickCapture = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || href.startsWith("#") || target.target === "_blank") return;

      if (href !== window.location.pathname) {
        e.preventDefault();
        e.stopPropagation();
        setLeaveHref(href);
      }
    };
    document.addEventListener("click", handleClickCapture, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClickCapture, true);
    };
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

  const showSave = tab === "general" || tab === "access";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-nb-display font-bold tracking-tight">Settings</h1>
        <div className="flex flex-wrap items-center gap-3">
          {isDirty && (
            <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-nb-caption font-semibold text-amber-700 dark:text-amber-400">
              Unsaved changes
            </span>
          )}
          {showSave && (
            <>
              <Button variant="primary" disabled={busy || !isDirty || isArchived} onClick={() => void save()}>
                {busy ? "Saving…" : "Save settings"}
              </Button>
              {saved && !isDirty && (
                <span className="text-nb-label text-nb-success flex items-center gap-1 font-medium">
                  <Check size={14} /> Saved
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {isArchived && (
        <div className="rounded-nb-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-medium text-amber-900 dark:text-amber-200">
          This notebook is archived and read-only.
        </div>
      )}

      <TabNav
        activeId={tab}
        onSelect={(id) => setTab(id as SetupTab)}
        items={[
          { id: "general", label: "General" },
          { id: "access", label: "Access" },
          ...(canManage ? [{ id: "danger", label: "Archive / Delete" }] : []),
        ]}
      />

      <div className="min-h-[28rem]">

      {tab === "general" && (
        <>
          <FormSection title="Branding">
            <ImageField
              size="lg"
              previewUrl={logoPreview}
              busy={busy}
              disabled={isArchived}
              onUpload={(file) => void uploadLogo(file)}
              onRemove={
                logoAssetId
                  ? () => {
                      setLogoAssetId(undefined);
                      setLogoPreview(null);
                    }
                  : undefined
              }
              uploadLabel="Upload logo"
              replaceLabel="Replace logo"
              emptyLabel="Logo"
            />
            <TextField
              label="Display title"
              value={title}
              disabled={isArchived}
              onChange={(e) => setTitle(e.target.value)}
            />
            <TextField
              label="Subtitle"
              value={subtitle}
              disabled={isArchived}
              onChange={(e) => setSubtitle(e.target.value)}
            />
            <TextField
              label="Short name"
              value={name}
              disabled={isArchived}
              onChange={(e) => setName(e.target.value)}
            />
          </FormSection>

          <section className={isArchived ? "pointer-events-none opacity-60" : ""}>
            <NotebookPhasesEditor value={phases} onChange={setPhases} />
          </section>
        </>
      )}

      {tab === "access" && (
        <FormSection title="Access">
          {!canManage ? (
            <div className="rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface-low/50 p-3 text-nb-label text-nb-on-surface-variant">
              Current mode:{" "}
              <strong className="text-nb-on-surface">
                {accessMode === "org" ? "Entire organization" : "Restricted"}
              </strong>
              . Only organization admins and owners can modify notebook access.
            </div>
          ) : (
            <div className={isArchived ? "pointer-events-none opacity-60" : undefined}>
              <NotebookAccessFields
                accessMode={accessMode}
                onAccessModeChange={setAccessMode}
                teams={teams}
                people={people}
                teamIds={teamIds}
                userIds={userIds}
                onTeamIdsChange={setTeamIds}
                onUserIdsChange={setUserIds}
                disabled={isArchived}
              />
              {accessMode === "restricted" && !teams.length && !people.length && (
                <p className="mt-2 text-nb-caption text-nb-on-surface-variant">
                  No teams or people yet.
                </p>
              )}
            </div>
          )}
        </FormSection>
      )}

      {tab === "danger" && canManage && (
        <>
          <section className="flex flex-col gap-4 rounded-nb-xl border border-amber-500/30 bg-amber-500/5 p-5">
            <div>
              <h2 className="text-nb-title font-semibold text-amber-800 dark:text-amber-400">
                {isArchived ? "Unarchive" : "Archive"}
              </h2>
              <p className="mt-1 text-nb-body text-nb-on-surface-variant">
                {isArchived
                  ? "Restore write access for members."
                  : "Make this notebook read-only. Admins can unarchive later."}
              </p>
            </div>
            <div>
              {isArchived ? (
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => setShowUnarchiveConfirm(true)}
                >
                  Unarchive
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setShowArchiveConfirm(true)}
                  className="border-amber-500/40 text-amber-800 dark:text-amber-300 hover:bg-amber-500/10"
                >
                  Archive
                </Button>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-nb-xl border border-nb-danger/30 bg-nb-danger/5 p-5">
            <div>
              <h2 className="text-nb-title font-semibold text-nb-danger">Delete</h2>
              <p className="mt-1 text-nb-body text-nb-on-surface-variant">
                Permanently delete this notebook and all of its contents.
              </p>
            </div>
            <div>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => setShowDeleteConfirm(true)}
                className="border-0 bg-nb-danger text-white hover:bg-nb-danger-dim"
              >
                <Trash2 size={16} className="mr-1.5" />
                Delete notebook
              </Button>
            </div>
          </section>
        </>
      )}

      </div>

      <ConfirmationDialog
        isOpen={showArchiveConfirm}
        title="Archive notebook?"
        message={`Archiving "${notebookSummary.name}" makes it read-only. Members will not be able to modify entries or settings until it is unarchived.`}
        variant="warning"
        confirmText={notebookSummary.name}
        confirmTextPlaceholder={notebookSummary.name}
        onConfirm={async () => {
          setShowArchiveConfirm(false);
          setBusy(true);
          try {
            await cloudApi.archiveNotebook(orgId, notebookId);
            showNotification("Notebook archived", "success");
            refresh();
          } catch (err) {
            const message = (err as Error).message;
            setError(message);
            showNotification(message, "error");
          } finally {
            setBusy(false);
          }
        }}
        onCancel={() => setShowArchiveConfirm(false)}
      />

      <ConfirmationDialog
        isOpen={showUnarchiveConfirm}
        title="Unarchive notebook?"
        message={`Unarchiving "${notebookSummary.name}" will restore write access for members.`}
        variant="info"
        onConfirm={async () => {
          setShowUnarchiveConfirm(false);
          setBusy(true);
          try {
            await cloudApi.unarchiveNotebook(orgId, notebookId);
            showNotification("Notebook unarchived", "success");
            refresh();
          } catch (err) {
            const message = (err as Error).message;
            setError(message);
            showNotification(message, "error");
          } finally {
            setBusy(false);
          }
        }}
        onCancel={() => setShowUnarchiveConfirm(false)}
      />

      <ConfirmationDialog
        isOpen={showDeleteConfirm}
        title="Delete notebook?"
        message={`This will permanently delete "${notebookSummary.name}" and all of its contents. This cannot be undone.`}
        variant="danger"
        confirmText={notebookSummary.name}
        confirmTextPlaceholder={notebookSummary.name}
        onConfirm={async () => {
          setShowDeleteConfirm(false);
          setBusy(true);
          try {
            await cloudApi.deleteNotebook(orgId, notebookId);
            showNotification("Notebook deleted", "success");
            router.push(`/org/${orgId}`);
          } catch (err) {
            const message = (err as Error).message;
            setError(message);
            showNotification(message, "error");
            setBusy(false);
          }
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <ConfirmationDialog
        isOpen={Boolean(leaveHref)}
        title="Leave without saving?"
        message="You have unsaved changes. Leave this page anyway?"
        variant="warning"
        confirmLabel="Leave"
        onConfirm={() => {
          const href = leaveHref;
          setLeaveHref(null);
          if (href) router.push(href);
        }}
        onCancel={() => setLeaveHref(null)}
      />
    </div>
  );
}
