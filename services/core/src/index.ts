import Fastify from "fastify";
import cors from "@fastify/cors";
import { MAX_UPLOAD_BYTES } from "@engineering-notebook/shared";
import { FirebaseAuthAdapter } from "./auth/firebaseAuthAdapter.js";
import { BetterAuthAdapter } from "./auth/betterAuthAdapter.js";
import { initFirestore } from "./db/firestore.js";
import { createStorage } from "./storage/gcsStorage.js";
import { createAuthGuard } from "./http/authPlugin.js";
import {
  assertInternalSecret,
  assertInternalSecretBootConfig,
} from "./http/internalAuth.js";
import { limitAuthIp, rateLimitReply } from "./http/rateLimit.js";
import {
  observeRequest,
  setActiveCollaborationConnections,
  startMetricsPersistence,
} from "./metrics/store.js";
import { createNotificationPort } from "./notifications/notificationPort.js";
import { registerOrgRoutes } from "./routes/org.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerUserRoutes } from "./routes/user.js";
import { registerStaticAssetRoutes } from "./routes/staticAssets.js";
import { registerAiRoutes, registerInternalAiRoutes } from "./routes/ai.js";
import { registerInternalCompileRoutes } from "./routes/internalCompile.js";
import { registerInternalJobRoutes } from "./routes/internalJobs.js";
import { registerInternalMetadataRoutes } from "./routes/internalMetadata.js";
import { registerJudgeInternalRoutes, registerJudgeUserRoutes } from "./routes/judge.js";
import { registerPublicRoutes } from "./routes/public.js";

/** Default 64 MiB — assets, logos, and compiled PDF exports share this Fastify limit. */
const bodyLimit = Number(process.env.BODY_LIMIT_BYTES || MAX_UPLOAD_BYTES);
const app = Fastify({ logger: true, bodyLimit });

assertInternalSecretBootConfig(app.log);

/** Browser client (website :3000) calls this API cross-origin with Authorization. */
const corsOrigin = process.env.CORS_ORIGIN?.trim();
const isProd = process.env.NODE_ENV === "production";
if (isProd && !corsOrigin) {
  app.log.warn(
    "[core] CORS_ORIGIN unset in production — defaulting to deny-all browser origins (set comma-separated allowlist)"
  );
}
await app.register(cors, {
  origin: corsOrigin
    ? corsOrigin.split(",").map((s) => s.trim()).filter(Boolean)
    : isProd
      ? false
      : true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Authorization",
    "Content-Type",
    "Accept",
    "X-Internal-Secret",
    "X-Rubric-Name",
  ],
});

const auth =
  process.env.AUTH_PROVIDER === "better-auth"
    ? new BetterAuthAdapter()
    : new FirebaseAuthAdapter();
const requireAuth = createAuthGuard(auth);
const notifications = createNotificationPort();

await initFirestore();
const storage = await createStorage();

app.addHook("onRequest", async (request) => {
  (request as { _start?: number })._start = Date.now();
});

app.addHook("onSend", async (_request, reply, payload) => {
  reply.header("x-content-type-options", "nosniff");
  reply.header("x-frame-options", "DENY");
  reply.header("referrer-policy", "no-referrer");
  reply.header("permissions-policy", "camera=(), microphone=(), geolocation=()");
  if (!reply.getHeader("cache-control")) {
    reply.header("cache-control", "no-store");
  }
  return payload;
});

app.addHook("onResponse", async (request, reply) => {
  const start = (request as { _start?: number })._start ?? Date.now();
  observeRequest(reply.statusCode, Date.now() - start);
});

app.setErrorHandler(async (error, _request, reply) => {
  const err = error as Error & { statusCode?: number; code?: string };
  const status = err.statusCode ?? 500;
  if (status === 403) {
    return reply.code(403).send({ error: "forbidden", code: err.code });
  }
  if (status === 401) {
    return reply.code(401).send({ error: "unauthorized", code: err.code });
  }
  if (status >= 500) {
    app.log.error(error);
    return reply.code(status).send({ error: "internal error" });
  }
  return reply.code(status).send({ error: err.message || "request error", code: err.code });
});

app.get("/health", async () => ({ status: "ok", service: "core" }));

app.get("/auth/session", async (request, reply) => {
  const ip = request.ip || "unknown";
  const limited = limitAuthIp(ip);
  if (!limited.ok) return rateLimitReply(reply, limited);
  const header = request.headers.authorization;
  const token = typeof header === "string" ? header.replace(/^Bearer\s+/i, "") : "";
  if (!token) return reply.code(401).send({ error: "missing token" });
  return auth.verifySession(token);
});

// Raw binary bodies for asset / export / internal compile uploads (register once).
for (const type of [
  "application/octet-stream",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]) {
  app.addContentTypeParser(type, (_req, payload, done) => {
    done(null, payload);
  });
}

app.register(async (scoped) => {
  scoped.addHook("preHandler", requireAuth);
  await registerUserRoutes(scoped, notifications);
  await registerOrgRoutes(scoped, storage, notifications);
  await registerJudgeUserRoutes(scoped, storage);
  await registerAiRoutes(scoped);
  await registerAdminRoutes(scoped);
});

await registerStaticAssetRoutes(app, storage);
await registerPublicRoutes(app, storage);
await registerInternalJobRoutes(app);
await registerInternalMetadataRoutes(app);
await registerInternalCompileRoutes(app, storage);
await registerJudgeInternalRoutes(app, storage);
await registerInternalAiRoutes(app);

app.post("/internal/collab/connections", async (request, reply) => {
  const denied = assertInternalSecret(request, reply);
  if (denied) return denied;
  const body = request.body as { activeConnections?: number };
  setActiveCollaborationConnections(body.activeConnections ?? 0);
  return { ok: true };
});

/**
 * Collab authorization — verify bearer via AuthPort + org membership via MetadataStore/rbac.
 * Collab must not fork Firebase Admin membership checks.
 */
app.post("/internal/collab/authorize", async (request, reply) => {
  const denied = assertInternalSecret(request, reply);
  if (denied) return denied;
  const body = request.body as {
    token?: string;
    orgId?: string;
    notebookId?: string;
    entryId?: string;
  };
  if (!body.token || !body.orgId) {
    return reply.code(400).send({ error: "token and orgId required" });
  }
  let user;
  try {
    user = await auth.verifySession(body.token);
  } catch {
    return reply.code(401).send({ error: "invalid token" });
  }
  const { requireOrgReader, canAccessNotebook } = await import("./rbac.js");
  const { notebookPath } = await import("@engineering-notebook/shared");
  const { getMetadataStore } = await import("./db/metadataStore.js");
  try {
    await requireOrgReader(user, body.orgId);
  } catch {
    return reply.code(403).send({ error: "forbidden" });
  }
  if (body.notebookId) {
    const nb = await getMetadataStore().get(notebookPath(body.orgId, body.notebookId));
    if (!nb) return reply.code(404).send({ error: "notebook not found" });
    const ok = await canAccessNotebook(
      user,
      body.orgId,
      nb as { access?: import("@engineering-notebook/shared").NotebookAccess }
    );
    if (!ok) return reply.code(403).send({ error: "forbidden" });
  }
  return { ok: true, uid: user.uid, email: user.email };
});

/** Collab loads persisted Yjs from Core storage (works with memory backend + fake-gcs). */
app.get("/internal/collab/yjs", async (request, reply) => {
  const denied = assertInternalSecret(request, reply);
  if (denied) return denied;
  const q = request.query as { orgId?: string; notebookId?: string; entryId?: string };
  if (!q.orgId || !q.notebookId || !q.entryId) {
    return reply.code(400).send({ error: "orgId, notebookId, entryId required" });
  }
  const { entryPath, gcsKeys } = await import("@engineering-notebook/shared");
  const { getMetadataStore } = await import("./db/metadataStore.js");
  const snap = await getMetadataStore().get(entryPath(q.orgId, q.notebookId, q.entryId));
  if (!snap) return reply.code(404).send({ error: "entry not found" });
  const meta = snap as { yjsGcsPath?: string };
  const key = meta.yjsGcsPath || gcsKeys.yjs(q.orgId, q.notebookId, q.entryId);
  const buf = await storage.getObject(key);
  if (!buf) return reply.code(404).send({ error: "yjs not found" });
  return { yjsBase64: buf.toString("base64"), yjsGcsPath: key };
});

/** Internal flush helper used by collab service. */
app.post("/internal/collab/flush", async (request, reply) => {
  const denied = assertInternalSecret(request, reply);
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
  const { getMetadataStore } = await import("./db/metadataStore.js");
  const entryDocPath = entryPath(body.orgId, body.notebookId, body.entryId);
  const snap = await getMetadataStore().get(entryDocPath);
  if (!snap) return reply.code(404).send({ error: "entry not found" });
  const existing = snap as { tipTapRev?: number; yjsRev?: number };
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
        (
          (body.tipTapJson as { content?: Array<{ content?: Array<{ text?: string }> }> })
            .content?.[0]?.content?.[0]?.text
        ) || ""
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
  await getMetadataStore().update(entryDocPath, patch);
  return { ok: true, tipTapRev, yjsRev };
});

startMetricsPersistence();

const port = Number(process.env.PORT || 8080);
await app.listen({ port, host: "0.0.0.0" });
