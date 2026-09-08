import type { GenAIModelOption, GenAIProvider } from "../types";
import { isAnthropicImageInputModel, readProviderError, resolveTemperature, trySanitizeGenAIModelId } from "../shared";

const MAX_PAGES = 8;

export const anthropic: GenAIProvider = {
  info: {
    id: "anthropic",
    label: "Anthropic",
    hint: "Anthropic console",
    keyPlaceholder: "Anthropic API key",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyUrlLabel: "Anthropic console",
    defaultModel: "claude-sonnet-4-5",
  },
  async generate({ apiKey, model, prompt, images, temperature }) {
    const content: Array<Record<string, unknown>> = [];
    for (const image of images || []) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: image.mimeType, data: image.base64 },
      });
    }
    content.push({ type: "text", text: prompt });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        temperature: resolveTemperature(temperature),
        messages: [{ role: "user", content }],
      }),
    });
    if (!response.ok) throw new Error(await readProviderError(response, "Anthropic request failed"));
    const payload = await response.json() as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = payload.content?.filter((part) => part.type === "text").map((part) => part.text || "").join("\n") || "";
    if (!text.trim()) throw new Error("Anthropic returned an empty response.");
    return text;
  },
  async listModels(apiKey) {
    const models: GenAIModelOption[] = [];
    let afterId = "";
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL("https://api.anthropic.com/v1/models");
      url.searchParams.set("limit", "100");
      if (afterId) url.searchParams.set("after_id", afterId);
      const response = await fetch(url, {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      });
      if (!response.ok) throw new Error(await readProviderError(response, "Anthropic model list failed"));
      const payload = await response.json() as {
        data?: Array<{
          id?: string;
          display_name?: string;
          capabilities?: { image_input?: { supported?: boolean } } | null;
        }>;
        has_more?: boolean;
        last_id?: string;
      };
      for (const model of payload.data || []) {
        const id = trySanitizeGenAIModelId(model.id || "");
        if (!id || !isAnthropicImageInputModel(model.capabilities)) continue;
        models.push({ id, label: model.display_name?.trim() || id });
      }
      if (!payload.has_more || !payload.last_id) break;
      afterId = payload.last_id;
    }
    return models;
  },
};
