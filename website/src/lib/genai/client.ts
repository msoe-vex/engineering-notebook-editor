import type { GenAIGenerateRequest, GenAIImagePart, GenAIModelOption, GenAIProviderId } from "./types";
import { getGenAIApiKey, getGenAISettings, isGenAIEnabled, resolveGenAIModel } from "./settings";
import { resolveTemperature } from "./shared";

export async function runGenerate(prompt: string, images?: GenAIImagePart[], temperature?: number): Promise<string> {
  if (!isGenAIEnabled()) {
    throw new Error("Generative AI is turned off in Settings.");
  }
  const settings = getGenAISettings();
  const apiKey = getGenAIApiKey(settings.provider);
  if (!apiKey) {
    throw new Error("Add an AI provider API key in Settings to generate titles and captions.");
  }
  const model = resolveGenAIModel(settings.provider);
  if (!model) {
    throw new Error("Choose a model in Settings before generating titles and captions.");
  }
  const response = await fetch("/api/genai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: settings.provider,
      apiKey,
      model,
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

export async function fetchGenAIModels(provider: GenAIProviderId, apiKey: string, signal?: AbortSignal): Promise<GenAIModelOption[]> {
  const key = apiKey.trim();
  if (!key) throw new Error("Add an API key to load models.");
  const response = await fetch("/api/genai/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, apiKey: key }),
    signal,
  });
  const payload = await response.json().catch(() => ({})) as { error?: string; models?: Array<{ id?: string; label?: string }> };
  if (!response.ok) {
    throw new Error(payload.error || `Could not load models (${response.status}).`);
  }
  const models = (payload.models || []).filter((model): model is { id: string; label: string } =>
    typeof model.id === "string" && typeof model.label === "string" && !!model.id.trim(),
  );
  if (!models.length) throw new Error("No chat models were returned for this key.");
  return models;
}
