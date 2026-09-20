import Fastify from "fastify";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok", service: "agents" }));

app.post("/v1/notebooks/:notebookId/audit", async (request, reply) => {
  const params = request.params as { notebookId: string };
  const body = request.body as { provider?: "byok" | "vertex"; rubric?: string };

  const provider = body.provider ?? "byok";
  const platformAiGrant = request.headers["x-platform-ai-grant"] === "true";

  if (provider === "vertex" && !platformAiGrant) {
    return reply.code(403).send({ error: "platformAi grant required" });
  }

  return {
    notebookId: params.notebookId,
    provider,
    rubric: body.rubric ?? "REC Foundation Design Award",
    summary: "Stub rubric audit response. Connect provider routers for BYOK/Vertex.",
    scores: {
      design_cycle_completeness: 0,
      chronological_consistency: 0,
      test_repeatability: 0,
    },
    advice: [],
  };
});

const port = Number(process.env.PORT || 8000);
await app.listen({ port, host: "0.0.0.0" });
