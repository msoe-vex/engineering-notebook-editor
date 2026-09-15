import type { GenAIModelOption, GenAIProvider } from "../types";
import {
  fetchOpenAICompatible,
  joinGenAIEndpoint,
  LOCAL_GENAI_DEFAULT_BASE_URL,
  readProviderError,
  resolveTemperature,
  sanitizeGenAIBaseUrl,
  trySanitizeLocalGenAIModelId,
} from "../shared";

function resolveBaseUrl(baseUrl?: string): string {
  const resolved = sanitizeGenAIBaseUrl(baseUrl || "");
  if (!resolved) {
    throw new Error(`Add a local model URL in Settings (for example ${LOCAL_GENAI_DEFAULT_BASE_URL}).`);
  }
  return resolved;
}

function authHeaders(apiKey: string, json = false): HeadersInit {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  const key = apiKey.trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function choiceText(payload: {
  choices?: Array<{ message?: { content?: unknown }; text?: string }>;
}): string {
  const choice = payload.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") return part.text;
        return "";
      })
      .join("");
  }
  return typeof choice?.text === "string" ? choice.text : "";
}

export const local: GenAIProvider = {
  info: {
    id: "local",
    label: "Local",
    hint: "OpenAI-compatible",
    keyPlaceholder: "API key (optional)",
    keyUrl: "",
    keyUrlLabel: "",
    defaultModel: "",
    requiresApiKey: false,
    needsBaseUrl: true,
    baseUrlPlaceholder: LOCAL_GENAI_DEFAULT_BASE_URL,
  },
  async generate({ apiKey, model, prompt, images, temperature, baseUrl }) {
    const root = resolveBaseUrl(baseUrl);
    const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
    for (const image of images || []) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
      });
    }

    const response = await fetchOpenAICompatible(
      joinGenAIEndpoint(root, "chat/completions"),
      {
        method: "POST",
        headers: authHeaders(apiKey, true),
        body: JSON.stringify({
          model,
          temperature: resolveTemperature(temperature),
          messages: [{ role: "user", content }],
        }),
      },
      "Local model request failed.",
    );
    if (!response.ok) throw new Error(await readProviderError(response, "Local model request failed"));
    const text = choiceText(await response.json() as { choices?: Array<{ message?: { content?: unknown }; text?: string }> });
    if (!text.trim()) throw new Error("Local model returned an empty response.");
    return text;
  },
  async listModels(apiKey, baseUrl, signal) {
    const root = resolveBaseUrl(baseUrl);
    const response = await fetchOpenAICompatible(
      joinGenAIEndpoint(root, "models"),
      { headers: authHeaders(apiKey), signal },
      "Local model list failed.",
    );
    if (!response.ok) throw new Error(await readProviderError(response, "Local model list failed"));
    const payload = await response.json() as { data?: Array<{ id?: string }> };
    const models: GenAIModelOption[] = [];
    for (const model of payload.data || []) {
      const id = trySanitizeLocalGenAIModelId(model.id || "");
      if (!id) continue;
      models.push({ id, label: id });
    }
    return models;
  },
};
