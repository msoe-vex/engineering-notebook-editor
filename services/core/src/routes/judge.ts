import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import {
  gcsKeys,
  judgmentPath,
  judgmentsCollection,
  notebookPath,
  rubricPath,
  rubricsCollection,
  type JudgeResult,
  type NotebookRubric,
  type NotebookSummaryV5,
  type RubricMatrix,
} from "@engineering-notebook/shared";
import { getFirestore } from "../db/firestore.js";
import { omitUndefined } from "../db/sanitize.js";
import { isServiceAdmin, requireNotebookAccess } from "../rbac.js";
import { getUser } from "../http/authPlugin.js";
import type { StoragePort } from "../storage/storagePort.js";
import { createJobDispatch } from "../jobs/createJobDispatch.js";
import { enqueueNotebookJob } from "../jobs/enqueueJob.js";
import { completeJob, failJob, updateJobProgress } from "../jobs/jobStore.js";
import { publishNotebookEvent } from "../realtime/notebookEvents.js";

const jobDispatch = createJobDispatch();

function nowIso() {
  return new Date().toISOString();
}

async function assertNotebookAccess(
  user: ReturnType<typeof getUser>,
  orgId: string,
  notebookId: string
) {
  const snap = await getFirestore().doc(notebookPath(orgId, notebookId)).get();
  if (!snap.exists) {
    const err = new Error("not found");
    (err as Error & { statusCode: number }).statusCode = 404;
    throw err;
  }
  await requireNotebookAccess(user, orgId, snap.data() as NotebookSummaryV5);
}

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

function extForContentType(ct: string): string {
  const c = ct.toLowerCase();
  if (c.includes("pdf")) return ".pdf";
  if (c.includes("markdown") || c.includes("md")) return ".md";
  if (c.includes("html")) return ".html";
  if (c.includes("word") || c.includes("docx")) return ".docx";
  return ".txt";
}

function emptyRubricMatrix(title = "Custom rubric"): RubricMatrix {
  const levels = [
    { id: "beginning", label: "Beginning", description: "", points: 1 },
    { id: "developing", label: "Developing", description: "", points: 2 },
    { id: "proficient", label: "Proficient", description: "", points: 3 },
    { id: "exemplary", label: "Exemplary", description: "", points: 4 },
  ];
  return {
    title,
    categories: [
      {
        id: "criterion-1",
        name: "Criterion 1",
        description: "",
        maxPoints: 4,
        levels: levels.map((l) => ({ ...l })),
      },
    ],
    totalMaxPoints: 4,
  };
}

function sanitizeMatrix(input: RubricMatrix | undefined, fallbackTitle: string): RubricMatrix | null {
  if (!input || !Array.isArray(input.categories) || input.categories.length === 0) return null;
  const categories = input.categories
    .map((cat, i) => {
      const levels = (cat.levels || [])
        .map((l, j) => ({
          id: String(l.id || `level-${j + 1}`).slice(0, 80),
          label: String(l.label || `Level ${j + 1}`).slice(0, 120),
          description: String(l.description || "").slice(0, 4000),
          points: Number(l.points) || 0,
        }))
        .slice(0, 12);
      if (!levels.length) return null;
      const maxFromLevels = Math.max(...levels.map((l) => l.points));
      return {
        id: String(cat.id || `criterion-${i + 1}`).slice(0, 80),
        name: String(cat.name || `Criterion ${i + 1}`).slice(0, 200),
        section: cat.section ? String(cat.section).slice(0, 200) : undefined,
        description: cat.description ? String(cat.description).slice(0, 2000) : undefined,
        maxPoints: Number(cat.maxPoints) || maxFromLevels,
        levels,
      };
    })
    .filter(Boolean) as RubricMatrix["categories"];
  if (!categories.length) return null;
  const sum = categories.reduce((s, c) => s + c.maxPoints, 0);
  return {
    title: String(input.title || fallbackTitle).slice(0, 200),
    sourceName: input.sourceName ? String(input.sourceName).slice(0, 200) : undefined,
    categories,
    totalMaxPoints: Number(input.totalMaxPoints) || sum,
  };
}

type InferenceBody = {
  inference?: "vertex" | "byok";
  byok?: { provider?: string; apiKey?: string; model?: string };
};

function parseInference(
  body: InferenceBody,
  user: ReturnType<typeof getUser>
):
  | { ok: true; inference: "vertex" | "byok"; dispatchPayload?: Record<string, unknown> }
  | { ok: false; status: number; error: string } {
  const inference = body.inference || "byok";
  if (inference !== "vertex" && inference !== "byok") {
    return { ok: false, status: 400, error: "inference must be vertex|byok" };
  }
  if (inference === "vertex" && !user.grants?.platformAi && !isServiceAdmin(user)) {
    return {
      ok: false,
      status: 403,
      error: "platformAi grant required for Vertex (or use BYOK)",
    };
  }
  if (inference === "byok") {
    const provider = body.byok?.provider;
    const apiKey = body.byok?.apiKey?.trim();
    const model = body.byok?.model?.trim();
    if (provider !== "openai" && provider !== "anthropic" && provider !== "gemini") {
      return {
        ok: false,
        status: 400,
        error: "byok.provider must be openai|anthropic|gemini",
      };
    }
    if (!apiKey || !model) {
      return { ok: false, status: 400, error: "byok.apiKey and byok.model required" };
    }
    return {
      ok: true,
      inference,
      dispatchPayload: { byok: { provider, apiKey, model } },
    };
  }
  return { ok: true, inference };
}

/**
 * User-facing rubric upload + judge enqueue (call from auth-scoped Fastify).
 */
export async function registerJudgeUserRoutes(app: FastifyInstance, storage: StoragePort) {
  const db = () => getFirestore();

  app.get("/orgs/:orgId/notebooks/:notebookId/rubrics", async (request) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookAccess(user, orgId, notebookId);
    const trashedOnly = String((request.query as { trashed?: string }).trashed || "") === "1";
    const snap = await db().collection(rubricsCollection(orgId, notebookId)).get();
    return snap.docs
      .map((d) => ({ ...(d.data() as NotebookRubric), id: d.id }))
      .filter((r) => {
        if (trashedOnly) return Boolean(r.deletedAt);
        // Hide in-progress extract drafts until ready (they are not "created" for the user yet).
        return !r.deletedAt && r.status === "ready";
      })
      .sort((a, b) =>
        String((b as { createdAt?: string }).createdAt || "").localeCompare(
          String((a as { createdAt?: string }).createdAt || "")
        )
      );
  });

  app.get("/orgs/:orgId/notebooks/:notebookId/rubrics/:rubricId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, rubricId } = request.params as {
      orgId: string;
      notebookId: string;
      rubricId: string;
    };
    await assertNotebookAccess(user, orgId, notebookId);
    const snap = await db().doc(rubricPath(orgId, notebookId, rubricId)).get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    return { id: snap.id, ...snap.data() };
  });

  /** Upload rubric source (text/pdf/docx). Body = raw bytes; Content-Type + optional X-Rubric-Name. */
  app.post("/orgs/:orgId/notebooks/:notebookId/rubrics", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookAccess(user, orgId, notebookId);

    const contentType = String(request.headers["content-type"] || "application/octet-stream")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const nameHeader = request.headers["x-rubric-name"];
    const nameQuery = (request.query as { name?: string }).name;
    const name =
      (typeof nameHeader === "string" && nameHeader.trim()) ||
      (typeof nameQuery === "string" && nameQuery.trim()) ||
      `Rubric ${new Date().toLocaleDateString()}`;

    const body = request.body as NodeJS.ReadableStream | Uint8Array | Buffer | string | undefined;
    let data: Buffer;
    if (typeof body === "string") {
      data = Buffer.from(body, "utf8");
    } else if (body instanceof Uint8Array || Buffer.isBuffer(body)) {
      data = Buffer.from(body);
    } else if (body && typeof (body as NodeJS.ReadableStream).pipe === "function") {
      const chunks: Buffer[] = [];
      for await (const chunk of body as AsyncIterable<Buffer | string>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      data = Buffer.concat(chunks);
    } else {
      return reply.code(400).send({ error: "expected rubric file body" });
    }
    if (data.byteLength === 0) return reply.code(400).send({ error: "empty rubric" });
    if (data.byteLength > 20 * 1024 * 1024) {
      return reply.code(413).send({ error: "rubric too large (max 20 MiB)" });
    }

    const id = randomUUID();
    const ext = extForContentType(contentType);
    const key = gcsKeys.rubricSource(orgId, notebookId, id, ext);
    await storage.putObject(key, data, contentType);

    const ts = nowIso();
    // Draft only — hidden from list until extract finishes (status → ready).
    const doc: NotebookRubric = omitUndefined({
      id,
      orgId,
      notebookId,
      name: name.slice(0, 200),
      sourceContentType: contentType,
      sourceGcsPath: key,
      status: "uploaded",
      createdBy: user.uid,
      createdAt: ts,
      updatedAt: ts,
    }) as NotebookRubric;

    await db().doc(rubricPath(orgId, notebookId, id)).set(doc);
    return reply.code(201).send(doc);
  });

  /** Create a blank/custom rubric matrix (no source file). Ready to edit + score. */
  app.post("/orgs/:orgId/notebooks/:notebookId/rubrics/custom", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookAccess(user, orgId, notebookId);
    const body = (request.body || {}) as { name?: string; matrix?: RubricMatrix };
    const id = randomUUID();
    const ts = nowIso();
    const name = (body.name?.trim() || `Custom rubric ${new Date().toLocaleDateString()}`).slice(
      0,
      200
    );
    const matrix = sanitizeMatrix(body.matrix, name) || emptyRubricMatrix(name);
    const doc: NotebookRubric = omitUndefined({
      id,
      orgId,
      notebookId,
      name,
      matrix,
      status: "ready",
      createdBy: user.uid,
      createdAt: ts,
      updatedAt: ts,
    }) as NotebookRubric;
    await db().doc(rubricPath(orgId, notebookId, id)).set(doc);
    return reply.code(201).send(doc);
  });

  /** Edit rubric name / matrix after extract (or for custom rubrics). */
  app.patch("/orgs/:orgId/notebooks/:notebookId/rubrics/:rubricId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, rubricId } = request.params as {
      orgId: string;
      notebookId: string;
      rubricId: string;
    };
    await assertNotebookAccess(user, orgId, notebookId);
    const ref = db().doc(rubricPath(orgId, notebookId, rubricId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    const prev = snap.data() as NotebookRubric;
    if (prev.deletedAt) {
      return reply.code(400).send({ error: "rubric is in trash — restore it first" });
    }
    const body = (request.body || {}) as { name?: string; matrix?: RubricMatrix };
    const patch: Record<string, unknown> = { updatedAt: nowIso() };
    if (typeof body.name === "string" && body.name.trim()) {
      patch.name = body.name.trim().slice(0, 200);
    }
    if (body.matrix) {
      const matrix = sanitizeMatrix(body.matrix, String(patch.name || prev.name || "Rubric"));
      if (!matrix) return reply.code(400).send({ error: "matrix must include categories" });
      patch.matrix = matrix;
      patch.status = "ready";
      patch.error = "";
    }
    await ref.update(omitUndefined(patch));
    return { id: rubricId, ...(await ref.get()).data() };
  });

  /** Soft-delete: move rubric to Trash. */
  app.delete(
    "/orgs/:orgId/notebooks/:notebookId/rubrics/:rubricId",
    async (request, reply) => {
      const user = getUser(request);
      const { orgId, notebookId, rubricId } = request.params as {
        orgId: string;
        notebookId: string;
        rubricId: string;
      };
      await assertNotebookAccess(user, orgId, notebookId);
      const ref = db().doc(rubricPath(orgId, notebookId, rubricId));
      const snap = await ref.get();
      if (!snap.exists) return reply.code(404).send({ error: "not found" });
      const prev = snap.data() as NotebookRubric;
      if (prev.deletedAt) {
        return { ok: true, id: rubricId, deletedAt: prev.deletedAt, alreadyTrashed: true };
      }
      const ts = nowIso();
      await ref.update({ deletedAt: ts, updatedAt: ts });
      return { ok: true, id: rubricId, deletedAt: ts };
    }
  );

  app.post(
    "/orgs/:orgId/notebooks/:notebookId/rubrics/:rubricId/restore",
    async (request, reply) => {
      const user = getUser(request);
      const { orgId, notebookId, rubricId } = request.params as {
        orgId: string;
        notebookId: string;
        rubricId: string;
      };
      await assertNotebookAccess(user, orgId, notebookId);
      const ref = db().doc(rubricPath(orgId, notebookId, rubricId));
      const snap = await ref.get();
      if (!snap.exists) return reply.code(404).send({ error: "not found" });
      const prev = snap.data() as NotebookRubric;
      if (!prev.deletedAt) {
        return { ok: true, id: rubricId, ...(prev as object), alreadyRestored: true };
      }
      const ts = nowIso();
      await ref.update({ deletedAt: null, updatedAt: ts });
      return { ...prev, id: rubricId, deletedAt: null, updatedAt: ts };
    }
  );

  /** Hard-delete rubric source + Firestore doc (empty trash / delete forever). */
  app.delete(
    "/orgs/:orgId/notebooks/:notebookId/rubrics/:rubricId/permanent",
    async (request, reply) => {
      const user = getUser(request);
      const { orgId, notebookId, rubricId } = request.params as {
        orgId: string;
        notebookId: string;
        rubricId: string;
      };
      await assertNotebookAccess(user, orgId, notebookId);
      const ref = db().doc(rubricPath(orgId, notebookId, rubricId));
      const snap = await ref.get();
      if (!snap.exists) return reply.code(404).send({ error: "not found" });
      const prev = snap.data() as NotebookRubric;
      if (prev.sourceGcsPath) {
        try {
          await storage.deleteObject(prev.sourceGcsPath);
        } catch (err) {
          console.warn("[judge] delete rubric source failed", prev.sourceGcsPath, err);
        }
      }
      await ref.delete();
      return { ok: true };
    }
  );

  /**
   * Extract/normalize uploaded rubric source into the standard matrix (no notebook scoring).
   * Returns 202 { jobId }.
   */
  app.post(
    "/orgs/:orgId/notebooks/:notebookId/rubrics/:rubricId/normalize",
    async (request, reply) => {
      const user = getUser(request);
      const { orgId, notebookId, rubricId } = request.params as {
        orgId: string;
        notebookId: string;
        rubricId: string;
      };
      await assertNotebookAccess(user, orgId, notebookId);
      const rubricSnap = await db().doc(rubricPath(orgId, notebookId, rubricId)).get();
      if (!rubricSnap.exists) return reply.code(404).send({ error: "rubric not found" });
      const rubric = rubricSnap.data() as NotebookRubric;
      if (rubric.deletedAt) {
        return reply.code(400).send({ error: "rubric is in trash — restore it first" });
      }
      if (!rubric.sourceGcsPath) {
        return reply.code(400).send({
          error: "custom rubric has no source file — edit the matrix directly",
        });
      }

      const parsed = parseInference((request.body || {}) as InferenceBody, user);
      if (!parsed.ok) return reply.code(parsed.status).send({ error: parsed.error });

      await db().doc(rubricPath(orgId, notebookId, rubricId)).update({
        status: "normalizing",
        error: "",
        updatedAt: nowIso(),
      });

      const result = await enqueueNotebookJob({
        orgId,
        notebookId,
        type: "judge",
        resourceKey: `rubric-normalize:${rubricId}`,
        payload: {
          rubricId,
          phase: "normalize",
          inference: parsed.inference,
        },
        dispatchPayload: parsed.dispatchPayload,
        createdBy: user.uid,
        dispatch: jobDispatch,
      });

      if (result.ok) {
        return reply.code(202).send({ ok: true, jobId: result.job.jobId, rubricId });
      }
      if (result.status === 409) {
        return reply.code(409).send({
          error: "job_in_flight",
          jobId: result.job.jobId,
        });
      }
      await db().doc(rubricPath(orgId, notebookId, rubricId)).update({
        status: "failed",
        error: result.error,
        updatedAt: nowIso(),
      });
      return reply.code(result.status).send({
        error: result.code,
        message: result.error,
        jobId: "jobId" in result ? result.jobId : undefined,
      });
    }
  );

  app.get("/orgs/:orgId/notebooks/:notebookId/judgments", async (request) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookAccess(user, orgId, notebookId);
    const snap = await db().collection(judgmentsCollection(orgId, notebookId)).get();
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as object) }))
      .sort((a, b) =>
        String((b as { createdAt?: string }).createdAt || "").localeCompare(
          String((a as { createdAt?: string }).createdAt || "")
        )
      );
  });

  app.get(
    "/orgs/:orgId/notebooks/:notebookId/judgments/:judgmentId",
    async (request, reply) => {
      const user = getUser(request);
      const { orgId, notebookId, judgmentId } = request.params as {
        orgId: string;
        notebookId: string;
        judgmentId: string;
      };
      await assertNotebookAccess(user, orgId, notebookId);
      const snap = await db().doc(judgmentPath(orgId, notebookId, judgmentId)).get();
      if (!snap.exists) return reply.code(404).send({ error: "not found" });
      return { id: snap.id, ...snap.data() };
    }
  );

  /** Delete one past grade (judgment). */
  app.delete(
    "/orgs/:orgId/notebooks/:notebookId/judgments/:judgmentId",
    async (request, reply) => {
      const user = getUser(request);
      const { orgId, notebookId, judgmentId } = request.params as {
        orgId: string;
        notebookId: string;
        judgmentId: string;
      };
      await assertNotebookAccess(user, orgId, notebookId);
      const ref = db().doc(judgmentPath(orgId, notebookId, judgmentId));
      const snap = await ref.get();
      if (!snap.exists) return reply.code(404).send({ error: "not found" });
      await ref.delete();
      return { ok: true };
    }
  );

  /** Clear all past grades for the notebook. */
  app.delete("/orgs/:orgId/notebooks/:notebookId/judgments", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookAccess(user, orgId, notebookId);
    const snap = await db().collection(judgmentsCollection(orgId, notebookId)).get();
    const batchSize = 400;
    let deleted = 0;
    let batch = db().batch();
    let ops = 0;
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
      ops++;
      deleted++;
      if (ops >= batchSize) {
        await batch.commit();
        batch = db().batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
    return { ok: true, deleted };
  });

  /**
   * Score the notebook against a ready rubric matrix (does not re-extract the PDF).
   * Returns 202 { jobId, judgmentId }.
   *
   * inference: `vertex` | `byok` (keys dispatch-only).
   */
  app.post("/orgs/:orgId/notebooks/:notebookId/judge", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookAccess(user, orgId, notebookId);

    const body = (request.body || {}) as InferenceBody & { rubricId?: string };
    const rubricId = body.rubricId?.trim();
    if (!rubricId) return reply.code(400).send({ error: "rubricId required" });

    const parsed = parseInference(body, user);
    if (!parsed.ok) return reply.code(parsed.status).send({ error: parsed.error });

    const rubricSnap = await db().doc(rubricPath(orgId, notebookId, rubricId)).get();
    if (!rubricSnap.exists) return reply.code(404).send({ error: "rubric not found" });
    const rubric = rubricSnap.data() as NotebookRubric;
    if (rubric.deletedAt) {
      return reply.code(400).send({ error: "rubric is in trash — restore it first" });
    }
    if (!rubric.matrix?.categories?.length || rubric.status !== "ready") {
      return reply.code(400).send({
        error: "rubric_not_ready",
        message:
          "Extract or edit the rubric matrix first (status must be ready with categories).",
      });
    }

    const judgmentId = randomUUID();
    const ts = nowIso();
    const placeholder: JudgeResult = {
      id: judgmentId,
      orgId,
      notebookId,
      rubricId,
      rubricName: rubric.name,
      matrix: rubric.matrix,
      categories: [],
      totalPoints: 0,
      totalMaxPoints: rubric.matrix.totalMaxPoints || 0,
      summary: "",
      status: "running",
      createdBy: user.uid,
      createdAt: ts,
      updatedAt: ts,
    };
    await db().doc(judgmentPath(orgId, notebookId, judgmentId)).set(placeholder);

    const result = await enqueueNotebookJob({
      orgId,
      notebookId,
      type: "judge",
      resourceKey: `rubric-score:${rubricId}`,
      payload: {
        rubricId,
        judgmentId,
        phase: "score",
        inference: parsed.inference,
      },
      dispatchPayload: parsed.dispatchPayload,
      createdBy: user.uid,
      dispatch: jobDispatch,
    });

    if (result.ok) {
      await db()
        .doc(judgmentPath(orgId, notebookId, judgmentId))
        .update({ jobId: result.job.jobId, updatedAt: nowIso() });
      return reply.code(202).send({
        ok: true,
        jobId: result.job.jobId,
        judgmentId,
      });
    }
    if (result.status === 409) {
      await db().doc(judgmentPath(orgId, notebookId, judgmentId)).delete().catch(() => undefined);
      return reply.code(409).send({
        error: "job_in_flight",
        jobId: result.job.jobId,
      });
    }
    await db()
      .doc(judgmentPath(orgId, notebookId, judgmentId))
      .update({
        status: "failed",
        error: result.error,
        updatedAt: nowIso(),
      });
    return reply.code(result.status).send({
      error: result.code,
      message: result.error,
      judgmentId,
      jobId: "jobId" in result ? result.jobId : undefined,
    });
  });
}

/** Internal worker callbacks (no user auth — x-internal-secret). */
export async function registerJudgeInternalRoutes(app: FastifyInstance, storage: StoragePort) {
  const db = () => getFirestore();

  async function discardRubricSource(orgId: string, notebookId: string, rubricId: string) {
    const ref = db().doc(rubricPath(orgId, notebookId, rubricId));
    const snap = await ref.get();
    if (!snap.exists) return;
    const prev = snap.data() as NotebookRubric & { rawText?: string };
    if (prev.sourceGcsPath) {
      try {
        await storage.deleteObject(prev.sourceGcsPath);
      } catch (err) {
        console.warn("[judge] discard rubric source failed", prev.sourceGcsPath, err);
      }
    }
    await ref.update({
      sourceGcsPath: "",
      sourceContentType: "",
      rawText: "",
      updatedAt: nowIso(),
    });
  }

  async function deleteDraftRubric(orgId: string, notebookId: string, rubricId: string) {
    const ref = db().doc(rubricPath(orgId, notebookId, rubricId));
    const snap = await ref.get();
    if (!snap.exists) return;
    const prev = snap.data() as NotebookRubric;
    // Only auto-delete incomplete extract drafts — never wipe a ready rubric.
    if (prev.status === "ready" && prev.matrix?.categories?.length) return;
    if (prev.sourceGcsPath) {
      try {
        await storage.deleteObject(prev.sourceGcsPath);
      } catch (err) {
        console.warn("[judge] delete draft source failed", prev.sourceGcsPath, err);
      }
    }
    await ref.delete();
  }

  app.get("/internal/judge/rubric", async (request, reply) => {
    const denied = assertInternalSecret(
      request as { headers: Record<string, unknown> },
      reply
    );
    if (denied) return denied;
    const q = request.query as { orgId?: string; notebookId?: string; rubricId?: string };
    if (!q.orgId || !q.notebookId || !q.rubricId) {
      return reply.code(400).send({ error: "orgId, notebookId, rubricId required" });
    }
    const snap = await db().doc(rubricPath(q.orgId, q.notebookId, q.rubricId)).get();
    if (!snap.exists) return reply.code(404).send({ error: "rubric not found" });
    return { id: snap.id, ...snap.data() };
  });

  app.patch("/internal/judge/rubric", async (request, reply) => {
    const denied = assertInternalSecret(
      request as { headers: Record<string, unknown> },
      reply
    );
    if (denied) return denied;
    const body = request.body as {
      orgId?: string;
      notebookId?: string;
      rubricId?: string;
      status?: NotebookRubric["status"];
      matrix?: RubricMatrix;
      error?: string;
    };
    if (!body.orgId || !body.notebookId || !body.rubricId) {
      return reply.code(400).send({ error: "orgId, notebookId, rubricId required" });
    }
    const ref = db().doc(rubricPath(body.orgId, body.notebookId, body.rubricId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "rubric not found" });
    const patch = omitUndefined({
      status: body.status,
      matrix: body.matrix,
      error: body.error,
      updatedAt: nowIso(),
    });
    await ref.update(patch);
    return { ok: true, ...(await ref.get()).data() };
  });

  /** Mark a normalize-only job succeeded; discard temp source file. */
  app.post("/internal/judge/normalize-complete", async (request, reply) => {
    const denied = assertInternalSecret(
      request as { headers: Record<string, unknown> },
      reply
    );
    if (denied) return denied;
    const body = request.body as {
      orgId?: string;
      notebookId?: string;
      jobId?: string;
      rubricId?: string;
    };
    if (!body.orgId || !body.notebookId || !body.jobId) {
      return reply.code(400).send({ error: "orgId, notebookId, jobId required" });
    }

    if (body.rubricId) {
      await discardRubricSource(body.orgId, body.notebookId, body.rubricId);
    }

    await completeJob({
      orgId: body.orgId,
      notebookId: body.notebookId,
      jobId: body.jobId,
      result: { rubricId: body.rubricId, phase: "normalize" },
    });
    return { ok: true };
  });

  app.post("/internal/judge/complete", async (request, reply) => {
    const denied = assertInternalSecret(
      request as { headers: Record<string, unknown> },
      reply
    );
    if (denied) return denied;
    const body = request.body as {
      orgId?: string;
      notebookId?: string;
      judgmentId?: string;
      jobId?: string;
      result?: Omit<JudgeResult, "id" | "orgId" | "notebookId" | "createdBy" | "createdAt">;
    };
    if (!body.orgId || !body.notebookId || !body.judgmentId || !body.result) {
      return reply.code(400).send({ error: "orgId, notebookId, judgmentId, result required" });
    }
    const ref = db().doc(judgmentPath(body.orgId, body.notebookId, body.judgmentId));
    const existing = await ref.get();
    if (!existing.exists) return reply.code(404).send({ error: "judgment not found" });
    const prev = existing.data() as JudgeResult;
    const ts = nowIso();
    const merged: JudgeResult = {
      ...prev,
      ...body.result,
      id: body.judgmentId,
      orgId: body.orgId,
      notebookId: body.notebookId,
      status: "completed",
      jobId: body.jobId || prev.jobId,
      updatedAt: ts,
    };
    await ref.set(omitUndefined(merged) as JudgeResult);

    if (body.jobId) {
      await completeJob({
        orgId: body.orgId,
        notebookId: body.notebookId,
        jobId: body.jobId,
        result: {
          judgmentId: body.judgmentId,
          totalPoints: merged.totalPoints,
          totalMaxPoints: merged.totalMaxPoints,
        },
      });
    }

    publishNotebookEvent(body.orgId, body.notebookId, {
      type: "notebook.updated",
      notebook: { id: body.notebookId },
      at: ts,
    });

    return { ok: true, judgment: merged };
  });

  app.post("/internal/judge/failed", async (request, reply) => {
    const denied = assertInternalSecret(
      request as { headers: Record<string, unknown> },
      reply
    );
    if (denied) return denied;
    const body = request.body as {
      orgId?: string;
      notebookId?: string;
      judgmentId?: string;
      jobId?: string;
      rubricId?: string;
      error?: string;
    };
    if (!body.orgId || !body.notebookId) {
      return reply.code(400).send({ error: "orgId and notebookId required" });
    }
    const ts = nowIso();
    if (body.judgmentId) {
      const ref = db().doc(judgmentPath(body.orgId, body.notebookId, body.judgmentId));
      const snap = await ref.get();
      if (snap.exists) {
        await ref.update({
          status: "failed",
          error: body.error || "judge failed",
          updatedAt: ts,
        });
      }
    }
    // Extract drafts that never became ready are removed so they never appear as "created".
    if (body.rubricId && !body.judgmentId) {
      await deleteDraftRubric(body.orgId, body.notebookId, body.rubricId);
    }
    if (body.jobId) {
      await failJob({
        orgId: body.orgId,
        notebookId: body.notebookId,
        jobId: body.jobId,
        error: body.error || "judge failed",
      });
    }
    return { ok: true };
  });

  app.post("/internal/judge/progress", async (request, reply) => {
    const denied = assertInternalSecret(
      request as { headers: Record<string, unknown> },
      reply
    );
    if (denied) return denied;
    const body = request.body as {
      orgId?: string;
      notebookId?: string;
      jobId?: string;
      status?: string;
      progress?: number;
    };
    if (!body.orgId || !body.notebookId || !body.jobId) {
      return reply.code(400).send({ error: "orgId, notebookId, jobId required" });
    }
    await updateJobProgress({
      orgId: body.orgId,
      notebookId: body.notebookId,
      jobId: body.jobId,
      statusMessage: body.status,
      progress: body.progress,
    });
    return { ok: true };
  });
}
