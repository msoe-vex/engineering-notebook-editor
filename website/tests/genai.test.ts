import { describe, expect, it } from "vitest";
import { isAnthropicImageInputModel, isGenAIProviderId, isListedGeminiMultimodalModel, isListedOpenAIVisionChatModel, parseGeneratedText, parseImageDataUrl, sanitizeGenAIBaseUrl, sanitizeGenAIModelId, sanitizeLocalGenAIModelId } from "@/lib/genai";

describe("parseGeneratedText", () => {
  it("strips quotes and fences", () => {
    expect(parseGeneratedText('"Drive Base"')).toBe("Drive Base");
    expect(parseGeneratedText("```\nIntake Roller\n```")).toBe("Intake Roller");
  });
});

describe("parseImageDataUrl", () => {
  it("extracts jpeg payload", () => {
    const parsed = parseImageDataUrl("data:image/jpeg;base64,abcd");
    expect(parsed.mimeType).toBe("image/jpeg");
    expect(parsed.base64).toBe("abcd");
  });
});

describe("isGenAIProviderId", () => {
  it("accepts known providers", () => {
    expect(isGenAIProviderId("openai")).toBe(true);
    expect(isGenAIProviderId("local")).toBe(true);
    expect(isGenAIProviderId("claude")).toBe(false);
  });
});

describe("isListedOpenAIVisionChatModel", () => {
  it("keeps vision chat families and drops text-only reasoning models", () => {
    expect(isListedOpenAIVisionChatModel("gpt-4o-mini")).toBe(true);
    expect(isListedOpenAIVisionChatModel("o4-mini")).toBe(true);
    expect(isListedOpenAIVisionChatModel("o3-mini")).toBe(false);
    expect(isListedOpenAIVisionChatModel("whisper-1")).toBe(false);
  });
});

describe("isListedGeminiMultimodalModel", () => {
  it("keeps generateContent Gemini models and drops embeddings and image generators", () => {
    expect(isListedGeminiMultimodalModel("gemini-3.5-flash-lite", ["generateContent"])).toBe(true);
    expect(isListedGeminiMultimodalModel("gemini-embedding-001", ["embedContent"])).toBe(false);
    expect(isListedGeminiMultimodalModel("gemini-3.1-flash-image", ["generateContent"])).toBe(false);
  });
});

describe("isAnthropicImageInputModel", () => {
  it("requires image_input when capabilities are present", () => {
    expect(isAnthropicImageInputModel({ image_input: { supported: true } })).toBe(true);
    expect(isAnthropicImageInputModel({ image_input: { supported: false } })).toBe(false);
    expect(isAnthropicImageInputModel(null)).toBe(true);
  });
});

describe("sanitizeGenAIModelId", () => {
  it("accepts dotted model ids", () => {
    expect(sanitizeGenAIModelId("gemini-2.5-flash")).toBe("gemini-2.5-flash");
  });

  it("rejects path characters", () => {
    expect(() => sanitizeGenAIModelId("../secret")).toThrow();
  });
});

describe("sanitizeLocalGenAIModelId", () => {
  it("accepts LM Studio and Ollama ids", () => {
    expect(sanitizeLocalGenAIModelId("openai/gpt-oss-20b")).toBe("openai/gpt-oss-20b");
    expect(sanitizeLocalGenAIModelId("qwen2.5:14b")).toBe("qwen2.5:14b");
  });

  it("rejects path traversal", () => {
    expect(() => sanitizeLocalGenAIModelId("../secret")).toThrow();
  });
});

describe("sanitizeGenAIBaseUrl", () => {
  it("keeps loopback OpenAI-compatible URLs", () => {
    expect(sanitizeGenAIBaseUrl("http://127.0.0.1:1234/v1")).toBe("http://127.0.0.1:1234/v1");
    expect(sanitizeGenAIBaseUrl("http://localhost:1234/v1")).toBe("http://localhost:1234/v1");
  });

  it("appends /v1 when the path is empty", () => {
    expect(sanitizeGenAIBaseUrl("http://127.0.0.1:1234")).toBe("http://127.0.0.1:1234/v1");
  });

  it("accepts a host without a scheme", () => {
    expect(sanitizeGenAIBaseUrl("127.0.0.1:1234/v1")).toBe("http://127.0.0.1:1234/v1");
  });

  it("rejects non-http schemes", () => {
    expect(() => sanitizeGenAIBaseUrl("javascript:alert(1)")).toThrow();
    expect(() => sanitizeGenAIBaseUrl("file:///etc/passwd")).toThrow();
  });
});
