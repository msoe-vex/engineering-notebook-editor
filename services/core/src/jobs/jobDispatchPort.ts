export type EnqueueJobInput = {
  jobId: string;
  type: string;
  orgId: string;
  notebookId: string;
  payload: unknown;
};

/**
 * Delivers a queued job wake to workers (Pub/Sub publish).
 * Core routes depend on this port — never on emulator vs GCP details.
 */
export interface JobDispatchPort {
  /** True when this adapter can enqueue the given job type. */
  supports(type: string): boolean;
  enqueue(job: EnqueueJobInput): Promise<void>;
}
