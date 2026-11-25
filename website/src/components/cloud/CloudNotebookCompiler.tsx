"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Copy,
  Download,
  ExternalLink,
  Link2,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
import { NotebookSideRail } from "@/components/cloud/NotebookSideRail";
import { CompilePageSkeleton } from "@/components/cloud/notebookPageSkeletons";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import { Alert, Button, IconButton, Skeleton, TabNav, TextField } from "@/components/ui";
import { showNotification } from "@/components/overlays/Notification";
import {
  cloudApi,
  type CompileExportSummary,
  type NotebookShareLinkSummary,
} from "@/lib/cloud/api";
import { compileCloudNotebook } from "@/lib/cloud/compileCloudNotebook";
import { subscribeNotebookEvents } from "@/lib/cloud/notebookEvents";
import { trackNotebookJobToast, dismissNotebookJobToast } from "@/hooks/useNotebookJobToasts";
import { MAX_COMPILE_EXPORTS } from "@engineering-notebook/shared";

const LatexPreview = dynamic(() => import("@/components/editor/LatexPreview"), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-0 w-full" />,
});

const allowBusyTex =
  process.env.NEXT_PUBLIC_ALLOW_BUSYTEX_COMPILE === "1" ||
  process.env.NEXT_PUBLIC_ALLOW_BUSYTEX_COMPILE === "true";

function formatExportLabel(exp: CompileExportSummary) {
  if (exp.label?.trim()) return exp.label.trim();
  if (exp.createdAt) {
    try {
      return new Date(exp.createdAt).toLocaleString();
    } catch {
      return exp.createdAt;
    }
  }
  return exp.id.slice(0, 8);
}

type RailTab = "preview" | "saved" | "links";

export function CloudNotebookCompiler() {
  const {
    orgId,
    notebookId,
    entries,
    notebookSummary,
    refresh,
    setError,
    setNotebookSummary,
    isArchived,
    canManage,
    showPrompt,
  } = useNotebookWorkspace();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfProbeDone, setPdfProbeDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string | null>(null);
  const [exportsList, setExportsList] = useState<CompileExportSummary[]>([]);
  const [shareLinks, setShareLinks] = useState<NotebookShareLinkSummary[]>([]);
  const [selectedExportId, setSelectedExportId] = useState<string>("latest");
  const [latestExportId, setLatestExportId] = useState<string | null>(null);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [railTab, setRailTab] = useState<RailTab>("preview");
  const [publishBusy, setPublishBusy] = useState(false);
  const [deleteExportId, setDeleteExportId] = useState<string | null>(null);
  const [revokeLinkId, setRevokeLinkId] = useState<string | null>(null);
  const [renamingExportId, setRenamingExportId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newLinkName, setNewLinkName] = useState("");
  const [newLinkExportId, setNewLinkExportId] = useState("");
  const [newLinkVisibility, setNewLinkVisibility] = useState<"unlisted" | "public">("unlisted");
  const [showCreateLink, setShowCreateLink] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  const jobIdRef = useRef<string | null>(null);

  const loadExports = useCallback(
    async (preferId?: string) => {
      try {
        const res = await cloudApi.listCompileExports(orgId, notebookId);
        setExportsList(res.exports || []);
        setLatestExportId(res.latestExportId || null);
        const list = res.exports || [];
        const prefer =
          (preferId && preferId !== "latest" && list.some((e) => e.id === preferId) && preferId) ||
          res.latestExportId ||
          list[0]?.id ||
          "latest";
        setSelectedExportId(prefer);
        return prefer;
      } catch {
        setExportsList([]);
        return "latest";
      }
    },
    [orgId, notebookId]
  );

  const loadShareLinks = useCallback(async () => {
    try {
      const res = await cloudApi.listShareLinks(orgId, notebookId);
      setShareLinks(res.links || []);
    } catch {
      setShareLinks([]);
    }
  }, [orgId, notebookId]);

  const loadPdf = useCallback(
    async (exportId: string) => {
      try {
        const blob = await cloudApi.downloadExportPdfBlob(orgId, notebookId, exportId);
        const objectUrl = URL.createObjectURL(blob);
        setPdfUrl((prev) => {
          if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
          return objectUrl;
        });
      } catch {
        setPdfUrl(null);
      }
    },
    [orgId, notebookId]
  );

  useEffect(() => {
    void cloudApi
      .getOrg(orgId)
      .then((o) => setOrgSlug(o.slug || null))
      .catch(() => setOrgSlug(null));
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;
    setPdfProbeDone(false);
    void (async () => {
      const id = await loadExports();
      if (cancelled) return;
      await Promise.all([loadPdf(id), loadShareLinks()]);
      if (!cancelled) setPdfProbeDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, notebookId, loadExports, loadPdf, loadShareLinks]);

  useEffect(() => {
    if (!pdfProbeDone) return;
    void loadPdf(selectedExportId);
  }, [selectedExportId, pdfProbeDone, loadPdf]);

  useEffect(() => {
    if (!newLinkExportId && (latestExportId || exportsList[0]?.id)) {
      setNewLinkExportId(latestExportId || exportsList[0]?.id || "");
    }
  }, [latestExportId, exportsList, newLinkExportId]);

  if (!pdfProbeDone) {
    return <CompilePageSkeleton />;
  }

  async function runBusyTexEscape() {
    if (!allowBusyTex) {
      throw new Error(
        process.env.NODE_ENV === "development"
          ? "Server compile unavailable. Start Compose `compile`, or set NEXT_PUBLIC_ALLOW_BUSYTEX_COMPILE=1 for a local escape hatch."
          : "Couldn't compile right now. Try again in a moment."
      );
    }
    setStatus("Compiling in browser…");
    const result = await compileCloudNotebook({
      orgId,
      notebookId,
      entries,
      notebookSummary,
      onStatus: (s, _step, _total, pct) => {
        setStatus(s);
        setProgress(pct);
      },
    });
    if (result.success && result.pdfUrl) {
      setPdfUrl((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return result.pdfUrl!;
      });
      if (result.exportId && result.exportId !== "latest" && notebookSummary) {
        setNotebookSummary({
          ...notebookSummary,
          latestExportId: result.exportId,
        });
      }
      setSelectedExportId(result.exportId || "latest");
      await loadExports(result.exportId || "latest");
      await loadPdf(result.exportId || "latest");
      refresh();
    } else {
      setLog(result.log || "Compilation failed.");
      setError("Compilation failed. See log below.");
    }
  }

  async function runServerCompile(jobId: string) {
    jobIdRef.current = jobId;
    setStatus("Queued…");
    setProgress(5);

    await new Promise<void>((resolve, reject) => {
      const ac = new AbortController();
      const timeout = setTimeout(
        () => {
          ac.abort();
          reject(new Error("Compile timed out (10 minutes)."));
        },
        10 * 60 * 1000
      );

      subscribeNotebookEvents(
        orgId,
        notebookId,
        (event) => {
          if (event.type === "job.progress") {
            if (event.jobType && event.jobType !== "compile") return;
            if (jobIdRef.current && event.jobId !== jobIdRef.current) return;
            const line = (event.status || event.detail || "Working…").trim();
            setStatus(line);
            setProgress(event.progress ?? 0);
            return;
          }
          if (event.type === "job.done") {
            if (event.jobType && event.jobType !== "compile") return;
            if (jobIdRef.current && event.jobId !== jobIdRef.current) return;
            clearTimeout(timeout);
            ac.abort();
            const exportId = event.result?.exportId
              ? String(event.result.exportId)
              : undefined;
            if (notebookSummary && exportId && exportId !== "latest") {
              setNotebookSummary({
                ...notebookSummary,
                latestExportId: exportId,
              });
            }
            setSelectedExportId(exportId || "latest");
            void loadExports(exportId || "latest").then(() => {
              void loadPdf(exportId || "latest");
              refresh();
            });
            resolve();
            return;
          }
          if (event.type === "job.failed") {
            if (event.jobType && event.jobType !== "compile") return;
            if (jobIdRef.current && event.jobId !== jobIdRef.current) return;
            clearTimeout(timeout);
            ac.abort();
            reject(new Error(event.error || "Compile failed"));
          }
        },
        ac.signal
      );
    });
  }

  async function runCompile() {
    if (busy || isArchived) return;
    setBusy(true);
    setLog(null);
    setStatus("Starting…");
    setProgress(0);
    setError(null);
    jobIdRef.current = null;
    try {
      const enqueued = await cloudApi.startCompile(orgId, notebookId);
      trackNotebookJobToast({
        jobId: enqueued.jobId,
        label: "Compiling notebook…",
        successLabel: "Compile finished",
        kind: "compile",
      });
      await runServerCompile(enqueued.jobId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dismissNotebookJobToast({ kind: "compile", error: message });
      if (allowBusyTex && /compile_service_unavailable|503|not configured/i.test(message)) {
        try {
          await runBusyTexEscape();
          return;
        } catch (fallbackErr) {
          setError((fallbackErr as Error).message);
          setLog(String((fallbackErr as Error).message));
          return;
        }
      }
      setError(message);
      setLog(message);
    } finally {
      setBusy(false);
      setStatus("");
      setProgress(0);
      jobIdRef.current = null;
    }
  }

  async function handleSaveVersion() {
    if (savingVersion || isArchived) return;
    if (exportsList.length >= MAX_COMPILE_EXPORTS) {
      showNotification(
        `Version limit reached (${MAX_COMPILE_EXPORTS}). Delete an older version to save a new one.`,
        "error"
      );
      return;
    }
    const defaultLabel = new Date().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    showPrompt("Save version label (optional)", defaultLabel, (label) => {
      setSavingVersion(true);
      const chosen = label?.trim() || defaultLabel;
      void cloudApi
        .saveCompileExport(orgId, notebookId, { label: chosen })
        .then(async (res) => {
          showNotification("Saved version created", "success");
          setRailTab("saved");
          setSelectedExportId(res.export.id);
          await loadExports(res.export.id);
          await loadPdf(res.export.id);
          refresh();
        })
        .catch((err) => {
          showNotification((err as Error).message, "error");
        })
        .finally(() => {
          setSavingVersion(false);
        });
    });
  }

  async function saveExportLabel(exportId: string, label: string) {
    if (!canManage || publishBusy || isArchived) return;
    setPublishBusy(true);
    try {
      const updated = await cloudApi.patchCompileExport(orgId, notebookId, exportId, {
        label: label.trim() || null,
      });
      setExportsList((prev) =>
        prev.map((e) => (e.id === exportId ? { ...e, label: updated.label } : e))
      );
      setRenamingExportId(null);
      showNotification("Version renamed", "success");
    } catch (err) {
      showNotification((err as Error).message, "error");
    } finally {
      setPublishBusy(false);
    }
  }

  async function createLink() {
    if (!canManage || publishBusy || isArchived) return;
    const exportId = newLinkExportId || latestExportId || exportsList[0]?.id;
    if (!exportId) {
      showNotification("Compile a version first", "error");
      return;
    }
    if (!orgSlug) {
      showNotification("Set an org slug in settings first", "error");
      return;
    }
    setPublishBusy(true);
    try {
      await cloudApi.createShareLink(orgId, notebookId, {
        name: newLinkName.trim() || "Share link",
        exportId,
        visibility: newLinkVisibility,
      });
      setNewLinkName("");
      setNewLinkVisibility("unlisted");
      setShowCreateLink(false);
      await loadShareLinks();
      showNotification("Share link created", "success");
      refresh();
    } catch (err) {
      showNotification((err as Error).message, "error");
    } finally {
      setPublishBusy(false);
    }
  }

  async function rebindLink(
    linkId: string,
    patch: { exportId?: string; visibility?: "unlisted" | "public" }
  ) {
    if (!canManage || publishBusy || isArchived) return;
    setPublishBusy(true);
    try {
      await cloudApi.patchShareLink(orgId, notebookId, linkId, patch);
      await loadShareLinks();
      showNotification("Link updated", "success");
    } catch (err) {
      showNotification((err as Error).message, "error");
    } finally {
      setPublishBusy(false);
    }
  }

  async function confirmRevokeLink() {
    const linkId = revokeLinkId;
    if (!linkId || !canManage || publishBusy) return;
    setRevokeLinkId(null);
    setPublishBusy(true);
    try {
      await cloudApi.revokeShareLink(orgId, notebookId, linkId);
      await loadShareLinks();
      showNotification("Share link revoked", "success");
      refresh();
    } catch (err) {
      showNotification((err as Error).message, "error");
    } finally {
      setPublishBusy(false);
    }
  }

  async function confirmDeleteVersion() {
    const exportId = deleteExportId;
    if (!exportId || !canManage || publishBusy || isArchived) return;
    setDeleteExportId(null);
    setPublishBusy(true);
    try {
      const result = await cloudApi.deleteCompileExport(orgId, notebookId, exportId);
      setLatestExportId(result.latestExportId);
      if (notebookSummary) {
        setNotebookSummary({
          ...notebookSummary,
          publicAccess: result.publicAccess === "public" ? "unlisted" : result.publicAccess,
          publicExportId: result.publicExportId || undefined,
          latestExportId: result.latestExportId || undefined,
        });
      }
      showNotification("Version deleted", "success");
      const next = await loadExports(result.latestExportId || undefined);
      await Promise.all([loadPdf(next), loadShareLinks()]);
      refresh();
    } catch (err) {
      showNotification((err as Error).message, "error");
    } finally {
      setPublishBusy(false);
    }
  }

  function sharePath(key: string) {
    return orgSlug ? `/o/${orgSlug}/n/${key}` : null;
  }

  const atVersionLimit = exportsList.length >= MAX_COMPILE_EXPORTS;
  const latestCreatedAt =
    exportsList.find((e) => e.id === latestExportId)?.createdAt || exportsList[0]?.createdAt;
  const exportLabelById = Object.fromEntries(
    exportsList.map((e) => [e.id, formatExportLabel(e)])
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-nb-surface">
      <header className="flex shrink-0 flex-col gap-2 border-b border-nb-outline-variant/25 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 md:px-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h1 className="text-nb-title font-bold tracking-tight text-nb-on-surface">Compile</h1>
            {isArchived && (
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                (Read-only)
              </span>
            )}
            {latestCreatedAt && (
              <p className="text-nb-caption text-nb-on-surface-variant">
                Latest {new Date(latestCreatedAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            className="min-h-9 flex-1 sm:flex-none"
            disabled={busy || isArchived}
            title={isArchived ? "Archived notebooks cannot be compiled" : undefined}
            onClick={() => void runCompile()}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {busy ? "Compiling…" : "Compile"}
          </Button>
          {pdfUrl && (
            <Button
              variant="secondary"
              size="sm"
              className="min-h-9"
              disabled={savingVersion || isArchived || atVersionLimit}
              title={
                atVersionLimit
                  ? `Version limit reached (${MAX_COMPILE_EXPORTS}). Delete an older version to save.`
                  : "Save current compile as a permanent version"
              }
              onClick={() => void handleSaveVersion()}
            >
              {savingVersion ? <Loader2 size={14} className="animate-spin" /> : null}
              Save version
            </Button>
          )}
          {pdfUrl && (
            <Button
              variant="secondary"
              size="sm"
              className="min-h-9"
              onClick={() => {
                const a = document.createElement("a");
                a.href = pdfUrl;
                a.download = `${notebookSummary?.name || "notebook"}.pdf`;
                a.target = "_blank";
                a.click();
              }}
            >
              <Download size={14} /> PDF
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="min-h-9 min-w-9"
            disabled={busy}
            aria-label="Refresh PDF"
            onClick={() => {
              void loadExports().then((id) => {
                void loadPdf(id);
                void loadShareLinks();
              });
            }}
          >
            <RefreshCcw size={14} />
          </Button>
        </div>
      </header>

      {busy && (
        <div className="shrink-0 border-b border-nb-outline-variant/20 bg-nb-surface-low px-4 py-2">
          <div className="mb-1.5 flex justify-between text-nb-caption font-semibold text-nb-on-surface-variant">
            <span className="truncate pr-3">{status || "Working…"}</span>
            <span className="shrink-0">{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-nb-surface">
            <div
              className="h-full bg-nb-primary transition-all"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}

      {log && (
        <div className="shrink-0 border-b border-nb-outline-variant/20 px-3 py-2 md:px-4">
          <Alert variant="error">
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-nb-caption">{log}</pre>
          </Alert>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <NotebookSideRail
          storageKey={`ene:rail:${notebookId}:compile`}
          defaultWidthPx={320}
          minWidthPx={240}
          maxWidthPx={520}
          title={
            <div className="flex w-full items-center gap-0.5 rounded-nb-lg bg-nb-surface/60 p-0.5 ring-1 ring-nb-outline-variant/30">
              {(
                [
                  { id: "preview", label: "Preview", count: undefined },
                  { id: "saved", label: "Saved", count: exportsList.length },
                  { id: "links", label: "Links", count: shareLinks.length },
                ] as const
              ).map((tab) => {
                const active = railTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setRailTab(tab.id);
                      if (tab.id === "preview") {
                        setSelectedExportId("latest");
                        void loadPdf("latest");
                      } else if (
                        tab.id === "saved" &&
                        exportsList.length &&
                        selectedExportId === "latest"
                      ) {
                        const target = latestExportId || exportsList[0].id;
                        setSelectedExportId(target);
                        void loadPdf(target);
                      }
                    }}
                    className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold transition-all select-none ${
                      active
                        ? "bg-nb-surface text-nb-primary shadow-xs ring-1 ring-nb-outline-variant/30"
                        : "text-nb-on-surface-variant hover:text-nb-on-surface"
                    }`}
                  >
                    <span>{tab.label}</span>
                    {typeof tab.count === "number" && tab.count > 0 && (
                      <span
                        className={`rounded-full px-1 text-[9px] font-bold leading-tight ${
                          active
                            ? "bg-nb-primary/10 text-nb-primary"
                            : "bg-nb-outline-variant/30 text-nb-on-surface-variant"
                        }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          }
          expandLabel="Expand panel"
          collapseLabel="Collapse panel"
        >
          {railTab === "preview" && (
            <div className="space-y-2.5 p-2">
              <div className="rounded-nb-lg border border-nb-outline-variant/30 bg-nb-surface p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-nb-on-surface">Working Draft</span>
                  <span className="inline-flex items-center rounded-full bg-nb-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-nb-primary">
                    Live
                  </span>
                </div>
                <p className="text-[11px] text-nb-on-surface-variant leading-snug">
                  Compile and preview your notebook without consuming version slots.
                </p>
                <div className="flex flex-col gap-1.5 pt-0.5">
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full justify-center text-xs h-8"
                    disabled={busy || isArchived}
                    onClick={() => void runCompile()}
                  >
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                    {busy ? "Compiling…" : "Compile preview"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full justify-center text-xs h-8"
                    disabled={!pdfUrl || savingVersion || isArchived || atVersionLimit}
                    title={
                      atVersionLimit
                        ? `Version limit reached (${MAX_COMPILE_EXPORTS}). Delete an older version to save.`
                        : !pdfUrl
                          ? "Compile a preview first before saving a version"
                          : "Save current compile as a permanent version"
                    }
                    onClick={() => void handleSaveVersion()}
                  >
                    {savingVersion ? <Loader2 size={13} className="animate-spin" /> : null}
                    Save as version
                  </Button>
                </div>
              </div>

              {pdfUrl && (
                <div className="rounded-nb-lg border border-nb-outline-variant/20 bg-nb-surface/40 p-2 text-[11px] text-nb-on-surface-variant space-y-0.5">
                  <div className="font-semibold text-nb-on-surface text-[11px]">Preview Status</div>
                  <div>Showing latest compiled draft.</div>
                </div>
              )}
            </div>
          )}

          {railTab === "saved" && (
            <div className="p-1.5 space-y-1.5">
              <div className="flex items-center justify-between px-2 py-0.5 text-[10px] text-nb-on-surface-variant font-medium">
                <span>Permanent snapshots</span>
                <span className={atVersionLimit ? "font-semibold text-amber-700 dark:text-amber-400" : ""}>
                  {exportsList.length} / {MAX_COMPILE_EXPORTS}
                </span>
              </div>
              {atVersionLimit && (
                <div className="rounded-nb-md border border-amber-600/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-800 dark:text-amber-300">
                  Limit reached ({MAX_COMPILE_EXPORTS}). Delete an older version to save new snapshots.
                </div>
              )}
              {exportsList.length === 0 ? (
                <div className="px-2 py-4 text-center text-[11px] text-nb-on-surface-variant">
                  <p>No saved versions yet.</p>
                  <p className="mt-1 text-[10px] text-nb-on-surface-variant/70">
                    Switch to the Preview tab and click &quot;Save as version&quot; to preserve a milestone.
                  </p>
                </div>
              ) : (
                <ul className="space-y-0.5">
                  {exportsList.map((exp) => {
                    const active = selectedExportId === exp.id;
                    const isLatest = latestExportId === exp.id;
                    const renaming = renamingExportId === exp.id;
                    return (
                      <li key={exp.id} className="group flex items-center gap-0.5">
                        {renaming ? (
                          <form
                            className="flex min-w-0 flex-1 items-center gap-1 px-1"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void saveExportLabel(exp.id, renameValue);
                            }}
                          >
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={() => void saveExportLabel(exp.id, renameValue)}
                              className="h-[26px] min-w-0 flex-1 rounded-nb bg-nb-surface px-1.5 text-xs text-nb-on-surface outline-none ring-1 ring-nb-primary/40"
                            />
                          </form>
                        ) : (
                          <button
                            type="button"
                            className={`relative flex h-[28px] min-w-0 flex-1 items-center gap-1.5 rounded-nb px-2 text-left text-xs transition-colors select-none ${
                              active
                                ? "bg-nb-primary/15 font-medium text-nb-primary"
                                : "text-nb-on-surface hover:bg-nb-surface/80"
                            }`}
                            onClick={() => {
                              setSelectedExportId(exp.id);
                              void loadPdf(exp.id);
                            }}
                          >
                            <span className="min-w-0 flex-1 truncate text-xs leading-none">
                              {formatExportLabel(exp)}
                            </span>
                            {isLatest && (
                              <span
                                className={`shrink-0 text-[9px] font-semibold leading-none ${
                                  active ? "text-nb-primary/80" : "text-nb-on-surface-variant/70"
                                }`}
                              >
                                Latest
                              </span>
                            )}
                          </button>
                        )}
                        {canManage && !isArchived && !renaming && (
                          <>
                            <IconButton
                              className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                              title="Rename version"
                              aria-label="Rename version"
                              disabled={publishBusy}
                              onClick={() => {
                                setRenamingExportId(exp.id);
                                setRenameValue(exp.label || formatExportLabel(exp));
                              }}
                            >
                              <Pencil size={12} />
                            </IconButton>
                            <IconButton
                              className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                              variant="danger"
                              title="Delete version"
                              aria-label="Delete version"
                              disabled={publishBusy}
                              onClick={() => setDeleteExportId(exp.id)}
                            >
                              <Trash2 size={12} />
                            </IconButton>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {railTab === "links" && (
            <div className="space-y-2 p-1.5">
              {!orgSlug && (
                <Alert variant="warning">Set an org slug in organization settings first.</Alert>
              )}
              {shareLinks.length === 0 && !showCreateLink && (
                <div className="rounded-xl border border-dashed border-nb-outline-variant/40 p-4 text-center">
                  <p className="text-xs font-medium text-nb-on-surface">No share links created</p>
                  <p className="mt-1 text-[11px] text-nb-on-surface-variant">
                    Create a link to generate a direct or public PDF link for visitors and judges.
                  </p>
                </div>
              )}
              <ul className="space-y-3">
                {shareLinks.map((link) => {
                  const path = sharePath(link.key);
                  const isPublic = link.visibility === "public";
                  return (
                    <li
                      key={link.id}
                      className="rounded-xl border border-nb-outline-variant/30 bg-nb-surface shadow-xs transition-shadow hover:shadow-sm"
                    >
                      <div className="border-b border-nb-outline-variant/20 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-block h-2 w-2 rounded-full ${
                                  isPublic ? "bg-emerald-500" : "bg-sky-500"
                                }`}
                              />
                              <p className="truncate text-sm font-semibold text-nb-on-surface">
                                {link.name}
                              </p>
                            </div>
                            <p className="mt-1 truncate text-xs text-nb-on-surface-variant">
                              Serving:{" "}
                              <span className="font-medium text-nb-on-surface">
                                {exportLabelById[link.exportId] || link.exportId.slice(0, 8)}
                              </span>
                            </p>
                          </div>
                          {canManage && !isArchived && (
                            <IconButton
                              className="h-7 w-7 shrink-0 text-nb-on-surface-variant hover:text-red-500"
                              variant="ghost"
                              title="Revoke link"
                              aria-label="Revoke link"
                              disabled={publishBusy}
                              onClick={() => setRevokeLinkId(link.id)}
                            >
                              <Trash2 size={14} />
                            </IconButton>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2.5 p-3">
                        {canManage && !isArchived && exportsList.length > 0 && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-nb-on-surface-variant">
                                Target Version
                              </label>
                              <select
                                className="h-8 w-full rounded-lg border border-nb-outline-variant/30 bg-nb-surface-low px-2 text-xs font-medium text-nb-on-surface focus:border-nb-primary focus:outline-none"
                                value={link.exportId}
                                disabled={publishBusy}
                                onChange={(e) =>
                                  void rebindLink(link.id, { exportId: e.target.value })
                                }
                              >
                                {exportsList.map((exp) => (
                                  <option key={exp.id} value={exp.id}>
                                    {formatExportLabel(exp)}
                                    {exp.id === latestExportId ? " (latest)" : ""}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-nb-on-surface-variant">
                                Access Level
                              </label>
                              <select
                                className="h-8 w-full rounded-lg border border-nb-outline-variant/30 bg-nb-surface-low px-2 text-xs font-medium text-nb-on-surface focus:border-nb-primary focus:outline-none"
                                value={isPublic ? "public" : "unlisted"}
                                disabled={publishBusy}
                                onChange={(e) =>
                                  void rebindLink(link.id, {
                                    visibility: e.target.value as "public" | "unlisted",
                                  })
                                }
                              >
                                <option value="unlisted">Unlisted</option>
                                <option value="public">Public</option>
                              </select>
                            </div>
                          </div>
                        )}

                        {path && (
                          <div className="flex items-center gap-2 pt-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-8 flex-1 text-xs"
                              onClick={() => {
                                void navigator.clipboard
                                  .writeText(`${window.location.origin}${path}`)
                                  .then(
                                    () => showNotification("Direct PDF link copied", "success"),
                                    () => showNotification("Could not copy link", "error")
                                  );
                              }}
                            >
                              <Copy size={13} className="mr-1" /> Copy Link
                            </Button>
                            <a
                              href={path}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-nb-outline-variant/30 px-3 text-xs font-semibold text-nb-primary hover:bg-nb-surface-low"
                            >
                              Open <ExternalLink size={13} />
                            </a>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {canManage && !isArchived && (
                showCreateLink ? (
                  <div className="space-y-3 rounded-xl border border-nb-primary/40 bg-nb-surface p-3.5 shadow-sm">
                    <p className="text-xs font-bold text-nb-on-surface">Create New Share Link</p>
                    <TextField
                      label="Link Name"
                      value={newLinkName}
                      onChange={(e) => setNewLinkName(e.target.value)}
                      placeholder="e.g. State Championship, Judges…"
                    />
                    <div>
                      <label className="mb-1 block text-nb-caption font-medium text-nb-on-surface-variant">
                        Version
                      </label>
                      <select
                        className="h-9 w-full rounded-lg border border-nb-outline-variant/30 bg-nb-surface px-2.5 text-sm text-nb-on-surface focus:border-nb-primary focus:outline-none"
                        value={newLinkExportId}
                        onChange={(e) => setNewLinkExportId(e.target.value)}
                      >
                        {exportsList.map((exp) => (
                          <option key={exp.id} value={exp.id}>
                            {formatExportLabel(exp)}
                            {exp.id === latestExportId ? " (latest)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-nb-caption font-medium text-nb-on-surface-variant">
                        Visibility
                      </label>
                      <select
                        className="h-9 w-full rounded-lg border border-nb-outline-variant/30 bg-nb-surface px-2.5 text-sm text-nb-on-surface focus:border-nb-primary focus:outline-none"
                        value={newLinkVisibility}
                        onChange={(e) =>
                          setNewLinkVisibility(e.target.value as "unlisted" | "public")
                        }
                      >
                        <option value="unlisted">Unlisted (anyone with direct link)</option>
                        <option value="public">Public (catalog & public notebooks query)</option>
                      </select>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="primary"
                        className="flex-1"
                        disabled={publishBusy || !exportsList.length || !orgSlug}
                        onClick={() => void createLink()}
                      >
                        <Link2 size={14} className="mr-1" /> Create Link
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={publishBusy}
                        onClick={() => setShowCreateLink(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full py-2 font-semibold"
                    disabled={!exportsList.length || !orgSlug}
                    onClick={() => {
                      setNewLinkExportId(
                        selectedExportId !== "latest"
                          ? selectedExportId
                          : latestExportId || exportsList[0]?.id || ""
                      );
                      setShowCreateLink(true);
                    }}
                  >
                    <Plus size={14} className="mr-1" /> New share link
                  </Button>
                )
              )}
            </div>
          )}
        </NotebookSideRail>

        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          {pdfUrl ? (
            <LatexPreview latexContent="" pdfUrl={pdfUrl} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-nb-caption text-nb-on-surface-variant">
              <p>No compiled PDF yet.</p>
              {isArchived ? (
                <p className="text-xs text-nb-on-surface-variant/70">
                  This notebook is archived. Unarchive it to compile.
                </p>
              ) : (
                <Button size="sm" variant="primary" disabled={busy} onClick={() => void runCompile()}>
                  Compile now
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmationDialog
        isOpen={Boolean(deleteExportId)}
        title="Delete version?"
        message={
          shareLinks.some((l) => l.exportId === deleteExportId)
            ? "Share links pointing at this version will move to the next latest PDF, or be revoked if none remain."
            : "Delete this saved PDF?"
        }
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => void confirmDeleteVersion()}
        onCancel={() => setDeleteExportId(null)}
      />
      <ConfirmationDialog
        isOpen={Boolean(revokeLinkId)}
        title="Revoke share link?"
        message="Anyone with this URL will lose access. You can create a new link later."
        variant="danger"
        confirmLabel="Revoke"
        onConfirm={() => void confirmRevokeLink()}
        onCancel={() => setRevokeLinkId(null)}
      />
    </div>
  );
}
