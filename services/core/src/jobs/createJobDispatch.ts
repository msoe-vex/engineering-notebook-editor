import type { JobDispatchPort } from "./jobDispatchPort.js";
import { PubSubJobDispatch } from "./pubsubJobDispatch.js";

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
 * - `pubsub` (default): publish to Pub/Sub topics (emulator locally / GCP prod)
 * - `none`: always 503
 */
export function createJobDispatch(): JobDispatchPort {
  const mode = (process.env.JOB_DISPATCH || "pubsub").toLowerCase().trim();
  if (mode === "none") return new NoopJobDispatch();
  if (mode === "http" || mode === "tasks") {
    console.warn(
      `[jobs] JOB_DISPATCH=${mode} is retired; using pubsub. Set JOB_DISPATCH=pubsub or none.`
    );
  }
  return new PubSubJobDispatch();
}
