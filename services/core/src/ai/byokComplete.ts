/**
 * One-shot BYOK text generation for the judge worker (keys never stored).
 * Providers: openai | anthropic | gemini. Local/Ollama rejected.
 * Retries transient 429 / 503 with backoff (Gemini free-tier RPM is easy to hit).
 */

export type ByokProvider = "openai" | "anthropic" | "gemini";

export type ByokCompleteInput = {
  provider: ByokProvider;
  apiKey: string;
  model: string;
  prompt: string;
  temperature?: number;
  baseUrl?: string;
};

export type ByokCompleteResult =
  | { ok: true; text: string; provider: ByokProvider; model: string }
  | { ok: false; status: number; error: string };

function temp(t?: number) {
  return typeof t === "number" && Number.isFinite(t) ? Math.min(2, Math.max(0, t)) : 0.2;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function quotaFriendly(provider: string, status: number, raw: string): string {
  const clip = raw.replace(/\s+/g, " ").slice(0, 280);
  if (status === 429) {
    return (
      `${provider} rate/quota limit (429). Wait a minute and retry, check billing/plan, ` +
      `or switch Judge LLM to another provider in Settings. ${clip}`
    );
  }
  return `${provider} ${status}: ${clip}`;
}

async function withRetries(
  provider: string,
  once: () => Promise<{ status: number; raw: string; ok: boolean }>
): Promise<{ status: number; raw: string; ok: boolean }> {
  const maxAttempts = 5;
  let last = { status: 500, raw: "", ok: false };
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    last = await once();
    if (last.ok) return last;
    const retryable = last.status === 429 || last.status === 503 || last.status === 502;
    if (!retryable || attempt === maxAttempts - 1) return last;
    // Gemini free tier often needs several seconds between bursts.
    const backoffMs = Math.min(30_000, 1500 * 2 ** attempt + Math.floor(Math.random() * 500));
    console.warn(
      `[byok] ${provider} ${last.status}; retry ${attempt + 1}/${maxAttempts - 1} in ${backoffMs}ms`
    );
    await sleep(backoffMs);
  }
  return last;
}

async function openaiComplete(input: ByokCompleteInput): Promise<ByokCompleteResult> {
  const url = input.baseUrl
    ? `${input.baseUrl.replace(/\/+$/, "")}/chat/completions`
    : "https://api.openai.com/v1/chat/completions";
  const result = await withRetries("OpenAI", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.apiKey || "dummy"}`,
      },
      body: JSON.stringify({
        model: input.model,
        temperature: temp(input.temperature),
        messages: [{ role: "user", content: input.prompt }],
      }),
    });
    const raw = await res.text();
    return { status: res.status, raw, ok: res.ok };
  });
  if (!result.ok) {
    return {
      ok: false,
      status: result.status === 429 ? 429 : 502,
      error: quotaFriendly("OpenAI", result.status, result.raw),
    };
  }
  const data = JSON.parse(result.raw) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim() || "";
  if (!text) return { ok: false, status: 502, error: "OpenAI returned empty text" };
  return { ok: true, text, provider: "openai", model: input.model };
}

async function anthropicComplete(input: ByokCompleteInput): Promise<ByokCompleteResult> {
  const result = await withRetries("Anthropic", async () => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": input.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: 4096,
        temperature: temp(input.temperature),
        messages: [{ role: "user", content: input.prompt }],
      }),
    });
    const raw = await res.text();
    return { status: res.status, raw, ok: res.ok };
  });
  if (!result.ok) {
    return {
      ok: false,
      status: result.status === 429 ? 429 : 502,
      error: quotaFriendly("Anthropic", result.status, result.raw),
    };
  }
  const data = JSON.parse(result.raw) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = (data.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text || "")
    .join("")
    .trim();
  if (!text) return { ok: false, status: 502, error: "Anthropic returned empty text" };
  return { ok: true, text, provider: "anthropic", model: input.model };
}

async function geminiComplete(input: ByokCompleteInput): Promise<ByokCompleteResult> {
  const model = input.model || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(input.apiKey)}`;
  const result = await withRetries("Gemini", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: input.prompt }] }],
        generationConfig: { temperature: temp(input.temperature) },
      }),
    });
    const raw = await res.text();
    return { status: res.status, raw, ok: res.ok };
  });
  if (!result.ok) {
    return {
      ok: false,
      status: result.status === 429 ? 429 : 502,
      error: quotaFriendly("Gemini", result.status, result.raw),
    };
  }
  const data = JSON.parse(result.raw) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || "")
      .join("")
      .trim() || "";
  if (!text) return { ok: false, status: 502, error: "Gemini returned empty text" };
  return { ok: true, text, provider: "gemini", model };
}

export async function byokComplete(input: ByokCompleteInput): Promise<ByokCompleteResult> {
  const apiKey = input.apiKey?.trim();
  const model = input.model?.trim();
  const prompt = input.prompt?.trim();
  if (!apiKey && !input.baseUrl) return { ok: false, status: 400, error: "apiKey required" };
  if (!model) return { ok: false, status: 400, error: "model required" };
  if (!prompt) return { ok: false, status: 400, error: "prompt required" };

  switch (input.provider) {
    case "openai":
      return openaiComplete(input);
    case "anthropic":
      return anthropicComplete(input);
    case "gemini":
      return geminiComplete(input);
    default:
      return {
        ok: false,
        status: 400,
        error: "unsupported BYOK provider (use openai|anthropic|gemini)",
      };
  }
}
