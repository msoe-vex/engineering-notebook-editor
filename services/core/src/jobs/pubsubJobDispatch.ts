import { PubSub } from "@google-cloud/pubsub";
import type { EnqueueJobInput, JobDispatchPort } from "./jobDispatchPort.js";

const DEFAULT_TOPICS: Record<string, string> = {
  compile: "notebook-jobs-compile",
  judge: "notebook-jobs-judge",
};

function topicForType(type: string): string | null {
  const envKey =
    type === "compile"
      ? process.env.PUBSUB_TOPIC_COMPILE
      : type === "judge"
        ? process.env.PUBSUB_TOPIC_JUDGE
        : undefined;
  if (envKey?.trim()) return envKey.trim();
  return DEFAULT_TOPICS[type] || null;
}

function projectId(): string {
  return (
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCP_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    "demo-engineering-notebook"
  );
}

/**
 * Publish job wake messages to Pub/Sub (emulator locally, GCP in prod).
 * Message body matches the former HTTP /jobs JSON so workers share one handler shape.
 */
export class PubSubJobDispatch implements JobDispatchPort {
  private client: PubSub | null = null;

  private pubsub(): PubSub {
    if (!this.client) {
      this.client = new PubSub({ projectId: projectId() });
    }
    return this.client;
  }

  supports(type: string): boolean {
    return Boolean(topicForType(type));
  }

  async enqueue(job: EnqueueJobInput): Promise<void> {
    const topicName = topicForType(job.type);
    if (!topicName) {
      throw Object.assign(new Error(`no Pub/Sub topic for job type ${job.type}`), {
        code: "job_worker_unconfigured",
        statusCode: 503,
      });
    }
    const data = Buffer.from(
      JSON.stringify({
        jobId: job.jobId,
        type: job.type,
        orgId: job.orgId,
        notebookId: job.notebookId,
        payload: job.payload,
      }),
      "utf8"
    );
    try {
      const messageId = await this.pubsub().topic(topicName).publishMessage({ data });
      console.log(
        `[jobs] pubsub published type=${job.type} topic=${topicName} job=${job.jobId} messageId=${messageId}`
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw Object.assign(new Error(`pubsub publish failed: ${detail.slice(0, 200)}`), {
        code: "job_worker_error",
        statusCode: 502,
        detail: detail.slice(0, 500),
      });
    }
  }
}
