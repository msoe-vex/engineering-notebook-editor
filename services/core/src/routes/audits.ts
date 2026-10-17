import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import {
  auditPath,
  auditsCollection,
  notebookPath,
  type AuditProvider,
  type AuditStatus,
  type AuditStep,
  type NotebookSummaryV5,
  type RubricScorecard,
} from "@engineering-notebook/shared";
import { getFirestore } from "../db/firestore.js";
import { omitUndefined } from "../db/sanitize.js";
import { requireNotebookAccess } from "../rbac.js";
import { getUser } from "../http/authPlugin.js";

const PROVIDERS = new Set<AuditProvider>(["byok", "vertex", "local"]);
const STATUSES = new Set<AuditStatus>(["running", "completed", "failed"]);

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

function asSteps(raw: unknown): AuditStep[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: AuditStep[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    if (typeof s.message !== "string" || typeof s.at !== "string") continue;
    out.push(
      omitUndefined({
        at: s.at,
        message: s.message.slice(0, 2000),
        entryId:
          s.entryId === null
            ? null
            : typeof s.entryId === "string"
              ? s.entryId
              : undefined,
      }) as AuditStep
    );
  }
  return out.slice(0, 200);
}

export async function registerAuditRoutes(app: FastifyInstance) {
  const db = () => getFirestore();

  app.get("/orgs/:orgId/notebooks/:notebookId/audits", async (request) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookAccess(user, orgId, notebookId);
    const snap = await db().collection(auditsCollection(orgId, notebookId)).get();
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as object) }))
      .sort((a, b) =>
        String((b as { createdAt?: string }).createdAt || "").localeCompare(
          String((a as { createdAt?: string }).createdAt || "")
        )
      );
  });

  app.get("/orgs/:orgId/notebooks/:notebookId/audits/:auditId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, auditId } = request.params as {
      orgId: string;
      notebookId: string;
      auditId: string;
    };
    await assertNotebookAccess(user, orgId, notebookId);
    const snap = await db().doc(auditPath(orgId, notebookId, auditId)).get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    return { id: snap.id, ...snap.data() };
  });

  app.post("/orgs/:orgId/notebooks/:notebookId/audits", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookAccess(user, orgId, notebookId);

    const body = (request.body || {}) as {
      rubric?: string;
      provider?: string;
      status?: string;
      scores?: Record<string, number>;
      advice?: Array<{ entryId: string | null; message: string }>;
      summary?: string;
      steps?: unknown;
    };

    const provider = PROVIDERS.has(body.provider as AuditProvider)
      ? (body.provider as AuditProvider)
      : "byok";
    const status = STATUSES.has(body.status as AuditStatus)
      ? (body.status as AuditStatus)
      : "running";
    const now = new Date().toISOString();
    const id = randomUUID();
    const scorecard: RubricScorecard = omitUndefined({
      id,
      orgId,
      notebookId,
      rubric:
        typeof body.rubric === "string" && body.rubric.trim()
          ? body.rubric.trim().slice(0, 500)
          : "REC Foundation Design Award",
      provider,
      status,
      scores: body.scores && typeof body.scores === "object" ? body.scores : {},
      advice: Array.isArray(body.advice) ? body.advice.slice(0, 100) : [],
      summary: typeof body.summary === "string" ? body.summary.slice(0, 8000) : undefined,
      steps: asSteps(body.steps),
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
    }) as RubricScorecard;

    await db().doc(auditPath(orgId, notebookId, id)).set(scorecard);
    return reply.code(201).send(scorecard);
  });

  app.patch("/orgs/:orgId/notebooks/:notebookId/audits/:auditId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, auditId } = request.params as {
      orgId: string;
      notebookId: string;
      auditId: string;
    };
    await assertNotebookAccess(user, orgId, notebookId);

    const ref = db().doc(auditPath(orgId, notebookId, auditId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });

    const body = (request.body || {}) as {
      status?: string;
      scores?: Record<string, number>;
      advice?: Array<{ entryId: string | null; message: string }>;
      summary?: string;
      steps?: unknown;
      error?: string | null;
      rubric?: string;
      provider?: string;
    };

    const patch: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (STATUSES.has(body.status as AuditStatus)) patch.status = body.status;
    if (body.scores && typeof body.scores === "object") patch.scores = body.scores;
    if (Array.isArray(body.advice)) patch.advice = body.advice.slice(0, 100);
    if (typeof body.summary === "string") patch.summary = body.summary.slice(0, 8000);
    if (body.steps !== undefined) patch.steps = asSteps(body.steps) ?? [];
    if (body.error === null) patch.error = null;
    else if (typeof body.error === "string") patch.error = body.error.slice(0, 4000);
    if (typeof body.rubric === "string" && body.rubric.trim()) {
      patch.rubric = body.rubric.trim().slice(0, 500);
    }
    if (PROVIDERS.has(body.provider as AuditProvider)) patch.provider = body.provider;

    await ref.update(omitUndefined(patch));
    const next = await ref.get();
    return { id: next.id, ...next.data() };
  });
}
