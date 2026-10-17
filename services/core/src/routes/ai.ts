import type { FastifyInstance } from "fastify";
import { isServiceAdmin } from "../rbac.js";
import { getUser } from "../http/authPlugin.js";

type CompleteBody = {
  prompt?: string;
  messages?: Array<{ role?: string; content?: string }>;
  model?: string;
  temperature?: number;
};

/**
 * Vertex-only model turn. BYOK/local inference stays in the browser (or /api/genai BFF).
 */
export async function registerAiRoutes(app: FastifyInstance) {
  app.post("/ai/complete", async (request, reply) => {
    const user = getUser(request);
    if (!user.grants?.platformAi && !isServiceAdmin(user)) {
      return reply.code(403).send({ error: "platformAi grant required" });
    }

    if (process.env.VERTEX_STUB === "true") {
      return reply.code(503).send({
        error: "Vertex is stubbed (VERTEX_STUB=true). Disable stub and configure Vertex to use /ai/complete.",
      });
    }

    const project = process.env.GCP_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
    const location = process.env.VERTEX_LOCATION || "us-central1";
    const model = process.env.VERTEX_MODEL || "gemini-2.0-flash-001";
    if (!project) {
      return reply.code(503).send({ error: "GCP_PROJECT_ID (or FIREBASE_PROJECT_ID) required for Vertex" });
    }

    const body = (request.body || {}) as CompleteBody;
    const promptFromMessages = (body.messages || [])
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .filter(Boolean)
      .join("\n\n");
    const prompt =
      (typeof body.prompt === "string" && body.prompt.trim()) || promptFromMessages;
    if (!prompt) {
      return reply.code(400).send({ error: "prompt or messages required" });
    }
    const clipped = prompt.slice(0, 100_000);

    let token = process.env.VERTEX_ACCESS_TOKEN?.trim();
    if (!token) {
      try {
        const { GoogleAuth } = await import("google-auth-library");
        const auth = new GoogleAuth({
          scopes: ["https://www.googleapis.com/auth/cloud-platform"],
        });
        const client = await auth.getClient();
        const got = await client.getAccessToken();
        token = typeof got === "string" ? got : got?.token || undefined;
      } catch (err) {
        request.log.warn({ err }, "Vertex ADC token fetch failed");
      }
    }
    if (!token) {
      return reply.code(503).send({
        error: "Vertex access token unavailable (set VERTEX_ACCESS_TOKEN or ADC)",
      });
    }

    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
    const temperature =
      typeof body.temperature === "number" && Number.isFinite(body.temperature)
        ? Math.min(2, Math.max(0, body.temperature))
        : 0.2;

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: clipped }] }],
          generationConfig: { temperature },
        }),
      });
    } catch (err) {
      request.log.error({ err }, "Vertex request failed");
      return reply.code(502).send({ error: "Vertex request failed" });
    }

    const rawText = await res.text();
    if (!res.ok) {
      request.log.warn({ status: res.status, body: rawText.slice(0, 500) }, "Vertex error");
      return reply.code(502).send({
        error: `Vertex HTTP ${res.status}`,
        detail: rawText.slice(0, 1000),
      });
    }

    let parsed: {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    try {
      parsed = JSON.parse(rawText) as typeof parsed;
    } catch {
      return reply.code(502).send({ error: "Vertex returned non-JSON" });
    }

    const text =
      parsed.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || "")
        .join("")
        .trim() || "";
    if (!text) {
      return reply.code(502).send({ error: "Vertex returned empty text" });
    }

    return {
      provider: "vertex",
      model: typeof body.model === "string" && body.model.trim() ? body.model : model,
      text,
    };
  });
}
