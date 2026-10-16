import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import {
  auditsCollection,
  auditPath,
  defaultNotebookAccess,
  entriesCollection,
  memberPath,
  notebookPath,
  teamMemberPath,
  type NotebookAccess,
  type NotebookSummaryV5,
  type OrgRole,
  type RubricScorecard,
} from "@engineering-notebook/shared";
import { verifyBearer } from "./auth.js";
import { runByokAudit, runVertexAudit } from "./providers/router.js";

async function requireNotebookAccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { doc: (path: string) => { get: () => Promise<{ exists: boolean; data: () => any }> } },
  user: { uid: string; platformRole?: string },
  orgId: string,
  notebookId: string
) {
  if (user.platformRole === "service_admin") return;
  const member = await db.doc(memberPath(orgId, user.uid)).get();
  if (!member.exists) {
    const err = new Error("forbidden");
    (err as Error & { statusCode: number }).statusCode = 403;
    throw err;
  }
  const role = (member.data() as { role?: OrgRole }).role;
  if (role === "owner" || role === "admin") return;

  const nbSnap = await db.doc(notebookPath(orgId, notebookId)).get();
  if (!nbSnap.exists) {
    const err = new Error("not found");
    (err as Error & { statusCode: number }).statusCode = 404;
    throw err;
  }
  const access: NotebookAccess =
    (nbSnap.data() as NotebookSummaryV5).access ?? defaultNotebookAccess();
  if (access.mode === "org") return;
  if (access.userIds?.includes(user.uid)) return;
  for (const teamId of access.teamIds || []) {
    const tm = await db.doc(teamMemberPath(orgId, teamId, user.uid)).get();
    if (tm.exists) return;
  }
  const err = new Error("forbidden");
  (err as Error & { statusCode: number }).statusCode = 403;
  throw err;
}

const app = Fastify({ logger: true });

/** Browser client (website :3000) calls this API cross-origin with Authorization. */
const corsOrigin = process.env.CORS_ORIGIN;
await app.register(cors, {
  origin: corsOrigin ? corsOrigin.split(",").map((s) => s.trim()) : true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
});

async function getFirestore() {
  const admin = await import("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || "demo-engineering-notebook",
    });
  }
  return admin.firestore();
}

app.get("/health", async () => ({ status: "ok", service: "agents" }));

app.post("/v1/orgs/:orgId/notebooks/:notebookId/audit", async (request, reply) => {
  let user;
  try {
    user = await verifyBearer(request.headers.authorization);
  } catch (err) {
    return reply.code((err as { statusCode?: number }).statusCode ?? 401).send({
      error: (err as Error).message,
    });
  }

  const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
  const body = request.body as {
    provider?: "byok" | "vertex";
    rubric?: string;
    byokApiKey?: string;
    byokProvider?: string;
    entries?: Array<{ id: string; title: string; tipTapJson?: unknown }>;
  };

  const provider = body.provider ?? "byok";
  if (provider === "vertex" && !user.grants.platformAi && user.platformRole !== "service_admin") {
    return reply.code(403).send({ error: "platformAi grant required" });
  }

  try {
    const db = await getFirestore();
    await requireNotebookAccess(db, user, orgId, notebookId);
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode ?? 403;
    return reply.code(status).send({ error: (err as Error).message });
  }

  let entries = body.entries ?? [];
  if (!entries.length) {
    try {
      const db = await getFirestore();
      const snap = await db.collection(entriesCollection(orgId, notebookId)).get();
      entries = snap.docs.map((d) => {
        const data = d.data() as { title?: string };
        return { id: d.id, title: data.title ?? d.id };
      });
    } catch {
      entries = [];
    }
  }

  const rubric = body.rubric ?? "REC Foundation Design Award";
  const input = {
    notebookId,
    orgId,
    rubric,
    entries,
    byokApiKey: body.byokApiKey,
    byokProvider: body.byokProvider,
  };

  const result =
    provider === "vertex" ? await runVertexAudit(input) : await runByokAudit(input);

  const auditId = randomUUID();
  const scorecard: RubricScorecard = {
    id: auditId,
    orgId,
    notebookId,
    rubric,
    provider,
    scores: result.scores,
    advice: result.advice,
    summary: result.summary,
    createdBy: user.uid,
    createdAt: new Date().toISOString(),
  };

  try {
    const db = await getFirestore();
    await db.doc(auditPath(orgId, notebookId, auditId)).set(scorecard);
  } catch (err) {
    app.log.warn({ err }, "failed to persist audit");
  }

  return scorecard;
});

app.get("/v1/orgs/:orgId/notebooks/:notebookId/audits", async (request, reply) => {
  let user;
  try {
    user = await verifyBearer(request.headers.authorization);
  } catch (err) {
    return reply.code((err as { statusCode?: number }).statusCode ?? 401).send({
      error: (err as Error).message,
    });
  }
  const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
  try {
    const db = await getFirestore();
    await requireNotebookAccess(db, user, orgId, notebookId);
    const snap = await db.collection(auditsCollection(orgId, notebookId)).get();
    return snap.docs
      .map((d) => d.data())
      .sort((a, b) =>
        String((b as { createdAt?: string }).createdAt || "").localeCompare(
          String((a as { createdAt?: string }).createdAt || "")
        )
      );
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status) return reply.code(status).send({ error: (err as Error).message });
    app.log.error(err);
    return reply.code(500).send({ error: "failed to list audits" });
  }
});

const port = Number(process.env.PORT || 8000);
await app.listen({ port, host: "0.0.0.0" });
