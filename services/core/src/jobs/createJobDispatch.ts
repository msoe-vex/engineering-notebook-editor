import type { JobDispatchPort } from "./jobDispatchPort.js";
import { HttpJobDispatch } from "./httpJobDispatch.js";

class NoopJobDispatch implements JobDispatchPort {
  supports(_type: string): boolean {
    return false;
  }

  async enqueue(): Promise<void> {
    throw Object.assign(new Error("job dispatch is disabled (JOB_DISPATCH=none)"), {
      code: "job_dispatch_unavailable",
      statusCode: 503,
    });
  }
}

/**
 * Factory — swap via env without changing Core routes.
 * - `http` (default): Compose / HTTP worker URLs
 * - `tasks`: reserved for Cloud Tasks (falls back to http until wired)
 * - `none`: always 503
 */
export function createJobDispatch(): JobDispatchPort {
  const mode = (process.env.JOB_DISPATCH || "http").toLowerCase().trim();
  if (mode === "none") return new NoopJobDispatch();
  if (mode === "tasks") {
    // Prod Cloud Tasks adapter not wired yet — same HTTP delivery until deploy.
    return new HttpJobDispatch();
  }
  return new HttpJobDispatch();
}
