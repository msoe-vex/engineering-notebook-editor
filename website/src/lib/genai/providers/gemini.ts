import type { GenAIProvider } from "../types";
import { extractGeminiText, readProviderError, resolveTemperature } from "../shared";

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
};
