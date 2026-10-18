/**
 * Shared Vertex generateContent helper (user /ai/complete + worker /internal/ai/complete).
 */

export type VertexCompleteInput = {
  prompt: string;
  temperature?: number;
  model?: string;
};

export type VertexCompleteResult =
  | { ok: true; text: string; model: string }
  | { ok: false; status: number; error: string; detail?: string };

export async function vertexComplete(
  input: VertexCompleteInput,
  log?: { warn: (o: unknown, msg: string) => void; error: (o: unknown, msg: string) => void }
): Promise<VertexCompleteResult> {
  if (process.env.VERTEX_STUB === "true") {
    return {
      ok: false,
      status: 503,
      error:
        "Vertex is stubbed (VERTEX_STUB=true). Disable stub and configure Vertex to use AI complete.",
    };
  }

  const project = process.env.GCP_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const location = process.env.VERTEX_LOCATION || "us-central1";
  const defaultModel = process.env.VERTEX_MODEL || "gemini-2.0-flash-001";
  if (!project) {
    return { ok: false, status: 503, error: "GCP_PROJECT_ID (or FIREBASE_PROJECT_ID) required for Vertex" };
  }

  const clipped = input.prompt.slice(0, 100_000);
  if (!clipped.trim()) {
    return { ok: false, status: 400, error: "prompt required" };
  }

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
      log?.warn({ err }, "Vertex ADC token fetch failed");
    }
  }
  if (!token) {
    return {
      ok: false,
      status: 503,
      error: "Vertex access token unavailable (set VERTEX_ACCESS_TOKEN or ADC)",
    };
  }

  const model =
    typeof input.model === "string" && input.model.trim() ? input.model.trim() : defaultModel;
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
  const temperature =
    typeof input.temperature === "number" && Number.isFinite(input.temperature)
      ? Math.min(2, Math.max(0, input.temperature))
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
    log?.error({ err }, "Vertex request failed");
    return { ok: false, status: 502, error: "Vertex request failed" };
  }

  const rawText = await res.text();
  if (!res.ok) {
    log?.warn({ status: res.status, body: rawText.slice(0, 500) }, "Vertex error");
    return {
      ok: false,
      status: 502,
      error: `Vertex HTTP ${res.status}`,
      detail: rawText.slice(0, 1000),
    };
  }

  let parsed: {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  try {
    parsed = JSON.parse(rawText) as typeof parsed;
  } catch {
    return { ok: false, status: 502, error: "Vertex returned non-JSON" };
  }

  const text =
    parsed.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || "")
      .join("")
      .trim() || "";
  if (!text) {
    return { ok: false, status: 502, error: "Vertex returned empty text" };
  }

  return { ok: true, text, model };
}
