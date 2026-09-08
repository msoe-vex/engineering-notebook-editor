import type { GenAIModelOption, GenAIProvider } from "../types";
import { extractGeminiText, isListedGeminiMultimodalModel, readProviderError, resolveTemperature, trySanitizeGenAIModelId } from "../shared";

const MAX_PAGES = 8;

export const gemini: GenAIProvider = {
  info: {
    id: "gemini",
    label: "Google",
    hint: "Google AI Studio",
    keyPlaceholder: "Google AI Studio API key",
    keyUrl: "https://aistudio.google.com/apikey",
    keyUrlLabel: "Google AI Studio",
    defaultModel: "gemini-3.5-flash-lite",
  },
  async generate({ apiKey, model, prompt, images, temperature }) {
    const parts: Array<Record<string, unknown>> = [];
    for (const image of images || []) {
      parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
    }
    parts.push({ text: prompt });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: resolveTemperature(temperature) },
        }),
      },
    );
    if (!response.ok) throw new Error(await readProviderError(response, "Gemini request failed"));
    const text = extractGeminiText(await response.json());
    if (!text.trim()) throw new Error("Gemini returned an empty response.");
    return text;
  },
  async listModels(apiKey) {
    const models: GenAIModelOption[] = [];
    let pageToken = "";
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const response = await fetch(url, {
        headers: { "x-goog-api-key": apiKey },
      });
      if (!response.ok) throw new Error(await readProviderError(response, "Gemini model list failed"));
      const payload = await response.json() as {
        models?: Array<{
          name?: string;
          displayName?: string;
          supportedGenerationMethods?: string[];
        }>;
        nextPageToken?: string;
      };
      for (const model of payload.models || []) {
        const rawId = (model.name || "").replace(/^models\//, "");
        const id = trySanitizeGenAIModelId(rawId);
        if (!id || !isListedGeminiMultimodalModel(id, model.supportedGenerationMethods)) continue;
        models.push({ id, label: model.displayName?.trim() || id });
      }
      pageToken = payload.nextPageToken || "";
      if (!pageToken) break;
    }
    return models;
  },
};
