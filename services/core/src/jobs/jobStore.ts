import {
  jobLockPath,
  jobPath,
  jobsCollection,
  type NotebookJob,
  type NotebookJobStatus,
} from "@engineering-notebook/shared";
import { getFirestore } from "../db/firestore.js";
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
  const snap = await getFirestore().doc(jobPath(orgId, notebookId, jobId)).get();
  if (!snap.exists) return null;
  return snap.data() as NotebookJob;
}

export async function findActiveJob(
  orgId: string,
  notebookId: string,
  type: string,
  resourceKey: string
): Promise<NotebookJob | null> {
  const lockRef = getFirestore().doc(jobLockPath(orgId, notebookId, type, resourceKey));
  const lockSnap = await lockRef.get();
  if (!lockSnap.exists) return null;
  const lock = lockSnap.data() as { jobId?: string; status?: string };
  if (!lock.jobId || !ACTIVE.includes(lock.status as NotebookJobStatus)) return null;
  const job = await getJob(orgId, notebookId, lock.jobId);
  if (!job || !ACTIVE.includes(job.status)) {
    await lockRef.delete().catch(() => undefined);
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
  const db = getFirestore();
  const jobRef = db.doc(jobPath(input.orgId, input.notebookId, input.jobId));
  const lockRef = db.doc(
    jobLockPath(input.orgId, input.notebookId, input.type, input.resourceKey)
  );
  const batch = db.batch();
  batch.set(jobRef, job);
  batch.set(lockRef, {
    jobId: input.jobId,
    type: input.type,
    resourceKey: input.resourceKey,
    status: "queued",
    updatedAt: ts,
  });
  await batch.commit();

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
  const db = getFirestore();
  await db.doc(jobPath(orgId, notebookId, jobId)).update({
    status: "running",
    updatedAt: ts,
  });
  await db.doc(jobLockPath(orgId, notebookId, job.type, job.resourceKey)).set(
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
}): Promise<NotebookJob | null> {
  const job = await getJob(input.orgId, input.notebookId, input.jobId);
  if (!job) return null;
  const ts = nowIso();
  const progress = Math.min(100, Math.max(0, Number(input.progress) || job.progress || 0));
  const statusMessage = input.statusMessage || job.statusMessage || "Working…";
  const nextStatus: NotebookJobStatus =
    job.status === "queued" ? "running" : job.status;

  await getFirestore()
    .doc(jobPath(input.orgId, input.notebookId, input.jobId))
    .update({
      status: nextStatus,
      progress,
      statusMessage,
      updatedAt: ts,
    });

  if (nextStatus === "running") {
    await getFirestore()
      .doc(jobLockPath(input.orgId, input.notebookId, job.type, job.resourceKey))
      .set(
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
  const db = getFirestore();
  await db.doc(jobPath(input.orgId, input.notebookId, input.jobId)).update({
    status: "succeeded",
    progress: 100,
    statusMessage: "Done",
    result: input.result || {},
    updatedAt: ts,
  });
  await db
    .doc(jobLockPath(input.orgId, input.notebookId, job.type, job.resourceKey))
    .delete()
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
  const db = getFirestore();
  await db.doc(jobPath(input.orgId, input.notebookId, input.jobId)).update({
    status: "failed",
    error: input.error,
    statusMessage: "Failed",
    updatedAt: ts,
  });
  await db
    .doc(jobLockPath(input.orgId, input.notebookId, job.type, job.resourceKey))
    .delete()
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
  const db = getFirestore();
  const ref = db.doc(jobPath(input.orgId, input.notebookId, input.jobId));
  const snap = await ref.get();
  if (snap.exists) {
    await ref.update({
      status: "failed",
      error: input.error,
      statusMessage: "Failed",
      updatedAt: ts,
    });
  }
  await db
    .doc(jobLockPath(input.orgId, input.notebookId, input.type, input.resourceKey))
    .delete()
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
  const snap = await getFirestore()
    .collection(jobsCollection(orgId, notebookId))
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as NotebookJob);
}
