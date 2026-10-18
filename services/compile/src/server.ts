/**
 * Local / Cloud Run-style compile worker HTTP server.
 * Core POSTs /jobs; we run XeLaTeX and report via Core internal APIs + SSE.
 */
import http from "node:http";
import { runCompileJobSafe } from "./runJob.js";

const port = Number(process.env.PORT || 8090);
const secret = process.env.INTERNAL_SERVICE_SECRET || "";

type JobBody = { orgId?: string; notebookId?: string; jobId?: string };

let busy = false;
const queue: Array<{ orgId: string; notebookId: string; jobId: string }> = [];

function assertSecret(req: http.IncomingMessage): boolean {
  if (!secret) return true;
  return req.headers["x-internal-secret"] === secret;
}

function readJson(req: http.IncomingMessage): Promise<JobBody> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8") || "{}";
        resolve(JSON.parse(raw) as JobBody);
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

async function drainQueue() {
  if (busy) return;
  const next = queue.shift();
  if (!next) return;
  busy = true;
  console.log(`[compile] start job=${next.jobId} org=${next.orgId} notebook=${next.notebookId}`);
  try {
    await runCompileJobSafe(next);
  } finally {
    busy = false;
    void drainQueue();
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "compile", busy, queued: queue.length }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/jobs") {
    if (!assertSecret(req)) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "forbidden" }));
      return;
    }
    try {
      const body = await readJson(req);
      const orgId = body.orgId?.trim();
      const notebookId = body.notebookId?.trim();
      const jobId = body.jobId?.trim() || `job-${Date.now()}`;
      if (!orgId || !notebookId) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "orgId and notebookId required" }));
        return;
      }
      queue.push({ orgId, notebookId, jobId });
      void drainQueue();
      res.writeHead(202, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, jobId, queued: queue.length + (busy ? 1 : 0) }));
    } catch (err) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : "bad request" }));
    }
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[compile] listening on :${port}`);
});
