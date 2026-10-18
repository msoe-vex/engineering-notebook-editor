import type { UserPreferences, UserProfile } from "@engineering-notebook/shared";
import { cloudApi } from "@/lib/cloud/api";
import {
  getGenAISettings,
  setGenAIBaseUrl,
  setGenAIEnabled,
  setGenAIModel,
  setGenAIProvider,
  type GenAIProviderId,
  isGenAIProviderId,
} from "@/lib/genai";
import { readDefaultAuthors, writeDefaultAuthors } from "@/lib/notebook/metadata";

export type ThemeId = "light" | "dark" | "system";

/** Build Firestore-safe prefs from current local settings (never includes API keys). */
export function collectLocalPreferences(theme?: string | null): UserPreferences {
  const genai = getGenAISettings();
  return {
    theme: theme === "light" || theme === "dark" || theme === "system" ? theme : "system",
    defaultAuthors: readDefaultAuthors(),
    genai: {
      enabled: genai.enabled === true,
      provider: genai.provider,
      models: { ...genai.models },
      baseUrls: { ...genai.baseUrls },
    },
  };
}

/** Apply server prefs onto local storage / theme. Keys are never taken from the server. */
export function applyServerPreferences(
  prefs: UserPreferences | undefined,
  setTheme: (theme: string) => void
) {
  if (!prefs) return;
  if (prefs.theme) setTheme(prefs.theme);
  if (prefs.defaultAuthors?.length) writeDefaultAuthors(prefs.defaultAuthors);
  if (prefs.genai) {
    if (typeof prefs.genai.enabled === "boolean") setGenAIEnabled(prefs.genai.enabled);
    if (prefs.genai.provider && isGenAIProviderId(prefs.genai.provider)) {
      setGenAIProvider(prefs.genai.provider);
    }
    const provider = (prefs.genai.provider && isGenAIProviderId(prefs.genai.provider)
      ? prefs.genai.provider
      : getGenAISettings().provider) as GenAIProviderId;
    if (prefs.genai.models) {
      for (const [id, model] of Object.entries(prefs.genai.models)) {
        if (isGenAIProviderId(id) && model) setGenAIModel(model, id);
      }
      if (prefs.genai.models[provider]) setGenAIModel(prefs.genai.models[provider], provider);
    }
    if (prefs.genai.baseUrls) {
      for (const [id, url] of Object.entries(prefs.genai.baseUrls)) {
        if (isGenAIProviderId(id) && url) setGenAIBaseUrl(url, id);
      }
    }
  }
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;

export function schedulePreferencesSync(theme?: string | null) {
  if (typeof window === "undefined") return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    void cloudApi
      .patchMe({ preferences: collectLocalPreferences(theme) })
      .catch((err) => console.warn("preferences sync failed", err));
  }, 600);
}

export async function hydratePreferencesFromServer(
  setTheme: (theme: string) => void
): Promise<UserProfile | null> {
  try {
    const profile = (await cloudApi.me()) as UserProfile;
    // Prefer local keys; fill gaps from server for non-secret fields.
    const localAuthors = readDefaultAuthors();
    applyServerPreferences(profile.preferences, setTheme);
    if (localAuthors.length && !profile.preferences?.defaultAuthors?.length) {
      // keep local authors; they'll sync up on next Preferences edit
    } else if (!localAuthors.length && profile.preferences?.defaultAuthors?.length) {
      writeDefaultAuthors(profile.preferences.defaultAuthors);
    }
    return profile;
  } catch {
    return null;
  }
}
