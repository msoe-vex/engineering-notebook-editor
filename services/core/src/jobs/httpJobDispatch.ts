import type { EnqueueJobInput, JobDispatchPort } from "./jobDispatchPort.js";

function workerUrlForType(type: string): string | null {
  const mapRaw = process.env.JOB_WORKER_URLS || "";
  if (mapRaw.trim()) {
    try {
      const map = JSON.parse(mapRaw) as Record<string, string>;
      const u = map[type]?.replace(/\/$/, "");
      if (u) return u;
    } catch {
      /* fall through */
    }
  }
  if (type === "compile") {
    const u = (process.env.COMPILE_SERVICE_URL || "").replace(/\/$/, "");
    return u || null;
  }
  return null;
}

/**
 * Local Compose / Cloud Run service: POST {base}/jobs with job payload.
 */
export class HttpJobDispatch implements JobDispatchPort {
  supports(type: string): boolean {
    return Boolean(workerUrlForType(type));
  }

  async enqueue(job: EnqueueJobInput): Promise<void> {
    const base = workerUrlForType(job.type);
    if (!base) {
      throw Object.assign(new Error(`no worker URL for job type ${job.type}`), {
        code: "job_worker_unconfigured",
        statusCode: 503,
      });
    }
    const secret = process.env.INTERNAL_SERVICE_SECRET;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (secret) headers["x-internal-secret"] = secret;

    const res = await fetch(`${base}/jobs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jobId: job.jobId,
        type: job.type,
        orgId: job.orgId,
        notebookId: job.notebookId,
        payload: job.payload,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw Object.assign(
        new Error(`job worker ${res.status}: ${text.slice(0, 200)}`),
        { code: "job_worker_error", statusCode: 502, detail: text.slice(0, 500) }
      );
    }
  }
}
