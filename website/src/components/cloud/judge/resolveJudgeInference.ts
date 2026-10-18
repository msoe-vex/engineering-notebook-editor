import { cloudApi } from "@/lib/cloud/api";
import {
  canUseGenAI,
  getGenAIApiKey,
  getGenAISettings,
  providerNeedsBaseUrl,
  resolveGenAIModel,
} from "@/lib/genai";

export type JudgeInferenceChoice = "vertex" | "byok";

export type JudgeInferenceBody = {
  inference: JudgeInferenceChoice;
  byok?: { provider: "openai" | "anthropic" | "gemini"; apiKey: string; model: string };
};

/**
 * Resolve judge inference from Preferences (GenAI settings) + platform grant.
 * Prefer configured BYOK; otherwise Vertex when the user has platformAi.
 */
export async function resolveJudgeInferenceBody(): Promise<JudgeInferenceBody> {
  const settings = getGenAISettings();

  if (
    (settings.provider === "openai" ||
      settings.provider === "anthropic" ||
      settings.provider === "gemini") &&
    canUseGenAI(settings.provider) &&
    !providerNeedsBaseUrl(settings.provider)
  ) {
    const model = resolveGenAIModel(settings.provider);
    if (!model) throw new Error("Choose a model in Preferences.");
    return {
      inference: "byok",
      byok: {
        provider: settings.provider,
        apiKey: getGenAIApiKey(settings.provider),
        model,
      },
    };
  }

  if (providerNeedsBaseUrl(settings.provider)) {
    throw new Error(
      "Local models are not supported for Judge. Configure OpenAI/Anthropic/Gemini in Preferences, or use Vertex with a Platform AI grant."
    );
  }

  const me = (await cloudApi.me()) as {
    platformRole?: string;
    grants?: { platformAi?: boolean };
  };
  if (me.grants?.platformAi || me.platformRole === "service_admin") {
    return { inference: "vertex" };
  }

  throw new Error(
    "Configure GenAI in Preferences (BYOK), or get a Platform AI grant for Vertex."
  );
}
