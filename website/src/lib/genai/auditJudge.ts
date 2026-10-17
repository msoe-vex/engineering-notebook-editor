import type { AuditProvider } from "@engineering-notebook/shared";
import { cloudApi, type AuditRecord } from "@/lib/cloud/api";
import {
  canUseGenAI,
  getGenAIApiKey,
  getGenAISettings,
  providerNeedsBaseUrl,
} from "@/lib/genai";
import { runGenerate } from "@/lib/genai/client";

const DEFAULT_RUBRIC = "REC Foundation Design Award";
const MAX_ENTRIES_FOR_CONTENT = 8;
const MAX_CONTENT_CHARS = 4000;

export type AuditInference = AuditProvider;

export type RunNotebookAuditOptions = {
  rubric?: string;
  /** Force inference path; otherwise resolve from GenAI settings + platformAi grant. */
  inference?: AuditInference;
  onProgress?: (audit: AuditRecord) => void;
};

type MeLike = {
  platformRole?: string;
  grants?: { platformAi?: boolean };
};

function tipTapToPlain(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { text?: string; content?: unknown[] };
    if (typeof n.text === "string") parts.push(n.text);
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(doc);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

async function resolveInference(forced?: AuditInference): Promise<AuditInference> {
  if (forced) return forced;
  const settings = getGenAISettings();
  if (providerNeedsBaseUrl(settings.provider) && canUseGenAI(settings.provider)) {
    return "local";
  }
  if (canUseGenAI(settings.provider)) {
    return "byok";
  }
  const me = (await cloudApi.me()) as MeLike;
  if (me.grants?.platformAi || me.platformRole === "service_admin") {
    return "vertex";
  }
  throw new Error(
    "Configure GenAI in Settings (local or BYOK), or get a Platform AI grant for Vertex."
  );
}

async function infer(inference: AuditInference, prompt: string): Promise<string> {
  if (inference === "vertex") {
    const { text } = await cloudApi.aiComplete({ prompt, temperature: 0.2 });
    return text;
  }
  // local + byok share runGenerate (local → browser URL; byok → /api/genai)
  const settings = getGenAISettings();
  if (!canUseGenAI(settings.provider)) {
    throw new Error("GenAI provider is not configured in Settings.");
  }
  if (!providerNeedsBaseUrl(settings.provider) && !getGenAIApiKey(settings.provider)) {
    throw new Error("Add an API key in Settings for BYOK audit.");
  }
  return runGenerate(prompt);
}

function parseScorecardJson(text: string): {
  scores: Record<string, number>;
  advice: Array<{ entryId: string | null; message: string }>;
  summary: string;
} {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return { scores: {}, advice: [], summary: text.slice(0, 2000) || "Audit complete." };
  }
  try {
    const parsed = JSON.parse(match[0]) as {
      scores?: Record<string, number>;
      advice?: Array<{ entryId?: string | null; message?: string }>;
      summary?: string;
    };
    return {
      scores: parsed.scores && typeof parsed.scores === "object" ? parsed.scores : {},
      advice: Array.isArray(parsed.advice)
        ? parsed.advice
            .filter((a) => a && typeof a.message === "string")
            .map((a) => ({
              entryId: a.entryId ?? null,
              message: String(a.message),
            }))
        : [],
      summary: typeof parsed.summary === "string" ? parsed.summary : "Audit complete.",
    };
  } catch {
    return { scores: {}, advice: [], summary: text.slice(0, 2000) || "Audit complete." };
  }
}

/**
 * Browser-orchestrated rubric audit: Core stores progress; inference is local/BYOK/Vertex.
 */
export async function runNotebookAudit(
  orgId: string,
  notebookId: string,
  options: RunNotebookAuditOptions = {}
): Promise<AuditRecord> {
  const rubric = options.rubric?.trim() || DEFAULT_RUBRIC;
  const inference = await resolveInference(options.inference);
  const steps: Array<{ at: string; message: string; entryId?: string | null }> = [];

  const pushStep = async (auditId: string, message: string, entryId?: string | null) => {
    steps.push({ at: new Date().toISOString(), message, entryId });
    const updated = await cloudApi.patchAudit(orgId, notebookId, auditId, {
      status: "running",
      steps: [...steps],
    });
    options.onProgress?.(updated);
    return updated;
  };

  let audit = await cloudApi.startAudit(orgId, notebookId, {
    rubric,
    provider: inference,
    status: "running",
  });
  options.onProgress?.(audit);

  try {
    await pushStep(audit.id, `Listed inference path: ${inference}`);

    const { entries } = await cloudApi.listEntries(orgId, notebookId);
    const entryList = Object.entries(entries).map(([id, meta]) => ({
      id,
      title: meta.title || id,
      date: meta.date,
      phase: meta.phase,
    }));
    await pushStep(audit.id, `Found ${entryList.length} entries`);

    const sample = entryList.slice(0, MAX_ENTRIES_FOR_CONTENT);
    const withContent: Array<{ id: string; title: string; excerpt: string }> = [];
    for (const e of sample) {
      try {
        const doc = await cloudApi.getEntryContent(orgId, notebookId, e.id);
        const plain = tipTapToPlain(doc).slice(0, MAX_CONTENT_CHARS);
        withContent.push({ id: e.id, title: e.title, excerpt: plain });
        await pushStep(audit.id, `Read entry “${e.title}”`, e.id);
      } catch {
        withContent.push({ id: e.id, title: e.title, excerpt: "" });
        await pushStep(audit.id, `Could not read content for “${e.title}”`, e.id);
      }
    }

    const prompt = [
      "You are an engineering notebook rubric auditor.",
      `Rubric: ${rubric}`,
      "Reply with JSON only: {\"scores\": Record<string, number 0-10>, \"advice\": [{\"entryId\": string|null, \"message\": string}], \"summary\": string}",
      "Entry index:",
      JSON.stringify(entryList.map((e) => ({ id: e.id, title: e.title, date: e.date, phase: e.phase }))),
      "Sample entry excerpts:",
      JSON.stringify(withContent),
    ].join("\n\n");

    await pushStep(audit.id, "Calling model…");
    const text = await infer(inference, prompt);
    const parsed = parseScorecardJson(text);

    audit = await cloudApi.patchAudit(orgId, notebookId, audit.id, {
      status: "completed",
      scores: parsed.scores,
      advice: parsed.advice,
      summary: parsed.summary,
      steps: [
        ...steps,
        { at: new Date().toISOString(), message: "Scorecard ready" },
      ],
      error: null,
    });
    options.onProgress?.(audit);
    return audit;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      audit = await cloudApi.patchAudit(orgId, notebookId, audit.id, {
        status: "failed",
        error: message,
        steps: [...steps, { at: new Date().toISOString(), message: `Failed: ${message}` }],
      });
      options.onProgress?.(audit);
    } catch {
      /* ignore persistence failure */
    }
    throw err;
  }
}
