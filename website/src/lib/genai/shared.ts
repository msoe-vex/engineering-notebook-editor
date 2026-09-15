import { GENAI_DEFAULT_TEMPERATURE } from "./types";

const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

export function parseImageDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = dataUrl.trim().match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) {
    throw new Error("Image data is not a base64 data URL.");
  }
  const mimeType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  if (!ALLOWED_IMAGE_MIMES.has(mimeType)) {
    throw new Error(`Unsupported image type for generation (${mimeType}).`);
  }
  return { mimeType, base64: match[2].replace(/\s/g, "") };
}

export function parseGeneratedText(raw: string): string {
  let text = raw.trim();
  const fenced = text.match(/^```(?:\w+)?\s*([\s\S]*?)```$/);
  if (fenced) text = fenced[1].trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }
  return text.replace(/\s+/g, " ").trim();
}

export async function readProviderError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => null) as {
    error?: { message?: string } | string;
    message?: string;
  } | null;
  if (typeof payload?.error === "string") return payload.error;
  if (payload?.error && typeof payload.error === "object" && payload.error.message) return payload.error.message;
  if (payload?.message) return payload.message;
  return `${fallback} (${response.status}).`;
}

export function resolveTemperature(temperature?: number): number {
  if (typeof temperature !== "number" || Number.isNaN(temperature)) return GENAI_DEFAULT_TEMPERATURE;
  return Math.min(2, Math.max(0, temperature));
}

export function sanitizeGenAIModelId(model: string): string {
  const next = model.trim();
  if (!next) return "";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(next)) {
    throw new Error("Model id may only contain letters, numbers, dots, underscores, and hyphens.");
  }
  return next;
}

/** Local / OpenAI-compatible ids often include `/` (LM Studio) or `:` (Ollama). */
export function sanitizeLocalGenAIModelId(model: string): string {
  const next = model.trim();
  if (!next) return "";
  if (next.includes("..") || next.includes("\\") || /[\s<>'"\u0000]/.test(next)) {
    throw new Error("Invalid model id.");
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(next)) {
    throw new Error("Model id may only contain letters, numbers, dots, underscores, hyphens, colons, and slashes.");
  }
  return next;
}

export const LOCAL_GENAI_DEFAULT_BASE_URL = "http://127.0.0.1:1234/v1";

export function sanitizeGenAIBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : `http://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Enter a valid URL, for example http://127.0.0.1:1234/v1.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Base URL must start with http:// or https://.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Base URL must not include credentials.");
  }
  parsed.hash = "";
  parsed.search = "";
  const path = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = path && path !== "/" ? path : "/v1";
  return parsed.toString().replace(/\/+$/, "");
}

export function joinGenAIEndpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export async function fetchOpenAICompatible(
  url: string,
  init: RequestInit,
  fallback: string,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error(
      `${fallback} Could not reach ${url}. If this is a local server, make sure it is running and CORS is enabled for this site.`,
    );
  }
}

export function trySanitizeGenAIModelId(model: string): string | null {
  try {
    const id = sanitizeGenAIModelId(model);
    return id || null;
  } catch {
    return null;
  }
}

export function trySanitizeLocalGenAIModelId(model: string): string | null {
  try {
    const id = sanitizeLocalGenAIModelId(model);
    return id || null;
  } catch {
    return null;
  }
}

export function isListedOpenAIChatModel(id: string): boolean {
  const n = id.toLowerCase();
  const blocked = [
    "embedding",
    "whisper",
    "tts",
    "dall-e",
    "davinci",
    "babbage",
    "moderation",
    "realtime",
    "transcribe",
    "sora",
    "image",
    "audio",
    "search",
    "codex",
    "computer-use",
    "instruct",
  ];
  if (blocked.some((part) => n.includes(part))) return false;
  return (
    n.startsWith("gpt-")
    || n.startsWith("o1")
    || n.startsWith("o3")
    || n.startsWith("o4")
    || n.startsWith("chatgpt-")
  );
}

/** OpenAI /v1/models has no vision flag; keep families known to accept images. */
export function isListedOpenAIVisionChatModel(id: string): boolean {
  if (!isListedOpenAIChatModel(id)) return false;
  const n = id.toLowerCase();
  if (n.startsWith("o1") || n.startsWith("o3") || n.startsWith("gpt-3.5")) return false;
  return (
    n.startsWith("gpt-4o")
    || n.startsWith("gpt-4.1")
    || n.startsWith("gpt-4.5")
    || n.startsWith("gpt-5")
    || n.startsWith("gpt-4-turbo")
    || n.startsWith("gpt-4-vision")
    || n.startsWith("chatgpt-")
    || n.startsWith("o4")
  );
}

export function isListedGeminiMultimodalModel(id: string, methods?: string[]): boolean {
  if (!methods?.includes("generateContent")) return false;
  const n = id.toLowerCase();
  if (!n.startsWith("gemini-")) return false;
  const blocked = ["embedding", "imagen", "veo", "tts", "aqa", "robotics"];
  if (blocked.some((part) => n.includes(part))) return false;
  if (n.includes("-image") || n.endsWith("image")) return false;
  return true;
}

export function isAnthropicImageInputModel(capabilities?: { image_input?: { supported?: boolean } } | null): boolean {
  if (!capabilities) return true;
  return capabilities.image_input?.supported === true;
}

export function extractGeminiText(payload: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}): string {
  return payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
}
