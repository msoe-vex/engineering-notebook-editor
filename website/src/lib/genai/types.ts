export type GenAIProviderId = "gemini" | "openai" | "anthropic";

export const GENAI_DEFAULT_TEMPERATURE = 0.4;

export interface GenAIImagePart {
  mimeType: string;
  base64: string;
}

export interface GenAIGenerateRequest {
  apiKey: string;
  model: string;
  prompt: string;
  temperature?: number;
  images?: GenAIImagePart[];
}

export interface GenAIProviderInfo {
  id: GenAIProviderId;
  label: string;
  hint: string;
  keyPlaceholder: string;
  keyUrl: string;
  keyUrlLabel: string;
  defaultModel: string;
}

export interface GenAIProvider {
  info: GenAIProviderInfo;
  generate(request: GenAIGenerateRequest): Promise<string>;
}

export interface GenAISettings {
  enabled: boolean;
  provider: GenAIProviderId;
  keys: Partial<Record<GenAIProviderId, string>>;
  models: Partial<Record<GenAIProviderId, string>>;
}

export interface ResourceForAI {
  type: string;
  title?: string;
  caption?: string;
  text?: string;
  language?: string;
  imageDataUrl?: string;
}

export interface EntryForAI {
  title?: string;
  body?: string;
  date?: string;
  authors?: string[];
  phase?: string;
}

export interface GenAI {
  hasApiKey(): boolean;
  isEnabled(): boolean;
  getSettings(): GenAISettings;
  setEnabled(enabled: boolean): void;
  setProvider(id: GenAIProviderId): void;
  setApiKey(key: string, provider?: GenAIProviderId): void;
  setModel(model: string, provider?: GenAIProviderId): void;
  generateResourceTitle(resource: ResourceForAI): Promise<string>;
  generateResourceCaption(resource: ResourceForAI): Promise<string>;
  generateEntryTitle(entry: EntryForAI): Promise<string>;
}
