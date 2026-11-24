"use client";

import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { showNotification } from "@/components/overlays/Notification";
import { cloudApi } from "@/lib/cloud/api";
import {
  subscribeNotebookEvents,
  type NotebookRealtimeEvent,
} from "@/lib/cloud/notebookEvents";

type PendingJobToast = {
  jobId: string;
  toastId: string;
  label: string;
  successLabel?: string;
  kind: "judge-normalize" | "judge-score" | "compile" | "job";
};

const STORAGE_KEY = "nb-job-toasts";

function loadPending(): PendingJobToast[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingJobToast[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePending(rows: PendingJobToast[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}

/** Register a loading toast that survives leaving the Judge/Compile page. */
export function trackNotebookJobToast(info: {
  jobId: string;
  label: string;
  successLabel?: string;
  kind?: PendingJobToast["kind"];
}): string {
  const toastId = showNotification(info.label, "loading") as string;
  const rows = loadPending().filter((r) => r.jobId !== info.jobId);
  rows.push({
    jobId: info.jobId,
    toastId,
    label: info.label,
    successLabel: info.successLabel,
    kind: info.kind || "job",
  });
  savePending(rows);
  return toastId;
}

/** Explicitly dismiss a job toast by jobId or kind when handled locally or on error. */
export function dismissNotebookJobToast(opts: {
  jobId?: string;
  kind?: PendingJobToast["kind"];
  error?: string;
  success?: string;
}) {
  const rows = loadPending();
  const targets = rows.filter((r) => {
    if (opts.jobId && r.jobId === opts.jobId) return true;
    if (opts.kind && r.kind === opts.kind) return true;
    return false;
  });
  if (!targets.length) {
    if (opts.error) showNotification(opts.error, "error");
    else if (opts.success) showNotification(opts.success, "success");
    return;
  }
  for (const t of targets) {
    toast.dismiss(t.toastId);
    toast.remove(t.toastId);
  }
  savePending(rows.filter((r) => !targets.includes(r)));
  if (opts.error) {
    showNotification(opts.error, "error");
  } else if (opts.success) {
    showNotification(opts.success, "success");
  }
}

function successMessage(row: PendingJobToast, event: NotebookRealtimeEvent): string {
  if (row.successLabel) return row.successLabel;
  if (row.kind === "judge-normalize") return "Rubric ready";
  if (row.kind === "judge-score") return "Judge finished";
  if (row.kind === "compile") return "Compile finished";
  if (event.type === "job.done") return "Job finished";
  return "Done";
}

/**
 * Subscribe once per notebook workspace so job.done/failed toasts fire even if
 * the Judge/Compile panel unmounted.
 */
export function useNotebookJobToasts(orgId: string, notebookId: string, enabled: boolean) {
  const handledRef = useRef<Set<string>>(new Set());
  const rehydratedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !orgId || !notebookId) return;
    if (!rehydratedRef.current) {
      rehydratedRef.current = true;
      const rows = loadPending();
      if (rows.length) {
        // Query Core with auth for each saved job to avoid resurrecting finished/failed jobs
        void Promise.all(
          rows.map(async (row) => {
            try {
              const res = await cloudApi.getJob(orgId, notebookId, row.jobId);
              const status = res?.job?.status as string | undefined;
              if (status === "succeeded" || status === "failed") {
                toast.dismiss(row.toastId);
                toast.remove(row.toastId);
                return null;
              }
            } catch {
              // If 404 or access error, drop dead toast
              toast.dismiss(row.toastId);
              toast.remove(row.toastId);
              return null;
            }
            toast.dismiss(row.toastId);
            return {
              ...row,
              toastId: showNotification(row.label, "loading") as string,
            };
          })
        ).then((updated) => {
          const active = updated.filter((r): r is PendingJobToast => r !== null);
          savePending(active);
        });
      }
    }

    const ac = new AbortController();
    subscribeNotebookEvents(
      orgId,
      notebookId,
      (event) => {
        if (event.type !== "job.done" && event.type !== "job.failed") return;
        const jobId = event.jobId;
        if (!jobId || handledRef.current.has(jobId)) return;
        const rows = loadPending();
        const pending = rows.find((r) => r.jobId === jobId);
        if (!pending) return;
        handledRef.current.add(jobId);
        toast.dismiss(pending.toastId);
        savePending(rows.filter((r) => r.jobId !== jobId));
        if (event.type === "job.done") {
          showNotification(successMessage(pending, event), "success");
        } else {
          showNotification(event.error || "Job failed", "error");
        }
      },
      ac.signal
    );
    return () => ac.abort();
  }, [orgId, notebookId, enabled]);
}
