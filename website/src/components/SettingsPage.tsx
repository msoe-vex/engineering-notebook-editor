"use client";

import { useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Eye, EyeOff, KeyRound, Monitor, Moon, Settings, Sun, X } from "lucide-react";
import { readLastAuthors, writeLastAuthors } from "@/lib/metadata";
import {
  GENAI_PROVIDERS,
  getGenAIApiKey,
  getGenAISettings,
  getStoredGenAIModel,
  setGenAIApiKey,
  setGenAIModel,
  setGenAIProvider,
  subscribeGenAISettings,
} from "@/lib/genai";
import { useWorkspace } from "@/hooks/useWorkspace";
import AuthorsInput from "@/components/editor/ui/AuthorsInput";

interface SettingsPageProps {
  onClose: () => void;
  isEmbedded?: boolean;
}

const THEME_OPTIONS = [
  { id: "system", label: "System", hint: "Match the OS", icon: Monitor },
  { id: "light", label: "Light", hint: "Always light", icon: Sun },
  { id: "dark", label: "Dark", hint: "Always dark", icon: Moon },
] as const;

function subscribeLastAuthors(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function getLastAuthorsJson() {
  return JSON.stringify(readLastAuthors());
}

function getEmptyAuthorsJson() {
  return "[]";
}

function getEmptyGenAIJson() {
  return JSON.stringify({ provider: "gemini", keys: {}, models: {} });
}

function getGenAISettingsJson() {
  return JSON.stringify(getGenAISettings());
}

export default function SettingsPage({ onClose, isEmbedded = false }: SettingsPageProps) {
  const { theme, setTheme } = useTheme();
  const { metadata } = useWorkspace();
  const storedAuthorsJson = useSyncExternalStore(subscribeLastAuthors, getLastAuthorsJson, getEmptyAuthorsJson);
  const storedGenAIJson = useSyncExternalStore(subscribeGenAISettings, getGenAISettingsJson, getEmptyGenAIJson);
  const [authorsOverride, setAuthorsOverride] = useState<string[] | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState<string | null>(null);
  const [modelDraft, setModelDraft] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const authors = authorsOverride ?? (JSON.parse(storedAuthorsJson) as string[]);
  const genAI = JSON.parse(storedGenAIJson) as ReturnType<typeof getGenAISettings>;
  const provider = genAI.provider;
  const providerInfo = GENAI_PROVIDERS.find((p) => p.id === provider) || GENAI_PROVIDERS[0];
  const apiKey = apiKeyDraft ?? getGenAIApiKey(provider);
  const modelId = modelDraft ?? getStoredGenAIModel(provider);

  const names = new Set<string>();
  for (const entry of Object.values(metadata?.entries || {})) {
    for (const name of entry.authors || []) {
      if (name.trim()) names.add(name.trim());
    }
  }
  for (const member of Object.values(metadata?.team?.members || {})) {
    if (member.name?.trim()) names.add(member.name.trim());
  }
  const authorOptions = Array.from(names).sort((a, b) => a.localeCompare(b));

  const selectedTheme = theme || "system";

  return (
    <div className={isEmbedded ? "w-full h-full flex flex-col bg-nb-bg overflow-hidden" : "fixed inset-0 z-[600] bg-nb-bg flex flex-col animate-in fade-in duration-300"}>
      <div className="flex items-center justify-between px-8 h-16 border-b border-nb-outline-variant bg-nb-surface shadow-nb-sm shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-nb-primary/10 text-nb-primary flex items-center justify-center">
            <Settings size={20} />
          </div>
          <div>
            <h1 className="text-sm md:text-lg font-black text-nb-on-surface tracking-tight leading-tight">Settings</h1>
            <p className="hidden sm:block text-[10px] font-black tracking-[0.2em] text-nb-on-surface-variant/40 uppercase">
              This browser only
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-nb-surface-low text-nb-on-surface-variant hover:text-nb-on-surface transition-colors cursor-pointer"
          title="Close Settings"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
        <div className="max-w-xl mx-auto space-y-10 pb-12">
          <section className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-nb-on-surface-variant ml-1">
              Default author
            </label>
            <AuthorsInput
              authors={authors}
              options={authorOptions}
              placeholder="Add author"
              className="h-14 rounded-2xl bg-nb-surface border-nb-outline-variant px-4"
              onChange={(next) => {
                setAuthorsOverride(next);
                writeLastAuthors(next);
              }}
            />
            <p className="text-xs text-nb-on-surface-variant/70 leading-relaxed ml-1 mb-6">
              Pre-fills the author list on new entries. Add one or more names; suggestions come from team members and authors already used in this notebook.
            </p>
          </section>

          <section className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-nb-on-surface-variant ml-1">
              Generative AI
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {GENAI_PROVIDERS.map((info) => {
                const active = provider === info.id;
                return (
                  <button
                    key={info.id}
                    type="button"
                    onClick={() => {
                      setApiKeyDraft(null);
                      setModelDraft(null);
                      setGenAIProvider(info.id);
                    }}
                    className={`flex flex-col items-start gap-1 rounded-2xl border px-4 py-3 text-left transition-all cursor-pointer ${
                      active
                        ? "border-nb-primary bg-nb-primary/10 text-nb-on-surface shadow-sm"
                        : "border-nb-outline-variant bg-nb-surface text-nb-on-surface-variant hover:border-nb-primary/40 hover:text-nb-on-surface"
                    }`}
                  >
                    <span className="text-sm font-black">{info.label}</span>
                    <span className="text-[11px] font-medium opacity-70">{info.hint}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-nb-outline-variant bg-nb-surface px-4 h-14">
              <KeyRound size={16} className="shrink-0 text-nb-primary" />
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                autoComplete="off"
                spellCheck={false}
                placeholder={providerInfo.keyPlaceholder}
                onChange={(e) => {
                  setApiKeyDraft(e.target.value);
                  setGenAIApiKey(e.target.value, provider);
                }}
                className="flex-1 min-w-0 bg-transparent outline-none text-sm font-medium text-nb-on-surface placeholder:text-nb-on-surface-variant/40"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="p-1.5 rounded-lg text-nb-on-surface-variant hover:text-nb-on-surface hover:bg-nb-surface-low cursor-pointer"
                title={showApiKey ? "Hide key" : "Show key"}
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <input
              type="text"
              value={modelId}
              autoComplete="off"
              spellCheck={false}
              placeholder={providerInfo.defaultModel}
              onChange={(e) => {
                setModelDraft(e.target.value);
                setGenAIModel(e.target.value, provider);
              }}
              className="w-full h-12 px-4 rounded-2xl border border-nb-outline-variant bg-nb-surface outline-none text-sm font-mono text-nb-on-surface placeholder:text-nb-on-surface-variant/40"
              aria-label="Model id"
            />
            <p className="text-xs text-nb-on-surface-variant/70 leading-relaxed ml-1">
              Keys stay in this browser. Generate on a figure sends the image through this site to{" "}
              {providerInfo.label}, then back — the vendor is billed, not Vercel. Create a key in{" "}
              <a
                href={providerInfo.keyUrl}
                target="_blank"
                rel="noreferrer"
                className="text-nb-primary font-bold hover:underline"
              >
                {providerInfo.keyUrlLabel}
              </a>
              . Leave the model id blank to use {providerInfo.defaultModel}. Switching providers keeps each key and model.
              Sparkles on an entry title or on a figure, table, code, or equation field generate that title or caption.
            </p>
          </section>

          <section className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-nb-on-surface-variant ml-1">
              Theme
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {THEME_OPTIONS.map(({ id, label, hint, icon: Icon }) => {
                const active = selectedTheme === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTheme(id)}
                    className={`flex flex-col items-start gap-2 rounded-2xl border px-4 py-4 text-left transition-all cursor-pointer ${
                      active
                        ? "border-nb-primary bg-nb-primary/10 text-nb-on-surface shadow-sm"
                        : "border-nb-outline-variant bg-nb-surface text-nb-on-surface-variant hover:border-nb-primary/40 hover:text-nb-on-surface"
                    }`}
                  >
                    <Icon size={18} className={active ? "text-nb-primary" : ""} />
                    <span className="text-sm font-black">{label}</span>
                    <span className="text-[11px] font-medium opacity-70">{hint}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
