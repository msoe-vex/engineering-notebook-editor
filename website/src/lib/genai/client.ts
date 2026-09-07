import type { GenAIGenerateRequest, GenAIImagePart, GenAIProviderId } from "./types";
import { getGenAIApiKey, getGenAISettings, resolveGenAIModel } from "./settings";
import { resolveTemperature } from "./shared";

export async function runGenerate(prompt: string, images?: GenAIImagePart[], temperature?: number): Promise<string> {
  const settings = getGenAISettings();
  const apiKey = getGenAIApiKey(settings.provider);
  if (!apiKey) {
    throw new Error("Add an AI provider API key in Settings to generate titles and captions.");
  }
  const response = await fetch("/api/genai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: settings.provider,
      apiKey,
      model: resolveGenAIModel(settings.provider),
      prompt,
      images,
      temperature: resolveTemperature(temperature),
    } satisfies Omit<GenAIGenerateRequest, "apiKey"> & { provider: GenAIProviderId; apiKey: string }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string; text?: string };
  if (!response.ok) {
    throw new Error(payload.error || `Generation failed (${response.status}).`);
  }
  if (!payload.text?.trim()) {
    throw new Error("Generation returned no text.");
  }
  return payload.text;
}
