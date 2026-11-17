/**
 * Compile worker: health HTTP + Pub/Sub pull subscriber.
 * Core publishes to notebook-jobs-compile; we run XeLaTeX and report via Core.
 */
import http from "node:http";
import { PubSub, type Message } from "@google-cloud/pubsub";
import { runCompileJobSafe } from "./runJob.js";

const port = Number(process.env.PORT || 8090);
const projectId =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCP_PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  "demo-engineering-notebook";
const subscriptionName =
  process.env.PUBSUB_SUBSCRIPTION_COMPILE || "notebook-jobs-compile-worker";

type JobBody = {
  orgId?: string;
  notebookId?: string;
  jobId?: string;
  type?: string;
  payload?: unknown;
};

let busy = false;
const queue: Array<{ orgId: string; notebookId: string; jobId: string }> = [];

function enqueueCompile(body: JobBody): { ok: true; jobId: string } | { ok: false; error: string } {
  const orgId = body.orgId?.trim();
  const notebookId = body.notebookId?.trim();
  const jobId = body.jobId?.trim() || `job-${Date.now()}`;
  const jobType = (body.type || "compile").trim();
  if (!orgId || !notebookId) return { ok: false, error: "orgId and notebookId required" };
  if (jobType !== "compile") return { ok: false, error: `unsupported job type: ${jobType}` };
  queue.push({ orgId, notebookId, jobId });
  void drainQueue();
  return { ok: true, jobId };
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

function startPubSubPull() {
  const pubsub = new PubSub({ projectId });
  const sub = pubsub.subscription(subscriptionName);
  console.log(`[compile] pubsub pull subscription=${subscriptionName} project=${projectId}`);

  sub.on("message", (message: Message) => {
    try {
      const body = JSON.parse(message.data.toString("utf8")) as JobBody;
      const result = enqueueCompile(body);
      if (!result.ok) {
        console.warn(`[compile] bad message: ${result.error}`);
        message.ack();
        return;
      }
      message.ack();
      console.log(`[compile] accepted job=${result.jobId} from pubsub`);
    } catch (err) {
      console.error("[compile] pubsub message error", err);
      message.nack();
    }
  });

  sub.on("error", (err) => {
    console.error("[compile] pubsub subscription error", err);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "compile",
        busy,
        queued: queue.length,
        subscription: subscriptionName,
      })
    );
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[compile] health on :${port}`);
  startPubSubPull();
});
