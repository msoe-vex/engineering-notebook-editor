"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Download, ExternalLink, Link2, Loader2, Play, RefreshCcw, Trash2 } from "lucide-react";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
import { NotebookSideRail } from "@/components/cloud/NotebookSideRail";
import { CompilePageSkeleton } from "@/components/cloud/notebookPageSkeletons";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import { Alert, Button, IconButton, Skeleton } from "@/components/ui";
import { showNotification } from "@/components/overlays/Notification";
import { cloudApi, type CompileExportSummary } from "@/lib/cloud/api";
import { compileCloudNotebook } from "@/lib/cloud/compileCloudNotebook";
import { subscribeNotebookEvents } from "@/lib/cloud/notebookEvents";
import { trackNotebookJobToast } from "@/hooks/useNotebookJobToasts";
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
  } = useNotebookWorkspace();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfProbeDone, setPdfProbeDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [stageLog, setStageLog] = useState<string[]>([]);
  const [log, setLog] = useState<string | null>(null);
  const [exportsList, setExportsList] = useState<CompileExportSummary[]>([]);
  const [selectedExportId, setSelectedExportId] = useState<string>("latest");
  const [publicExportId, setPublicExportId] = useState<string | null>(null);
  const [linkOn, setLinkOn] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [latestExportId, setLatestExportId] = useState<string | null>(null);
  const [deleteExportId, setDeleteExportId] = useState<string | null>(null);
  const jobIdRef = useRef<string | null>(null);

  const loadExports = useCallback(async (preferId?: string) => {
    try {
      const res = await cloudApi.listCompileExports(orgId, notebookId);
      setExportsList(res.exports || []);
      setPublicExportId(res.publicExportId || null);
      setLatestExportId(res.latestExportId || null);
      setLinkOn(res.publicAccess === "public" || res.publicAccess === "unlisted");
      setPublicKey(res.publicKey || null);
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
  }, [orgId, notebookId]);

  const loadPdf = useCallback(
    async (exportId: string) => {
      try {
        const r = await cloudApi.getExportPdfUrl(orgId, notebookId, exportId);
        setPdfUrl(r.url);
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
      await loadPdf(id);
      if (!cancelled) setPdfProbeDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, notebookId, loadExports, loadPdf]);

  useEffect(() => {
    if (!pdfProbeDone) return;
    void loadPdf(selectedExportId);
  }, [selectedExportId, pdfProbeDone, loadPdf]);

  if (!pdfProbeDone) {
    return <CompilePageSkeleton />;
  }

  async function runBusyTexEscape() {
    if (!allowBusyTex) {
      throw new Error(
        "Server compile unavailable. Start Compose `compile`, or set NEXT_PUBLIC_ALLOW_BUSYTEX_COMPILE=1 for a local escape hatch."
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
      if (result.exportId && notebookSummary) {
        setNotebookSummary({
          ...notebookSummary,
          latestExportId: result.exportId,
        });
      }
      await loadExports(result.exportId);
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
            const line = (event.detail || event.status || "Working…").trim();
            setStatus(line);
            setProgress(event.progress ?? 0);
            if (line) {
              setStageLog((prev) => {
                if (prev[prev.length - 1] === line) return prev;
                return [...prev.slice(-5), line];
              });
            }
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
            if (notebookSummary && exportId) {
              setNotebookSummary({
                ...notebookSummary,
                latestExportId: exportId,
              });
            }
            void loadExports(exportId).then(() => refresh());
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
    if (exportsList.length >= MAX_COMPILE_EXPORTS) {
      showNotification(
        `Version limit reached (${MAX_COMPILE_EXPORTS}). Delete an older PDF before compiling again.`,
        "error"
      );
      return;
    }
    setBusy(true);
    setLog(null);
    setStatus("Starting…");
    setProgress(0);
    setStageLog([]);
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

  async function setLinkSharing(on: boolean) {
    if (!canManage || publishBusy) return;
    setPublishBusy(true);
    try {
      const exportId =
        selectedExportId === "latest"
          ? latestExportId || notebookSummary?.latestExportId || exportsList[0]?.id
          : selectedExportId;
      const updated = await cloudApi.patchNotebook(orgId, notebookId, {
        publicAccess: on ? "unlisted" : "off",
        revokePublic: !on,
        ...(on && exportId ? { publicExportId: exportId } : {}),
      });
      setLinkOn(on);
      setPublicKey(updated.publicKey || null);
      setPublicExportId(on ? updated.publicExportId || exportId || null : null);
      if (notebookSummary) {
        setNotebookSummary({
          ...notebookSummary,
          publicAccess: on ? "unlisted" : "off",
          publicKey: updated.publicKey,
          publicExportId: on ? updated.publicExportId || exportId : undefined,
          publishedAt: updated.publishedAt,
          publishedBy: updated.publishedBy,
          latestExportId: updated.latestExportId ?? notebookSummary.latestExportId,
          updatedAt: updated.updatedAt || notebookSummary.updatedAt,
        });
      }
      showNotification(on ? "Share link enabled" : "Share link disabled", "success");
      await loadExports(exportId);
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
      setLinkOn(result.publicAccess === "unlisted" || result.publicAccess === "public");
      setPublicExportId(result.publicExportId);
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
      await loadPdf(next);
      refresh();
    } catch (err) {
      showNotification((err as Error).message, "error");
    } finally {
      setPublishBusy(false);
    }
  }

  const isPublishedVersion =
    linkOn &&
    publicExportId &&
    (selectedExportId === publicExportId ||
      (selectedExportId === "latest" && publicExportId === latestExportId));

  const publicPath =
    orgSlug && publicKey && linkOn ? `/o/${orgSlug}/n/${publicKey}` : null;

  const atVersionLimit = exportsList.length >= MAX_COMPILE_EXPORTS;
  const latestCreatedAt =
    exportsList.find((e) => e.id === latestExportId)?.createdAt || exportsList[0]?.createdAt;

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
          {canManage && !isArchived && (
            <>
              <Button
                size="sm"
                variant={isPublishedVersion ? "primary" : "secondary"}
                className="min-h-9"
                disabled={publishBusy || !exportsList.length || !orgSlug}
                title={!orgSlug ? "Set an org slug in settings first" : "Share the selected PDF"}
                onClick={() => void setLinkSharing(true)}
              >
                <Link2 size={14} />
                {isPublishedVersion ? "Shared" : "Share"}
              </Button>
              {linkOn && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-9"
                    disabled={publishBusy}
                    onClick={() => void setLinkSharing(false)}
                  >
                    Turn off
                  </Button>
                  {publicPath && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="min-h-9"
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(`${window.location.origin}${publicPath}`)
                            .then(
                              () => showNotification("Link copied", "success"),
                              () => showNotification("Could not copy", "error")
                            );
                        }}
                      >
                        <Copy size={14} /> Copy
                      </Button>
                      <a
                        href={publicPath}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-9 items-center gap-1 px-1 text-sm font-semibold text-nb-primary hover:underline"
                      >
                        Open <ExternalLink size={14} />
                      </a>
                    </>
                  )}
                </>
              )}
            </>
          )}
          <Button
            variant="primary"
            size="sm"
            className="min-h-9 flex-1 sm:flex-none"
            disabled={busy || isArchived || atVersionLimit}
            title={
              isArchived
                ? "Archived notebooks cannot be compiled"
                : atVersionLimit
                  ? `Delete a version first (${MAX_COMPILE_EXPORTS} max)`
                  : undefined
            }
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
              void loadExports().then((id) => loadPdf(id));
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
          {stageLog.length > 0 && (
            <ul className="mt-2 max-h-20 space-y-0.5 overflow-y-auto text-[11px] text-nb-on-surface-variant/80">
              {stageLog.map((line, i) => (
                <li key={`${i}-${line}`} className="truncate">
                  {line}
                </li>
              ))}
            </ul>
          )}
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
          title={`Versions · ${exportsList.length}/${MAX_COMPILE_EXPORTS}`}
          expandLabel="Expand versions"
          collapseLabel="Collapse versions"
        >
          <ul className="space-y-0.5 p-1.5">
            {exportsList.length === 0 && (
              <li className="px-2 py-3 text-nb-caption text-nb-on-surface-variant">
                No versions yet — compile to create one.
              </li>
            )}
            {atVersionLimit && (
              <li className="mb-1 rounded px-2 py-1.5 text-[10px] font-medium text-amber-800 dark:text-amber-300">
                Limit reached. Delete a version to compile again.
              </li>
            )}
            {exportsList.map((exp) => {
              const active = selectedExportId === exp.id;
              const published = publicExportId === exp.id && linkOn;
              const isLatest = latestExportId === exp.id;
              return (
                <li key={exp.id} className="group flex items-center gap-0.5">
                  <button
                    type="button"
                    className={`relative flex h-[26px] min-w-0 flex-1 items-center gap-1.5 rounded px-2 text-left text-nb-label transition-colors select-none ${
                      active
                        ? "bg-nb-primary/15 font-medium text-nb-primary"
                        : "text-nb-on-surface hover:bg-nb-surface/80"
                    }`}
                    onClick={() => setSelectedExportId(exp.id)}
                  >
                    <span className="min-w-0 flex-1 truncate text-xs leading-none">
                      {formatExportLabel(exp)}
                    </span>
                    {(published || isLatest) && (
                      <span
                        className={`shrink-0 text-[10px] leading-none ${
                          active ? "text-nb-primary/80" : "text-nb-on-surface-variant/70"
                        }`}
                      >
                        {[published ? "Shared" : null, isLatest ? "Latest" : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </button>
                  {canManage && !isArchived && (
                    <IconButton
                      className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      variant="danger"
                      title="Delete version"
                      aria-label="Delete version"
                      disabled={publishBusy}
                      onClick={() => setDeleteExportId(exp.id)}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  )}
                </li>
              );
            })}
          </ul>
        </NotebookSideRail>

        <div className="relative min-h-0 flex-1 overflow-hidden">
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
          deleteExportId && publicExportId === deleteExportId
            ? "This PDF is shared. Deleting it turns the share link off."
            : "Delete this saved PDF?"
        }
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => void confirmDeleteVersion()}
        onCancel={() => setDeleteExportId(null)}
      />
    </div>
  );
}
