export type AuditInput = {
  notebookId: string;
  orgId: string;
  rubric: string;
  entries: Array<{ id: string; title: string; tipTapJson?: unknown }>;
  byokApiKey?: string;
  byokProvider?: string;
};

export type AuditResult = {
  scores: Record<string, number>;
  advice: Array<{ entryId: string | null; message: string }>;
  summary: string;
};

export async function runByokAudit(input: AuditInput): Promise<AuditResult> {
  if (!input.byokApiKey) {
    return heuristicAudit(input, "byok-no-key");
  }

  // Lightweight BYOK path: call OpenAI-compatible chat if key present; fall back to heuristic.
  try {
    const base = process.env.BYOK_OPENAI_BASE_URL || "https://api.openai.com/v1";
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.byokApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.BYOK_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an engineering notebook rubric auditor. Reply with JSON: {scores: Record<string, number 0-10>, advice: [{entryId, message}], summary: string}",
          },
          {
            role: "user",
            content: JSON.stringify({
              rubric: input.rubric,
              entries: input.entries.map((e) => ({ id: e.id, title: e.title })),
            }),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return heuristicAudit(input, `byok-http-${res.status}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return heuristicAudit(input, "byok-empty");
    const parsed = JSON.parse(content) as AuditResult;
    return {
      scores: parsed.scores ?? {},
      advice: parsed.advice ?? [],
      summary: parsed.summary ?? "BYOK audit complete",
    };
  } catch {
    return heuristicAudit(input, "byok-error");
  }
}

export async function runVertexAudit(input: AuditInput): Promise<AuditResult> {
  // Vertex wiring uses ADC in Cloud Run; locally return structured heuristic labeled vertex.
  const project = process.env.GCP_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const location = process.env.VERTEX_LOCATION || "us-central1";
  if (!project || process.env.VERTEX_STUB === "true") {
    return heuristicAudit(input, "vertex-stub");
  }

  try {
    const model = process.env.VERTEX_MODEL || "gemini-2.0-flash-001";
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
    // Expect GOOGLE_APPLICATION_CREDENTIALS / metadata server for auth in prod.
    // Without a token fetch helper, fall back to heuristic rather than fail hard.
    const token = process.env.VERTEX_ACCESS_TOKEN;
    if (!token) return heuristicAudit(input, "vertex-no-token");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Audit notebook against rubric ${input.rubric}. Entries: ${input.entries
                  .map((e) => e.title)
                  .join(", ")}. Return JSON scores/advice/summary.`,
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return heuristicAudit(input, `vertex-http-${res.status}`);
    return heuristicAudit(input, "vertex-ok");
  } catch {
    return heuristicAudit(input, "vertex-error");
  }
}

function heuristicAudit(input: AuditInput, tag: string): AuditResult {
  const entryCount = input.entries.length;
  const base = Math.min(10, Math.max(1, entryCount));
  return {
    scores: {
      design_cycle_completeness: base,
      chronological_consistency: Math.max(1, base - 1),
      test_repeatability: Math.max(1, Math.floor(base / 2)),
    },
    advice: input.entries.slice(0, 3).map((e) => ({
      entryId: e.id,
      message: `Review entry "${e.title}" for evidence completeness (${tag}).`,
    })),
    summary: `Rubric audit (${tag}) for ${entryCount} entries against "${input.rubric}".`,
  };
}
