export type EnqueueJobInput = {
  jobId: string;
  type: string;
  orgId: string;
  notebookId: string;
  payload: unknown;
};

/**
 * Delivers a queued job to a worker (HTTP today, Cloud Tasks later).
 * Core routes depend on this port — never on Tasks vs Compose details.
 */
export interface JobDispatchPort {
  /** True when this adapter can enqueue the given job type. */
  supports(type: string): boolean;
  enqueue(job: EnqueueJobInput): Promise<void>;
}
