import type { GenAIProvider, GenAIProviderId, GenAISettings } from "./types";
import { resolveTemperature, sanitizeGenAIModelId } from "./shared";
import { gemini } from "./providers/gemini";
import { openai } from "./providers/openai";
import { anthropic } from "./providers/anthropic";

export const GENAI_STORAGE_KEY = "nb-genai-settings";
export const GENAI_CHANGED_EVENT = "nb-genai-changed";

export const GENAI_PROVIDERS = [gemini.info, openai.info, anthropic.info] as const;

const PROVIDERS: Record<GenAIProviderId, GenAIProvider> = {
  gemini,
  openai,
  anthropic,
};

export function isGenAIProviderId(value: unknown): value is GenAIProviderId {
  return value === "gemini" || value === "openai" || value === "anthropic";
}

export function getProvider(id: GenAIProviderId): GenAIProvider {
  return PROVIDERS[id];
}

export function getProviderInfo(id: GenAIProviderId) {
  return getProvider(id).info;
}

function emptySettings(): GenAISettings {
  return { enabled: false, provider: "gemini", keys: {}, models: {} };
}

export function getGenAISettings(): GenAISettings {
  if (typeof window === "undefined") return emptySettings();
  const settings = emptySettings();
  try {
    const raw = localStorage.getItem(GENAI_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GenAISettings>;
      if (parsed.enabled === true) settings.enabled = true;
      if (isGenAIProviderId(parsed.provider)) settings.provider = parsed.provider;
      if (parsed.keys && typeof parsed.keys === "object") {
        for (const id of GENAI_PROVIDERS.map((p) => p.id)) {
          const key = parsed.keys[id];
          if (typeof key === "string" && key.trim()) settings.keys[id] = key.trim();
        }
      }
      if (parsed.models && typeof parsed.models === "object") {
        for (const id of GENAI_PROVIDERS.map((p) => p.id)) {
          const model = parsed.models[id];
          if (typeof model === "string" && model.trim()) settings.models[id] = model.trim();
        }
      }
    }
  } catch { /* ignore */ }
  return settings;
}

function persistSettings(settings: GenAISettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(GENAI_STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event(GENAI_CHANGED_EVENT));
}

export function isGenAIEnabled(): boolean {
  return getGenAISettings().enabled === true;
}

export function setGenAIEnabled(enabled: boolean): void {
  const settings = getGenAISettings();
  settings.enabled = enabled;
  persistSettings(settings);
}

export function setGenAIProvider(id: GenAIProviderId): void {
  const settings = getGenAISettings();
  settings.provider = id;
  persistSettings(settings);
}

export function setGenAIApiKey(key: string, provider?: GenAIProviderId): void {
  const settings = getGenAISettings();
  const id = provider ?? settings.provider;
  const next = key.trim();
  if (!next) delete settings.keys[id];
  else settings.keys[id] = next;
  persistSettings(settings);
}

export function getGenAIApiKey(provider?: GenAIProviderId): string {
  const settings = getGenAISettings();
  return (settings.keys[provider ?? settings.provider] || "").trim();
}

export function getStoredGenAIModel(provider?: GenAIProviderId): string {
  const settings = getGenAISettings();
  return (settings.models[provider ?? settings.provider] || "").trim();
}

export function resolveGenAIModel(provider: GenAIProviderId, override?: string): string {
  const raw = (override ?? getStoredGenAIModel(provider)).trim();
  if (!raw) return getProviderInfo(provider).defaultModel;
  return sanitizeGenAIModelId(raw);
}

export function setGenAIModel(model: string, provider?: GenAIProviderId): void {
  const settings = getGenAISettings();
  const id = provider ?? settings.provider;
  const next = model.trim();
  if (!next) delete settings.models[id];
  else settings.models[id] = next;
  persistSettings(settings);
}

export function hasGenAIApiKey(provider?: GenAIProviderId): boolean {
  return getGenAIApiKey(provider).length > 0;
}

export function subscribeGenAISettings(onChange: () => void): () => void {
  const handler = () => onChange();
  window.addEventListener("storage", handler);
  window.addEventListener(GENAI_CHANGED_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(GENAI_CHANGED_EVENT, handler);
  };
}

export async function runProviderGenerate(
  provider: GenAIProviderId,
  apiKey: string,
  model: string,
  prompt: string,
  images?: { mimeType: string; base64: string }[],
  temperature?: number,
): Promise<string> {
  const key = apiKey.trim();
  if (!key) throw new Error(`An API key is required for ${getProviderInfo(provider).label}.`);
  const resolved = resolveGenAIModel(provider, model);
  return getProvider(provider).generate({
    apiKey: key,
    model: resolved,
    prompt,
    images,
    temperature: resolveTemperature(temperature),
  });
}
