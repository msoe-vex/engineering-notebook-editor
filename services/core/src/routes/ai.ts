import type { FastifyInstance } from "fastify";
import { isServiceAdmin } from "../rbac.js";
import { getUser } from "../http/authPlugin.js";
import { byokComplete, type ByokProvider } from "../ai/byokComplete.js";
import { vertexComplete } from "../ai/vertexComplete.js";

type CompleteBody = {
  prompt?: string;
  messages?: Array<{ role?: string; content?: string }>;
  model?: string;
  temperature?: number;
  system?: string;
};

function promptFromBody(body: CompleteBody): string {
  const promptFromMessages = (body.messages || [])
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .filter(Boolean)
    .join("\n\n");
  const user =
    (typeof body.prompt === "string" && body.prompt.trim()) || promptFromMessages;
  const system = typeof body.system === "string" && body.system.trim() ? body.system.trim() : "";
  return system ? `System:\n${system}\n\nUser:\n${user}` : user;
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

/**
 * Vertex-only model turn for the website. BYOK stays in browser (/api/genai) or
 * worker via /internal/ai/byok (ephemeral key, not stored).
 */
export async function registerAiRoutes(app: FastifyInstance) {
  app.post("/ai/complete", async (request, reply) => {
    const user = getUser(request);
    if (!user.grants?.platformAi && !isServiceAdmin(user)) {
      return reply.code(403).send({ error: "platformAi grant required" });
    }

    const body = (request.body || {}) as CompleteBody;
    const prompt = promptFromBody(body);
    if (!prompt.trim()) {
      return reply.code(400).send({ error: "prompt or messages required" });
    }

    const result = await vertexComplete(
      {
        prompt,
        temperature: body.temperature,
        model: body.model,
      },
      request.log
    );
    if (!result.ok) {
      return reply.code(result.status).send({
        error: result.error,
        detail: "detail" in result ? result.detail : undefined,
      });
    }
    return { provider: "vertex", model: result.model, text: result.text };
  });
}

/** Worker LLM: Vertex (platform) + BYOK (ephemeral keys from job dispatch). */
export async function registerInternalAiRoutes(app: FastifyInstance) {
  app.post("/internal/ai/complete", async (request, reply) => {
    const denied = assertInternalSecret(
      request as { headers: Record<string, unknown> },
      reply
    );
    if (denied) return denied;

    const body = (request.body || {}) as CompleteBody;
    const prompt = promptFromBody(body);
    if (!prompt.trim()) {
      return reply.code(400).send({ error: "prompt or messages required" });
    }

    const result = await vertexComplete(
      {
        prompt,
        temperature: body.temperature,
        model: body.model,
      },
      request.log
    );
    if (!result.ok) {
      return reply.code(result.status).send({
        error: result.error,
        detail: "detail" in result ? result.detail : undefined,
      });
    }
    return { provider: "vertex", model: result.model, text: result.text };
  });

  app.post("/internal/ai/byok", async (request, reply) => {
    const denied = assertInternalSecret(
      request as { headers: Record<string, unknown> },
      reply
    );
    if (denied) return denied;

    const body = (request.body || {}) as CompleteBody & {
      provider?: string;
      apiKey?: string;
    };
    const provider = body.provider as ByokProvider;
    if (provider !== "openai" && provider !== "anthropic" && provider !== "gemini") {
      return reply.code(400).send({
        error: "provider must be openai|anthropic|gemini (local models not supported for judge)",
      });
    }
    const prompt = promptFromBody(body);
    const result = await byokComplete({
      provider,
      apiKey: String(body.apiKey || ""),
      model: String(body.model || ""),
      prompt,
      temperature: body.temperature,
    });
    if (!result.ok) {
      return reply.code(result.status).send({ error: result.error });
    }
    return {
      provider: result.provider,
      model: result.model,
      text: result.text,
    };
  });
}
