import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import {
  auditsCollection,
  auditPath,
  entriesCollection,
  memberPath,
  type RubricScorecard,
} from "@engineering-notebook/shared";
import { verifyBearer } from "./auth.js";
import { runByokAudit, runVertexAudit } from "./providers/router.js";

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
    if (user.platformRole !== "service_admin") {
      const member = await db.doc(memberPath(orgId, user.uid)).get();
      if (!member.exists) return reply.code(403).send({ error: "forbidden" });
    }
  } catch {
    /* membership check soft-fail when firestore down in pure stub mode */
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
    if (user.platformRole !== "service_admin") {
      const member = await db.doc(memberPath(orgId, user.uid)).get();
      if (!member.exists) return reply.code(403).send({ error: "forbidden" });
    }
    const snap = await db.collection(auditsCollection(orgId, notebookId)).get();
    return snap.docs.map((d) => d.data());
  } catch (err) {
    app.log.error(err);
    return reply.code(500).send({ error: "failed to list audits" });
  }
});

const port = Number(process.env.PORT || 8000);
await app.listen({ port, host: "0.0.0.0" });
