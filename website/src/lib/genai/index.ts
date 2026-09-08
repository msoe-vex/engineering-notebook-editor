export {
  GENAI_DEFAULT_TEMPERATURE,
} from "./types";
export type {
  EntryForAI,
  GenAI,
  GenAIGenerateRequest,
  GenAIImagePart,
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
  getGenAIApiKey,
  getGenAISettings,
  getProvider,
  getProviderInfo,
  getStoredGenAIModel,
  hasGenAIApiKey,
  isGenAIEnabled,
  isGenAIProviderId,
  resolveGenAIModel,
  runProviderGenerate,
  setGenAIApiKey,
  setGenAIEnabled,
  setGenAIModel,
  setGenAIProvider,
  subscribeGenAISettings,
} from "./settings";
export { generateEntryTitle, generateResourceCaption, generateResourceTitle } from "./tasks";

import type { GenAI } from "./types";
import {
  parseGeneratedText,
  parseImageDataUrl,
  resolveTemperature,
  sanitizeGenAIModelId,
} from "./shared";
import {
  getGenAISettings,
  hasGenAIApiKey,
  isGenAIEnabled,
  setGenAIApiKey,
  setGenAIEnabled,
  setGenAIModel,
  setGenAIProvider,
} from "./settings";
import { generateEntryTitle, generateResourceCaption, generateResourceTitle } from "./tasks";

export { parseGeneratedText, parseImageDataUrl, resolveTemperature, sanitizeGenAIModelId };

export const genai: GenAI = {
  hasApiKey: hasGenAIApiKey,
  isEnabled: isGenAIEnabled,
  getSettings: getGenAISettings,
  setEnabled: setGenAIEnabled,
  setProvider: setGenAIProvider,
  setApiKey: setGenAIApiKey,
  setModel: setGenAIModel,
  generateResourceTitle,
  generateResourceCaption,
  generateEntryTitle,
};
