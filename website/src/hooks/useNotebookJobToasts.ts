"use client";

import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { showNotification } from "@/components/overlays/Notification";
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
        const next = rows.map((row) => {
          toast.dismiss(row.toastId);
          return {
            ...row,
            toastId: showNotification(row.label, "loading") as string,
          };
        });
        savePending(next);
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
