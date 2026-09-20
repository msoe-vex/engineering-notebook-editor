import Fastify from "fastify";
import { FirebaseAuthAdapter } from "./auth/firebaseAuthAdapter.js";
import { getMetrics, observeRequest, setActiveCollaborationConnections } from "./metrics/store.js";

const app = Fastify({ logger: true });
const auth = new FirebaseAuthAdapter();
const authAttempts = new Map<string, { count: number; windowStart: number }>();

function allowAuthRequest(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequestsPerWindow = 30;
  const current = authAttempts.get(ip);

  if (!current || now - current.windowStart > windowMs) {
    authAttempts.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (current.count >= maxRequestsPerWindow) {
    return false;
  }

  current.count += 1;
  return true;
}

app.addHook("onRequest", async (request) => {
  (request as { _start?: number })._start = Date.now();
});

app.addHook("onResponse", async (request, reply) => {
  const start = (request as { _start?: number })._start ?? Date.now();
  observeRequest(reply.statusCode, Date.now() - start);
});

app.get("/health", async () => ({ status: "ok", service: "core" }));

app.get("/api/admin/metrics", async (request, reply) => {
  const ip = request.ip || "unknown";
  if (!allowAuthRequest(`${ip}:admin-metrics`)) {
    return reply.code(429).send({ error: "too many requests" });
  }

  const role = request.headers["x-platform-role"];
  if (role !== "service_admin") {
    return reply.code(403).send({ error: "forbidden" });
  }

  const snapshot = getMetrics();
  const avgLatencyMs = snapshot.totalRequests === 0 ? 0 : snapshot.totalLatencyMs / snapshot.totalRequests;

  return {
    ...snapshot,
    averageLatencyMs: Number(avgLatencyMs.toFixed(2)),
  };
});

app.get("/orgs", async () => []);
app.post("/orgs", async () => ({ id: "org-placeholder", created: true }));
app.get("/orgs/:orgId/notebooks", async () => []);
app.post("/orgs/:orgId/notebooks", async () => ({ id: "notebook-placeholder", created: true }));

app.get("/assets/busytex/*", async () => ({ message: "BusyTeX asset proxy placeholder" }));

app.post("/internal/collab/connections", async (request) => {
  const body = request.body as { activeConnections?: number };
  setActiveCollaborationConnections(body.activeConnections ?? 0);
  return { ok: true };
});

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

const port = Number(process.env.PORT || 8080);
await app.listen({ port, host: "0.0.0.0" });
