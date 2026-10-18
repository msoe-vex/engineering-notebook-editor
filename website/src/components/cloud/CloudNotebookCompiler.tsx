"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Download, Loader2, Play, RefreshCcw } from "lucide-react";
import { useNotebookWorkspace } from "@/components/cloud/NotebookWorkspaceContext";
import { Alert, Button } from "@/components/ui";
import { cloudApi } from "@/lib/cloud/api";
import { compileCloudNotebook } from "@/lib/cloud/compileCloudNotebook";

const LatexPreview = dynamic(() => import("@/components/editor/LatexPreview"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center text-nb-caption text-nb-on-surface-variant">
      <Loader2 className="mr-2 animate-spin" size={18} /> Loading preview…
    </div>
  ),
});

export function CloudNotebookCompiler() {
  const { orgId, notebookId, entries, notebookSummary, refresh, setError, setNotebookSummary } =
    useNotebookWorkspace();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void cloudApi
      .getExportPdfUrl(orgId, notebookId, "latest")
      .then((r) => {
        if (!cancelled) setPdfUrl(r.url);
      })
      .catch(() => {
        if (!cancelled) setPdfUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, notebookId, notebookSummary?.lastCompiled]);

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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-nb-display font-bold tracking-tight">Compile</h1>
          <p className="mt-1 text-nb-body text-nb-on-surface-variant">
            Build a PDF with BusyTeX (XeLaTeX). Entry order follows calendar date, then same-day
            order.
          </p>
          {notebookSummary?.lastCompiled && (
            <p className="mt-1 text-nb-caption text-nb-on-surface-variant">
              Last compiled {new Date(notebookSummary.lastCompiled).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <Button
            variant="primary"
            className="min-h-10 flex-1 sm:flex-none"
            disabled={busy}
            onClick={() => void runCompile()}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {busy ? "Compiling…" : "Compile"}
          </Button>
          {pdfUrl && (
            <Button
              variant="secondary"
              className="min-h-10"
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
            className="min-h-10 min-w-10"
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
      </div>

      {busy && (
        <div className="rounded-nb-xl border border-nb-outline-variant/25 bg-nb-surface-low px-4 py-3">
          <div className="mb-2 flex justify-between text-nb-caption font-semibold text-nb-on-surface-variant">
            <span>{status}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-nb-surface">
            <div
              className="h-full bg-nb-primary transition-all"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}

      {log && (
        <Alert variant="error">
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-nb-caption">{log}</pre>
        </Alert>
      )}

      <div className="min-h-[50vh] overflow-hidden rounded-nb-xl border border-nb-outline-variant/30 bg-nb-surface md:min-h-[70vh]">
        {pdfUrl ? (
          <LatexPreview latexContent="" pdfUrl={pdfUrl} />
        ) : (
          <div className="flex h-56 flex-col items-center justify-center gap-2 px-4 text-center text-nb-caption text-nb-on-surface-variant md:h-72">
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
