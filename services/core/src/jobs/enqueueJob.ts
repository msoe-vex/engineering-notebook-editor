import { randomUUID } from "node:crypto";
import type { NotebookJob } from "@engineering-notebook/shared";
import type { JobDispatchPort } from "./jobDispatchPort.js";
import {
  createJob,
  failJobAfterCreate,
  findActiveJob,
} from "./jobStore.js";

export type EnqueueNotebookJobResult =
  | { ok: true; status: 202; job: NotebookJob }
  | { ok: false; status: 409; job: NotebookJob }
  | { ok: false; status: 503; error: string; code: string }
  | { ok: false; status: 502; error: string; code: string; jobId: string; detail?: string };

/**
 * Create a durable job (single-flight) and dispatch to the worker adapter.
 */
export async function enqueueNotebookJob(opts: {
  orgId: string;
  notebookId: string;
  type: string;
  resourceKey: string;
  payload?: Record<string, unknown>;
  createdBy: string;
  dispatch: JobDispatchPort;
}): Promise<EnqueueNotebookJobResult> {
  const {
    orgId,
    notebookId,
    type,
    resourceKey,
    createdBy,
    dispatch,
  } = opts;
  const payload = opts.payload || {};

  const active = await findActiveJob(orgId, notebookId, type, resourceKey);
  if (active) {
    return { ok: false, status: 409, job: active };
  }

  if (!dispatch.supports(type)) {
    return {
      ok: false,
      status: 503,
      code: "job_dispatch_unavailable",
      error: `No worker configured for job type "${type}".`,
    };
  }

  const jobId = randomUUID();
  const job = await createJob({
    orgId,
    notebookId,
    jobId,
    type,
    resourceKey,
    payload,
    createdBy,
  });

  try {
    await dispatch.enqueue({
      jobId,
      type,
      orgId,
      notebookId,
      payload,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: string }).code)
        : "job_worker_error";
    const statusCode =
      err && typeof err === "object" && "statusCode" in err
        ? Number((err as { statusCode: number }).statusCode)
        : 502;
    const detail =
      err && typeof err === "object" && "detail" in err
        ? String((err as { detail: string }).detail)
        : undefined;

    await failJobAfterCreate({
      orgId,
      notebookId,
      jobId,
      type,
      resourceKey,
      error: message,
    });

    if (statusCode === 503) {
      return { ok: false, status: 503, code, error: message };
    }
    return { ok: false, status: 502, code, error: message, jobId, detail };
  }

  return { ok: true, status: 202, job };
}
