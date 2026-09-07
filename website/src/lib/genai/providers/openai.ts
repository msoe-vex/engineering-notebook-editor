import type { GenAIProvider } from "../types";
import { readProviderError, resolveTemperature } from "../shared";

export const openai: GenAIProvider = {
  info: {
    id: "openai",
    label: "OpenAI",
    hint: "OpenAI platform",
    keyPlaceholder: "OpenAI API key",
    keyUrl: "https://platform.openai.com/api-keys",
    keyUrlLabel: "OpenAI platform",
    defaultModel: "gpt-4o-mini",
  },
  async generate({ apiKey, model, prompt, images, temperature }) {
    const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
    for (const image of images || []) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
      });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: resolveTemperature(temperature),
        messages: [{ role: "user", content }],
      }),
    });
    if (!response.ok) throw new Error(await readProviderError(response, "OpenAI request failed"));
    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content || "";
    if (!text.trim()) throw new Error("OpenAI returned an empty response.");
    return text;
  },
};
