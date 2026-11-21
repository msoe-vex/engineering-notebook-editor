"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Download, ExternalLink, Loader2, Play, RefreshCcw } from "lucide-react";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
import { CompilePageSkeleton } from "@/components/cloud/notebookPageSkeletons";
import { Alert, Button, Skeleton } from "@/components/ui";
import { showNotification } from "@/components/overlays/Notification";
import { cloudApi, type CompileExportSummary } from "@/lib/cloud/api";
import { compileCloudNotebook } from "@/lib/cloud/compileCloudNotebook";
import { subscribeNotebookEvents } from "@/lib/cloud/notebookEvents";
import { trackNotebookJobToast } from "@/hooks/useNotebookJobToasts";

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
  const [stage, setStage] = useState<string | null>(null);
  const [stageLog, setStageLog] = useState<string[]>([]);
  const [log, setLog] = useState<string | null>(null);
  const [engine, setEngine] = useState<"server" | "busytex" | null>(null);
  const [exportsList, setExportsList] = useState<CompileExportSummary[]>([]);
  const [selectedExportId, setSelectedExportId] = useState<string>("latest");
  const [publicExportId, setPublicExportId] = useState<string | null>(null);
  const [publicAccess, setPublicAccess] = useState<"off" | "unlisted" | "public">("off");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const jobIdRef = useRef<string | null>(null);

  const loadExports = useCallback(async (preferId?: string) => {
    try {
      const res = await cloudApi.listCompileExports(orgId, notebookId);
      setExportsList(res.exports || []);
      setPublicExportId(res.publicExportId || null);
      setPublicAccess(
        res.publicAccess === "public" || res.publicAccess === "unlisted" ? res.publicAccess : "off"
      );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on compile timestamp
  }, [orgId, notebookId, notebookSummary?.lastCompiled]);

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
    setEngine("busytex");
    setStatus("Compiling in browser (BusyTeX escape hatch)…");
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
      if (result.lastCompiled && notebookSummary) {
        setNotebookSummary({ ...notebookSummary, lastCompiled: result.lastCompiled });
      }
      await loadExports();
      refresh();
    } else {
      setLog(result.log || "Compilation failed.");
      setError("Compilation failed. See log below.");
    }
  }

  async function runServerCompile(jobId: string) {
    setEngine("server");
    jobIdRef.current = jobId;
    setStatus("Queued on server…");
    setProgress(5);

    await new Promise<void>((resolve, reject) => {
      const ac = new AbortController();
      const timeout = setTimeout(
        () => {
          ac.abort();
          reject(new Error("Server compile timed out (10 minutes)."));
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
            setStatus(event.status || "Working…");
            setProgress(event.progress ?? 0);
            if (event.stage) setStage(event.stage);
            const line = [event.stage, event.detail || event.status].filter(Boolean).join(": ");
            if (line) {
              setStageLog((prev) => [...prev.slice(-8), line]);
            }
            return;
          }
          if (event.type === "job.done") {
            if (event.jobType && event.jobType !== "compile") return;
            if (jobIdRef.current && event.jobId !== jobIdRef.current) return;
            clearTimeout(timeout);
            ac.abort();
            const lastCompiled = String(
              event.result?.lastCompiled || notebookSummary?.lastCompiled || new Date().toISOString()
            );
            const exportId = event.result?.exportId
              ? String(event.result.exportId)
              : undefined;
            if (notebookSummary) {
              setNotebookSummary({
                ...notebookSummary,
                lastCompiled,
                ...(exportId ? { latestExportId: exportId } : {}),
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
            reject(new Error(event.error || "Server compile failed"));
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
    setStage(null);
    setStageLog([]);
    setError(null);
    setEngine(null);
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

  async function publishSelected(access: "off" | "unlisted" | "public") {
    if (!canManage || publishBusy) return;
    setPublishBusy(true);
    try {
      const exportId =
        selectedExportId === "latest"
          ? notebookSummary?.latestExportId || exportsList[0]?.id
          : selectedExportId;
      const updated = await cloudApi.patchNotebook(orgId, notebookId, {
        publicAccess: access,
        revokePublic: access === "off",
        ...(access !== "off" && exportId ? { publicExportId: exportId } : {}),
      });
      setPublicAccess(access);
      setPublicKey(updated.publicKey || null);
      setPublicExportId(
        access === "off" ? null : updated.publicExportId || exportId || null
      );
      if (notebookSummary) {
        setNotebookSummary({
          ...notebookSummary,
          publicAccess: access,
          publicKey: updated.publicKey,
          publicExportId: access === "off" ? undefined : updated.publicExportId || exportId,
          publishedAt: updated.publishedAt,
          publishedBy: updated.publishedBy,
          latestExportId: updated.latestExportId ?? notebookSummary.latestExportId,
          updatedAt: updated.updatedAt || notebookSummary.updatedAt,
        });
      }
      showNotification(
        access === "off"
          ? "Public link disabled"
          : access === "unlisted"
            ? "Unlisted PDF published"
            : "Public PDF published",
        "success"
      );
      refresh();
    } catch (err) {
      showNotification((err as Error).message, "error");
    } finally {
      setPublishBusy(false);
    }
  }

  const isPublishedVersion =
    publicAccess !== "off" &&
    publicExportId &&
    (selectedExportId === publicExportId ||
      (selectedExportId === "latest" && publicExportId === notebookSummary?.latestExportId));

  const publicPath =
    orgSlug && publicKey && publicAccess !== "off" ? `/o/${orgSlug}/n/${publicKey}` : null;

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
            {notebookSummary?.lastCompiled && (
              <p className="text-nb-caption text-nb-on-surface-variant">
                Last {new Date(notebookSummary.lastCompiled).toLocaleString()}
              </p>
            )}
          </div>
          <p className="mt-0.5 hidden text-nb-caption text-nb-on-surface-variant sm:block">
            {isArchived
              ? "Archived notebook · Compilation is disabled for read-only notebooks."
              : "Compile creates a PDF version. Publish a version for the public link (PDF only)."}
          </p>
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
            <span className="truncate pr-3">
              {stage ? `[${stage}] ` : ""}
              {status}
              {engine === "server" ? " · server" : engine === "busytex" ? " · browser" : ""}
            </span>
            <span className="shrink-0">{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-nb-surface">
            <div
              className="h-full bg-nb-primary transition-all"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
          {stageLog.length > 0 && (
            <ul className="mt-2 max-h-24 space-y-0.5 overflow-y-auto text-[11px] text-nb-on-surface-variant/80">
              {stageLog.map((line, i) => (
                <li key={`${i}-${line}`} className="truncate font-mono">
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
        <aside className="flex max-h-48 w-full shrink-0 flex-col border-b border-nb-outline-variant/25 md:max-h-none md:w-64 md:border-b-0 md:border-r">
          <div className="border-b border-nb-outline-variant/20 px-3 py-2">
            <p className="text-nb-label font-semibold text-nb-on-surface">PDF versions</p>
            <p className="text-nb-caption text-nb-on-surface-variant">
              Select a version to preview
            </p>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto p-2">
            {exportsList.length === 0 && (
              <li className="px-2 py-3 text-nb-caption text-nb-on-surface-variant">
                No versions yet — compile to create one.
              </li>
            )}
            {exportsList.map((exp) => {
              const active = selectedExportId === exp.id;
              const published = publicExportId === exp.id && publicAccess !== "off";
              return (
                <li key={exp.id}>
                  <button
                    type="button"
                    className={`mb-1 w-full rounded-nb-md px-2 py-2 text-left text-sm transition-colors ${
                      active
                        ? "bg-nb-primary/15 font-semibold text-nb-on-surface"
                        : "text-nb-on-surface hover:bg-nb-surface-low"
                    }`}
                    onClick={() => setSelectedExportId(exp.id)}
                  >
                    <span className="block truncate">{formatExportLabel(exp)}</span>
                    <span className="mt-0.5 block text-[11px] font-normal text-nb-on-surface-variant">
                      {published ? "Published · " : ""}
                      {exp.byteSize
                        ? `${Math.round(exp.byteSize / 1024)} KB`
                        : exp.id.slice(0, 8)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {canManage && (
            <div className="space-y-2 border-t border-nb-outline-variant/20 p-3">
              <p className="text-nb-label font-semibold text-nb-on-surface">Public link</p>
              <p className="text-nb-caption text-nb-on-surface-variant">
                Visitors only see the published PDF — not live entries.
              </p>
              {!orgSlug && (
                <Alert variant="warning">
                  Set an org slug in organization settings before publishing.
                </Alert>
              )}
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant={isPublishedVersion && publicAccess === "public" ? "primary" : "secondary"}
                  disabled={publishBusy || isArchived || !exportsList.length}
                  onClick={() => void publishSelected("public")}
                >
                  Public
                </Button>
                <Button
                  size="sm"
                  variant={
                    isPublishedVersion && publicAccess === "unlisted" ? "primary" : "secondary"
                  }
                  disabled={publishBusy || isArchived || !exportsList.length}
                  onClick={() => void publishSelected("unlisted")}
                >
                  Unlisted
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={publishBusy || publicAccess === "off"}
                  onClick={() => void publishSelected("off")}
                >
                  Off
                </Button>
              </div>
              {publicPath && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void navigator.clipboard.writeText(`${window.location.origin}${publicPath}`).then(
                        () => showNotification("Link copied", "success"),
                        () => showNotification("Could not copy", "error")
                      );
                    }}
                  >
                    <Copy size={14} /> Copy link
                  </Button>
                  <a
                    href={publicPath}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-nb-primary hover:underline"
                  >
                    View <ExternalLink size={14} />
                  </a>
                </div>
              )}
            </div>
          )}
        </aside>

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
    </div>
  );
}
