import { describe, expect, it } from "vitest";
import { isGenAIProviderId, parseGeneratedText, parseImageDataUrl, sanitizeGenAIModelId } from "@/lib/genai";

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

describe("sanitizeGenAIModelId", () => {
  it("accepts dotted model ids", () => {
    expect(sanitizeGenAIModelId("gemini-2.5-flash")).toBe("gemini-2.5-flash");
  });

  it("rejects path characters", () => {
    expect(() => sanitizeGenAIModelId("../secret")).toThrow();
  });
});
