import { describe, expect, it } from "vitest";
import { isAnthropicImageInputModel, isGenAIProviderId, isListedGeminiMultimodalModel, isListedOpenAIVisionChatModel, parseGeneratedText, parseImageDataUrl, sanitizeGenAIModelId } from "@/lib/genai";

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
