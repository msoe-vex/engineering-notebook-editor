"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Download, Loader2, Play, RefreshCcw } from "lucide-react";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
import { CompilePageSkeleton } from "@/components/cloud/notebookPageSkeletons";
import { Alert, Button, Skeleton } from "@/components/ui";
import { cloudApi } from "@/lib/cloud/api";
import { compileCloudNotebook } from "@/lib/cloud/compileCloudNotebook";

const LatexPreview = dynamic(() => import("@/components/editor/LatexPreview"), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-0 w-full" />,
});

export function CloudNotebookCompiler() {
  const { orgId, notebookId, entries, notebookSummary, refresh, setError, setNotebookSummary } =
    useNotebookWorkspace();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfProbeDone, setPdfProbeDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPdfProbeDone(false);
    void cloudApi
      .getExportPdfUrl(orgId, notebookId, "latest")
      .then((r) => {
        if (!cancelled) setPdfUrl(r.url);
      })
      .catch(() => {
        if (!cancelled) setPdfUrl(null);
      })
      .finally(() => {
        if (!cancelled) setPdfProbeDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, notebookId, notebookSummary?.lastCompiled]);

  if (!pdfProbeDone) {
    return <CompilePageSkeleton />;
  }

  async function runCompile() {
    if (busy) return;
    setBusy(true);
    setLog(null);
    setStatus("Starting…");
    setProgress(0);
    setError(null);
    try {
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
        refresh();
      } else {
        setLog(result.log || "Compilation failed.");
        setError("Compilation failed. See log below.");
      }
    } catch (err) {
      setError((err as Error).message);
      setLog(String((err as Error).message));
    } finally {
      setBusy(false);
      setStatus("");
      setProgress(0);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-nb-surface">
      <header className="flex shrink-0 flex-col gap-2 border-b border-nb-outline-variant/25 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 md:px-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h1 className="text-nb-title font-bold tracking-tight text-nb-on-surface">Compile</h1>
            {notebookSummary?.lastCompiled && (
              <p className="text-nb-caption text-nb-on-surface-variant">
                Last {new Date(notebookSummary.lastCompiled).toLocaleString()}
              </p>
            )}
          </div>
          <p className="mt-0.5 hidden text-nb-caption text-nb-on-surface-variant sm:block">
            BusyTeX · entry order follows calendar date, then same-day order
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            className="min-h-9 flex-1 sm:flex-none"
            disabled={busy}
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
              void cloudApi
                .getExportPdfUrl(orgId, notebookId, "latest")
                .then((r) => setPdfUrl(r.url))
                .catch(() => setPdfUrl(null));
            }}
          >
            <RefreshCcw size={14} />
          </Button>
        </div>
      </header>

      {busy && (
        <div className="shrink-0 border-b border-nb-outline-variant/20 bg-nb-surface-low px-4 py-2">
          <div className="mb-1.5 flex justify-between text-nb-caption font-semibold text-nb-on-surface-variant">
            <span className="truncate pr-3">{status}</span>
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

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {pdfUrl ? (
          <LatexPreview latexContent="" pdfUrl={pdfUrl} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-nb-caption text-nb-on-surface-variant">
            <p>No compiled PDF yet.</p>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void runCompile()}>
              Compile now
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
