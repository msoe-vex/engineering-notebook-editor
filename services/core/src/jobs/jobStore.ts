import {
  jobLockPath,
  jobPath,
  jobsCollection,
  type NotebookJob,
  type NotebookJobStatus,
} from "@engineering-notebook/shared";
import { getMetadataStore } from "../db/metadataStore.js";
import { omitUndefined } from "../db/sanitize.js";
import { publishNotebookEvent } from "../realtime/notebookEvents.js";

function nowIso() {
  return new Date().toISOString();
}

const ACTIVE: NotebookJobStatus[] = ["queued", "running"];

export async function getJob(
  orgId: string,
  notebookId: string,
  jobId: string
): Promise<NotebookJob | null> {
  const data = await getMetadataStore().get(jobPath(orgId, notebookId, jobId));
  if (!data) return null;
  return data as unknown as NotebookJob;
}

export async function findActiveJob(
  orgId: string,
  notebookId: string,
  type: string,
  resourceKey: string
): Promise<NotebookJob | null> {
  const lock = await getMetadataStore().get(jobLockPath(orgId, notebookId, type, resourceKey));
  if (!lock) return null;
  const jobId = lock.jobId as string | undefined;
  const status = lock.status as string | undefined;
  if (!jobId || !ACTIVE.includes(status as NotebookJobStatus)) return null;
  const job = await getJob(orgId, notebookId, jobId);
  if (!job || !ACTIVE.includes(job.status)) {
    await getMetadataStore().delete(jobLockPath(orgId, notebookId, type, resourceKey)).catch(() => undefined);
    return null;
  }
  return job;
}

export async function createJob(input: {
  orgId: string;
  notebookId: string;
  jobId: string;
  type: string;
  resourceKey: string;
  payload: Record<string, unknown>;
  createdBy: string;
}): Promise<NotebookJob> {
  const ts = nowIso();
  const job: NotebookJob = {
    jobId: input.jobId,
    type: input.type,
    status: "queued",
    resourceKey: input.resourceKey,
    payload: input.payload,
    progress: 5,
    statusMessage: "Queued…",
    createdBy: input.createdBy,
    createdAt: ts,
    updatedAt: ts,
    orgId: input.orgId,
    notebookId: input.notebookId,
  };
  await getMetadataStore().batch([
    { op: "set", path: jobPath(input.orgId, input.notebookId, input.jobId), data: job as unknown as Record<string, unknown> },
    {
      op: "set",
      path: jobLockPath(input.orgId, input.notebookId, input.type, input.resourceKey),
      data: {
        jobId: input.jobId,
        type: input.type,
        resourceKey: input.resourceKey,
        status: "queued",
        updatedAt: ts,
      },
    },
  ]);

  publishNotebookEvent(input.orgId, input.notebookId, {
    type: "job.progress",
    jobId: job.jobId,
    jobType: job.type,
    status: job.statusMessage || "Queued…",
    progress: job.progress ?? 5,
    at: ts,
  });
  return job;
}

export async function markJobRunning(
  orgId: string,
  notebookId: string,
  jobId: string
): Promise<void> {
  const job = await getJob(orgId, notebookId, jobId);
  if (!job) return;
  const ts = nowIso();
  const store = getMetadataStore();
  await store.update(jobPath(orgId, notebookId, jobId), {
    status: "running",
    updatedAt: ts,
  });
  await store.set(
    jobLockPath(orgId, notebookId, job.type, job.resourceKey),
    {
      jobId,
      type: job.type,
      resourceKey: job.resourceKey,
      status: "running",
      updatedAt: ts,
    },
    { merge: true }
  );
}

export async function updateJobProgress(input: {
  orgId: string;
  notebookId: string;
  jobId: string;
  statusMessage?: string;
  progress?: number;
  stage?: string;
  detail?: string;
}): Promise<NotebookJob | null> {
  const job = await getJob(input.orgId, input.notebookId, input.jobId);
  if (!job) return null;
  const ts = nowIso();
  const progress = Math.min(100, Math.max(0, Number(input.progress) || job.progress || 0));
  const statusMessage = input.statusMessage || job.statusMessage || "Working…";
  const nextStatus: NotebookJobStatus =
    job.status === "queued" ? "running" : job.status;

  const store = getMetadataStore();
  await store.update(
    jobPath(input.orgId, input.notebookId, input.jobId),
    omitUndefined({
      status: nextStatus,
      progress,
      statusMessage,
      stage: input.stage,
      detail: input.detail,
      updatedAt: ts,
    }) as Record<string, unknown>
  );

  if (nextStatus === "running") {
    await store.set(
      jobLockPath(input.orgId, input.notebookId, job.type, job.resourceKey),
      {
        jobId: input.jobId,
        type: job.type,
        resourceKey: job.resourceKey,
        status: "running",
        updatedAt: ts,
      },
      { merge: true }
    );
  }

  publishNotebookEvent(input.orgId, input.notebookId, {
    type: "job.progress",
    jobId: input.jobId,
    jobType: job.type,
    status: statusMessage,
    progress,
    stage: input.stage,
    detail: input.detail,
    at: ts,
  });

  return { ...job, status: nextStatus, progress, statusMessage, updatedAt: ts };
}

export async function completeJob(input: {
  orgId: string;
  notebookId: string;
  jobId: string;
  result?: Record<string, unknown>;
}): Promise<NotebookJob | null> {
  const job = await getJob(input.orgId, input.notebookId, input.jobId);
  if (!job) return null;
  const ts = nowIso();
  const store = getMetadataStore();
  await store.update(jobPath(input.orgId, input.notebookId, input.jobId), {
    status: "succeeded",
    progress: 100,
    statusMessage: "Done",
    result: input.result || {},
    updatedAt: ts,
  });
  await store
    .delete(jobLockPath(input.orgId, input.notebookId, job.type, job.resourceKey))
    .catch(() => undefined);

  publishNotebookEvent(input.orgId, input.notebookId, {
    type: "job.done",
    jobId: input.jobId,
    jobType: job.type,
    result: input.result || {},
    at: ts,
  });

  return {
    ...job,
    status: "succeeded",
    progress: 100,
    statusMessage: "Done",
    result: input.result || {},
    updatedAt: ts,
  };
}

export async function failJob(input: {
  orgId: string;
  notebookId: string;
  jobId: string;
  error: string;
}): Promise<NotebookJob | null> {
  const job = await getJob(input.orgId, input.notebookId, input.jobId);
  if (!job) {
    // Still publish so UI unblocks even if job doc missing
    publishNotebookEvent(input.orgId, input.notebookId, {
      type: "job.failed",
      jobId: input.jobId,
      jobType: "unknown",
      error: input.error,
      at: nowIso(),
    });
    return null;
  }
  const ts = nowIso();
  const store = getMetadataStore();
  await store.update(jobPath(input.orgId, input.notebookId, input.jobId), {
    status: "failed",
    error: input.error,
    statusMessage: "Failed",
    updatedAt: ts,
  });
  await store
    .delete(jobLockPath(input.orgId, input.notebookId, job.type, job.resourceKey))
    .catch(() => undefined);

  publishNotebookEvent(input.orgId, input.notebookId, {
    type: "job.failed",
    jobId: input.jobId,
    jobType: job.type,
    error: input.error,
    at: ts,
  });

  return { ...job, status: "failed", error: input.error, updatedAt: ts };
}

/** Mark job failed without requiring it was created (dispatch errors). */
export async function failJobAfterCreate(input: {
  orgId: string;
  notebookId: string;
  jobId: string;
  type: string;
  resourceKey: string;
  error: string;
}): Promise<void> {
  const ts = nowIso();
  const store = getMetadataStore();
  const path = jobPath(input.orgId, input.notebookId, input.jobId);
  const existing = await store.get(path);
  if (existing) {
    await store.update(path, {
      status: "failed",
      error: input.error,
      statusMessage: "Failed",
      updatedAt: ts,
    });
  }
  await store
    .delete(jobLockPath(input.orgId, input.notebookId, input.type, input.resourceKey))
    .catch(() => undefined);
  publishNotebookEvent(input.orgId, input.notebookId, {
    type: "job.failed",
    jobId: input.jobId,
    jobType: input.type,
    error: input.error,
    at: ts,
  });
}

export async function listRecentJobs(
  orgId: string,
  notebookId: string,
  limit = 20
): Promise<NotebookJob[]> {
  const rows = await getMetadataStore().query(jobsCollection(orgId, notebookId), {
    orderBy: { field: "createdAt", direction: "desc" },
    limit,
  });
  return rows as unknown as NotebookJob[];
}
