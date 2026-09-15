export {
  GENAI_DEFAULT_TEMPERATURE,
} from "./types";
export type {
  EntryForAI,
  GenAI,
  GenAIGenerateRequest,
  GenAIImagePart,
  GenAIModelOption,
  GenAIProvider,
  GenAIProviderId,
  GenAIProviderInfo,
  GenAISettings,
  ResourceForAI,
} from "./types";
export {
  GENAI_CHANGED_EVENT,
  GENAI_PROVIDERS,
  GENAI_STORAGE_KEY,
  canUseGenAI,
  getGenAIApiKey,
  getGenAIBaseUrl,
  getGenAISettings,
  getProvider,
  getProviderInfo,
  getStoredGenAIModel,
  hasGenAIApiKey,
  hasGenAIModel,
  isGenAIEnabled,
  isGenAIProviderId,
  providerNeedsBaseUrl,
  providerRequiresApiKey,
  resolveGenAIBaseUrl,
  resolveGenAIModel,
  runProviderGenerate,
  runProviderListModels,
  setGenAIApiKey,
  setGenAIBaseUrl,
  setGenAIEnabled,
  setGenAIModel,
  setGenAIProvider,
  subscribeGenAISettings,
} from "./settings";
export { generateEntryTitle, generateResourceCaption, generateResourceTitle } from "./tasks";

import type { GenAI } from "./types";
import {
  isAnthropicImageInputModel,
  isListedGeminiMultimodalModel,
  isListedOpenAIChatModel,
  isListedOpenAIVisionChatModel,
  parseGeneratedText,
  parseImageDataUrl,
  resolveTemperature,
  sanitizeGenAIBaseUrl,
  sanitizeGenAIModelId,
  sanitizeLocalGenAIModelId,
} from "./shared";
import {
  getGenAISettings,
  hasGenAIApiKey,
  hasGenAIModel,
  isGenAIEnabled,
  setGenAIApiKey,
  setGenAIBaseUrl,
  setGenAIEnabled,
  setGenAIModel,
  setGenAIProvider,
} from "./settings";
import { generateEntryTitle, generateResourceCaption, generateResourceTitle } from "./tasks";

export { parseGeneratedText, parseImageDataUrl, resolveTemperature, sanitizeGenAIBaseUrl, sanitizeGenAIModelId, sanitizeLocalGenAIModelId, isListedOpenAIChatModel, isListedOpenAIVisionChatModel, isListedGeminiMultimodalModel, isAnthropicImageInputModel };

export const genai: GenAI = {
  hasApiKey: hasGenAIApiKey,
  hasModel: hasGenAIModel,
  isEnabled: isGenAIEnabled,
  getSettings: getGenAISettings,
  setEnabled: setGenAIEnabled,
  setProvider: setGenAIProvider,
  setApiKey: setGenAIApiKey,
  setBaseUrl: setGenAIBaseUrl,
  setModel: setGenAIModel,
  generateResourceTitle,
  generateResourceCaption,
  generateEntryTitle,
};
