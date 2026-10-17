import Fastify from "fastify";
import cors from "@fastify/cors";
import { MAX_UPLOAD_BYTES } from "@engineering-notebook/shared";
import { FirebaseAuthAdapter } from "./auth/firebaseAuthAdapter.js";
import { initFirestore } from "./db/firestore.js";
import { createStorage } from "./storage/gcsStorage.js";
import { createAuthGuard } from "./http/authPlugin.js";
import { observeRequest, setActiveCollaborationConnections } from "./metrics/store.js";
import { registerOrgRoutes } from "./routes/orgs.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerUserRoutes } from "./routes/users.js";
import { registerStaticAssetRoutes } from "./routes/staticAssets.js";
import { registerAuditRoutes } from "./routes/audits.js";
import { registerAiRoutes } from "./routes/ai.js";

/** Default 64 MiB — assets, logos, and compiled PDF exports share this Fastify limit. */
const bodyLimit = Number(process.env.BODY_LIMIT_BYTES || MAX_UPLOAD_BYTES);
const app = Fastify({ logger: true, bodyLimit });

/** Browser client (website :3000) calls this API cross-origin with Authorization. */
const corsOrigin = process.env.CORS_ORIGIN;
await app.register(cors, {
  origin: corsOrigin ? corsOrigin.split(",").map((s) => s.trim()) : true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "X-Internal-Secret"],
});

const auth = new FirebaseAuthAdapter();
const requireAuth = createAuthGuard(auth);
const authAttempts = new Map<string, { count: number; windowStart: number }>();

function allowAuthRequest(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequestsPerWindow = 60;
  const current = authAttempts.get(ip);
  if (!current || now - current.windowStart > windowMs) {
    authAttempts.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (current.count >= maxRequestsPerWindow) return false;
  current.count += 1;
  return true;
}

await initFirestore();
const storage = await createStorage();

app.addHook("onRequest", async (request) => {
  (request as { _start?: number })._start = Date.now();
});

app.addHook("onResponse", async (request, reply) => {
  const start = (request as { _start?: number })._start ?? Date.now();
  observeRequest(reply.statusCode, Date.now() - start);
});

app.setErrorHandler(async (error, _request, reply) => {
  const err = error as Error & { statusCode?: number };
  const status = err.statusCode ?? 500;
  if (status === 403) return reply.code(403).send({ error: "forbidden" });
  if (status === 401) return reply.code(401).send({ error: "unauthorized" });
  app.log.error(error);
  return reply.code(status).send({ error: err.message || "internal error" });
});

app.get("/health", async () => ({ status: "ok", service: "core" }));

app.get("/auth/session", async (request, reply) => {
  const ip = request.ip || "unknown";
  if (!allowAuthRequest(ip)) {
    return reply.code(429).send({ error: "too many requests" });
  }
  const header = request.headers.authorization;
  const token = typeof header === "string" ? header.replace(/^Bearer\s+/i, "") : "";
  if (!token) return reply.code(401).send({ error: "missing token" });
  return auth.verifySession(token);
});

app.register(async (scoped) => {
  scoped.addHook("preHandler", requireAuth);
  await registerUserRoutes(scoped);
  await registerOrgRoutes(scoped, storage);
  await registerAuditRoutes(scoped);
  await registerAiRoutes(scoped);
  await registerAdminRoutes(scoped);
});

await registerStaticAssetRoutes(app, storage);

app.post("/internal/collab/connections", async (request) => {
  const body = request.body as { activeConnections?: number };
  setActiveCollaborationConnections(body.activeConnections ?? 0);
  return { ok: true };
});

function assertInternalSecret(request: { headers: Record<string, unknown> }, reply: {
  code: (n: number) => { send: (b: unknown) => unknown };
}) {
  const secret = process.env.INTERNAL_SERVICE_SECRET;
  if (secret && request.headers["x-internal-secret"] !== secret) {
    return reply.code(403).send({ error: "forbidden" });
  }
  return null;
}

/** Collab loads persisted Yjs from Core storage (works with memory backend + fake-gcs). */
app.get("/internal/collab/yjs", async (request, reply) => {
  const denied = assertInternalSecret(request as { headers: Record<string, unknown> }, reply);
  if (denied) return denied;
  const q = request.query as { orgId?: string; notebookId?: string; entryId?: string };
  if (!q.orgId || !q.notebookId || !q.entryId) {
    return reply.code(400).send({ error: "orgId, notebookId, entryId required" });
  }
  const { entryPath, gcsKeys } = await import("@engineering-notebook/shared");
  const { getFirestore } = await import("./db/firestore.js");
  const snap = await getFirestore().doc(entryPath(q.orgId, q.notebookId, q.entryId)).get();
  if (!snap.exists) return reply.code(404).send({ error: "entry not found" });
  const meta = snap.data() as { yjsGcsPath?: string };
  const key = meta.yjsGcsPath || gcsKeys.yjs(q.orgId, q.notebookId, q.entryId);
  const buf = await storage.getObject(key);
  if (!buf) return reply.code(404).send({ error: "yjs not found" });
  return { yjsBase64: buf.toString("base64"), yjsGcsPath: key };
});

/** Internal flush helper used by collab service (shared secret optional). */
app.post("/internal/collab/flush", async (request, reply) => {
  const denied = assertInternalSecret(request as { headers: Record<string, unknown> }, reply);
  if (denied) return denied;
  const body = request.body as {
    orgId: string;
    notebookId: string;
    entryId: string;
    tipTapJson?: unknown;
    yjsBase64?: string;
    meta?: Record<string, unknown>;
  };
  const { entryPath, gcsKeys } = await import("@engineering-notebook/shared");
  const { getFirestore } = await import("./db/firestore.js");
  const ref = getFirestore().doc(entryPath(body.orgId, body.notebookId, body.entryId));
  const snap = await ref.get();
  if (!snap.exists) return reply.code(404).send({ error: "entry not found" });
  const existing = snap.data() as { tipTapRev?: number; yjsRev?: number };
  const tipTapKey = gcsKeys.tipTap(body.orgId, body.notebookId, body.entryId);
  const yjsKey = gcsKeys.yjs(body.orgId, body.notebookId, body.entryId);
  const tipTapRev = (existing.tipTapRev ?? 0) + 1;
  const yjsRev = (existing.yjsRev ?? 0) + 1;
  // Only persist real TipTap JSON — collab used to flush a stub that wiped content.
  if (body.tipTapJson !== undefined && body.tipTapJson !== null) {
    const stubby =
      typeof body.tipTapJson === "object" &&
      body.tipTapJson !== null &&
      Array.isArray((body.tipTapJson as { content?: unknown[] }).content) &&
      String(
        ((body.tipTapJson as { content?: Array<{ content?: Array<{ text?: string }> }> }).content?.[0]
          ?.content?.[0]?.text) || ""
      ).startsWith("[yjs-fragment");
    if (!stubby) {
      await storage.putObject(tipTapKey, JSON.stringify(body.tipTapJson), "application/json");
    }
  }
  if (body.yjsBase64) {
    await storage.putObject(yjsKey, Buffer.from(body.yjsBase64, "base64"), "application/octet-stream");
  }
  // Do not apply body.meta title/authors/phase/date — those are owned by entry PATCH.
  const patch: Record<string, unknown> = {
    tipTapGcsPath: tipTapKey,
    yjsGcsPath: yjsKey,
    tipTapRev,
    yjsRev,
    updatedAt: new Date().toISOString(),
  };
  await ref.update(patch);
  return { ok: true, tipTapRev, yjsRev };
});

const port = Number(process.env.PORT || 8080);
await app.listen({ port, host: "0.0.0.0" });
