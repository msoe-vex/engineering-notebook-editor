import type { FastifyInstance } from "fastify";
import { completeJob, failJob, getJob, updateJobProgress } from "../jobs/jobStore.js";

function assertInternalSecret(
  request: { headers: Record<string, unknown> },
  reply: { code: (n: number) => { send: (b: unknown) => unknown } }
) {
  const secret = process.env.INTERNAL_SERVICE_SECRET;
  if (secret && request.headers["x-internal-secret"] !== secret) {
    return reply.code(403).send({ error: "forbidden" });
  }
  return null;
}

/**
 * Generic worker callbacks (x-internal-secret).
 * Compile-specific snapshot/export stay on /internal/compile/*.
 */
export async function registerInternalJobRoutes(app: FastifyInstance) {
  app.post("/internal/jobs/:jobId/progress", async (request, reply) => {
    const denied = assertInternalSecret(
      request as { headers: Record<string, unknown> },
      reply
    );
    if (denied) return denied;
    const { jobId } = request.params as { jobId: string };
    const body = request.body as {
      orgId?: string;
      notebookId?: string;
      status?: string;
      progress?: number;
    };
    if (!body.orgId || !body.notebookId) {
      return reply.code(400).send({ error: "orgId and notebookId required" });
    }
    const job = await updateJobProgress({
      orgId: body.orgId,
      notebookId: body.notebookId,
      jobId,
      statusMessage: body.status,
      progress: body.progress,
    });
    if (!job) return reply.code(404).send({ error: "job not found" });
    return { ok: true, job };
  });

  app.post("/internal/jobs/:jobId/complete", async (request, reply) => {
    const denied = assertInternalSecret(
      request as { headers: Record<string, unknown> },
      reply
    );
    if (denied) return denied;
    const { jobId } = request.params as { jobId: string };
    const body = request.body as {
      orgId?: string;
      notebookId?: string;
      result?: Record<string, unknown>;
    };
    if (!body.orgId || !body.notebookId) {
      return reply.code(400).send({ error: "orgId and notebookId required" });
    }
    const job = await completeJob({
      orgId: body.orgId,
      notebookId: body.notebookId,
      jobId,
      result: body.result,
    });
    if (!job) return reply.code(404).send({ error: "job not found" });
    return { ok: true, job };
  });

  app.post("/internal/jobs/:jobId/fail", async (request, reply) => {
    const denied = assertInternalSecret(
      request as { headers: Record<string, unknown> },
      reply
    );
    if (denied) return denied;
    const { jobId } = request.params as { jobId: string };
    const body = request.body as {
      orgId?: string;
      notebookId?: string;
      error?: string;
    };
    if (!body.orgId || !body.notebookId) {
      return reply.code(400).send({ error: "orgId and notebookId required" });
    }
    const existing = await getJob(body.orgId, body.notebookId, jobId);
    await failJob({
      orgId: body.orgId,
      notebookId: body.notebookId,
      jobId,
      error: body.error || "job failed",
    });
    if (!existing) return reply.code(404).send({ error: "job not found" });
    return { ok: true };
  });
}
