import type { GenAIModelOption, GenAIProvider, GenAIProviderId, GenAISettings } from "./types";
import { resolveTemperature, sanitizeGenAIBaseUrl, sanitizeGenAIModelId, sanitizeLocalGenAIModelId } from "./shared";
import { gemini } from "./providers/gemini";
import { openai } from "./providers/openai";
import { anthropic } from "./providers/anthropic";
import { local } from "./providers/local";

export const GENAI_STORAGE_KEY = "nb-genai-settings";
export const GENAI_CHANGED_EVENT = "nb-genai-changed";

export const GENAI_PROVIDERS = [gemini.info, openai.info, anthropic.info, local.info] as const;

const PROVIDERS: Record<GenAIProviderId, GenAIProvider> = {
  gemini,
  openai,
  anthropic,
  local,
};

export function isGenAIProviderId(value: unknown): value is GenAIProviderId {
  return typeof value === "string" && Object.hasOwn(PROVIDERS, value);
}

export function providerRequiresApiKey(id: GenAIProviderId): boolean {
  return getProviderInfo(id).requiresApiKey !== false;
}

export function providerNeedsBaseUrl(id: GenAIProviderId): boolean {
  return getProviderInfo(id).needsBaseUrl === true;
}

export function getProvider(id: GenAIProviderId): GenAIProvider {
  return PROVIDERS[id];
}

export function getProviderInfo(id: GenAIProviderId) {
  return getProvider(id).info;
}

function emptySettings(): GenAISettings {
  return { enabled: false, provider: "gemini", keys: {}, models: {}, baseUrls: {} };
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
      if (parsed.baseUrls && typeof parsed.baseUrls === "object") {
        for (const id of GENAI_PROVIDERS.map((p) => p.id)) {
          const url = parsed.baseUrls[id];
          if (typeof url === "string" && url.trim()) settings.baseUrls[id] = url.trim();
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
  if (!raw) return "";
  return providerNeedsBaseUrl(provider) ? sanitizeLocalGenAIModelId(raw) : sanitizeGenAIModelId(raw);
}

export function setGenAIBaseUrl(url: string, provider?: GenAIProviderId): void {
  const settings = getGenAISettings();
  const id = provider ?? settings.provider;
  const next = url.trim();
  if (!next) delete settings.baseUrls[id];
  else settings.baseUrls[id] = next;
  persistSettings(settings);
}

export function getGenAIBaseUrl(provider?: GenAIProviderId): string {
  const settings = getGenAISettings();
  return (settings.baseUrls[provider ?? settings.provider] || "").trim();
}

export function resolveGenAIBaseUrl(provider: GenAIProviderId, override?: string): string {
  const raw = (override ?? getGenAIBaseUrl(provider)).trim();
  if (!raw) return "";
  return sanitizeGenAIBaseUrl(raw);
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

export function hasGenAIModel(provider?: GenAIProviderId): boolean {
  return getStoredGenAIModel(provider).length > 0;
}

export function canUseGenAI(provider?: GenAIProviderId): boolean {
  const settings = getGenAISettings();
  const id = provider ?? settings.provider;
  if (providerNeedsBaseUrl(id)) return getGenAIBaseUrl(id).length > 0;
  return hasGenAIApiKey(id);
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

export async function runProviderListModels(
  provider: GenAIProviderId,
  apiKey: string,
  baseUrl?: string,
  signal?: AbortSignal,
): Promise<GenAIModelOption[]> {
  const key = apiKey.trim();
  if (providerRequiresApiKey(provider) && !key) {
    throw new Error(`An API key is required for ${getProviderInfo(provider).label}.`);
  }
  const resolvedBaseUrl = providerNeedsBaseUrl(provider) ? resolveGenAIBaseUrl(provider, baseUrl) : undefined;
  if (providerNeedsBaseUrl(provider) && !resolvedBaseUrl) {
    throw new Error(`Add a local model URL in Settings to load models.`);
  }
  const seen = new Set<string>();
  const models: GenAIModelOption[] = [];
  for (const model of await getProvider(provider).listModels(key, resolvedBaseUrl, signal)) {
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    models.push(model);
  }
  models.sort((a, b) => a.label.localeCompare(b.label));
  return models;
}

export async function runProviderGenerate(
  provider: GenAIProviderId,
  apiKey: string,
  model: string,
  prompt: string,
  images?: { mimeType: string; base64: string }[],
  temperature?: number,
  baseUrl?: string,
): Promise<string> {
  const key = apiKey.trim();
  if (providerRequiresApiKey(provider) && !key) {
    throw new Error(`An API key is required for ${getProviderInfo(provider).label}.`);
  }
  const resolved = resolveGenAIModel(provider, model);
  if (!resolved) throw new Error("Choose a model in Settings before generating titles and captions.");
  const resolvedBaseUrl = providerNeedsBaseUrl(provider) ? resolveGenAIBaseUrl(provider, baseUrl) : undefined;
  if (providerNeedsBaseUrl(provider) && !resolvedBaseUrl) {
    throw new Error("Add a local model URL in Settings to generate titles and captions.");
  }
  return getProvider(provider).generate({
    apiKey: key,
    model: resolved,
    prompt,
    images,
    temperature: resolveTemperature(temperature),
    baseUrl: resolvedBaseUrl,
  });
}
