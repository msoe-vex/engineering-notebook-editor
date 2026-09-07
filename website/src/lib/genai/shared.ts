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

export function extractGeminiText(payload: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}): string {
  return payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
}
