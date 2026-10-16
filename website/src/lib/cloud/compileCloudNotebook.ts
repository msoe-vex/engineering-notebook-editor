import type { FileInput } from "texlyre-busytex";
import { cloudApi } from "@/lib/cloud/api";
import type { EntryMeta } from "@/components/cloud/notebook-types";
import { ASSETS_DIR, ENTRIES_INDEX_PATH, LATEX_DIR, PHASES_PATH, TEAM_PATH } from "@/lib/constants";
import {
  loadBusyTexStaticFiles,
  runXeLatex,
  type CompileMode,
  type CompileResult,
  type CompileStatusCallback,
} from "@/lib/latex/busytex";
import {
  generateAllEntriesLatex,
  generateEntryLatex,
  generatePhasesLatex,
  generateTeamLatex,
  latexPhaseRef,
} from "@/lib/latex/latex";
import {
  buildResourceTypeIndex,
  extractResources,
  type EntryMetadata,
  type ProjectPhase,
  type TeamMetadata,
  type TipTapNode,
} from "@/lib/notebook/metadata";
import type { NotebookSummaryV5 } from "@engineering-notebook/shared";

function walkRemapAssets(node: TipTapNode, assetIds: Set<string>): TipTapNode {
  if (node.type === "image") {
    const attrs = { ...(node.attrs || {}) };
    const fp = String(attrs.filePath || "");
    const id = String(attrs.id || "");
    let assetId = id;
    if (fp.startsWith("cloud:")) assetId = fp.slice("cloud:".length);
    else if (fp.startsWith(`${ASSETS_DIR}/`)) {
      // already a local-style path
      return { ...node, attrs };
    }
    if (assetId) {
      assetIds.add(assetId);
      const path = `${ASSETS_DIR}/${assetId}`;
      attrs.filePath = path;
      attrs.originalFilePath = path;
      attrs.id = assetId;
    }
    return { ...node, attrs };
  }
  return {
    ...node,
    content: node.content?.map((child) => walkRemapAssets(child, assetIds)),
  };
}

function toEntryMetadata(id: string, e: EntryMeta): EntryMetadata {
  return {
    title: e.title || "",
    authors: e.authors || [],
    phase: e.phase,
    createdAt: e.createdAt || "",
    updatedAt: e.updatedAt || "",
    date: e.date || "",
    filename: id,
    order: e.order ?? 0,
    isTemplate: e.isTemplate,
    assets: (e.assetIds || []).map((aid) => `${ASSETS_DIR}/${aid}`),
  };
}

export async function generateCloudEntryLatex(
  orgId: string,
  notebookId: string,
  entryId: string,
  meta: EntryMeta,
  phases: Record<string, ProjectPhase> | undefined,
  allEntries: Record<string, EntryMeta>,
  tipTap?: unknown
): Promise<{ latex: string; doc: TipTapNode }> {
  const raw =
    tipTap ?? (await cloudApi.getEntryContent(orgId, notebookId, entryId).catch(() => ({ type: "doc", content: [] })));
  const assetIds = new Set<string>();
  const doc = walkRemapAssets(raw as TipTapNode, assetIds);
  const entryMap = Object.fromEntries(
    Object.entries(allEntries).map(([id, e]) => [id, toEntryMetadata(id, e)])
  );
  const resources = extractResources(doc);
  const resourceTypes = buildResourceTypeIndex(entryMap, resources, entryId);
  const latex = generateEntryLatex(
    doc,
    meta.title || "Untitled",
    meta.authors || [],
    latexPhaseRef(meta.phase, phases),
    meta.createdAt,
    entryId,
    resourceTypes,
    meta.date
  );
  return { latex, doc };
}

export async function compileCloudNotebook(opts: {
  orgId: string;
  notebookId: string;
  entries: Record<string, EntryMeta>;
  notebookSummary: NotebookSummaryV5 | null;
  mode?: CompileMode;
  onStatus?: CompileStatusCallback;
}): Promise<CompileResult & { lastCompiled?: string }> {
  const { orgId, notebookId, entries, notebookSummary, mode = "quality", onStatus } = opts;
  const TOTAL = 8;

  onStatus?.("Loading notebook content...", 1, TOTAL, 8);

  const entryMeta: Record<string, EntryMetadata> = {};
  for (const [id, e] of Object.entries(entries)) {
    entryMeta[id] = toEntryMetadata(id, e);
  }

  const phases = (notebookSummary?.phases as Record<string, ProjectPhase>) || {};
  const membersList = await cloudApi.listNotebookMembers(orgId, notebookId).catch(() => []);
  const team: TeamMetadata = {
    teamName: notebookSummary?.title || notebookSummary?.name || "",
    teamNumber: notebookSummary?.subtitle || "",
    organization: "",
    members: Object.fromEntries(
      membersList.map((m) => [
        m.id,
        {
          name: m.name,
          role: m.role || "Member",
          order: m.order,
          ...(m.imageAssetId ? { image: `${ASSETS_DIR}/${m.imageAssetId}` } : {}),
        },
      ])
    ),
    ...(notebookSummary?.logoAssetId
      ? { logo: `${ASSETS_DIR}/${notebookSummary.logoAssetId}` }
      : {}),
  };

  const files: FileInput[] = await loadBusyTexStaticFiles((s, step, _t, pct) =>
    onStatus?.(s, step, TOTAL, Math.min(pct, 45))
  );

  onStatus?.("Generating LaTeX...", 5, TOTAL, 55);
  files.push({ path: TEAM_PATH, content: generateTeamLatex(team) });
  files.push({ path: PHASES_PATH, content: generatePhasesLatex(phases) });
  files.push({
    path: ENTRIES_INDEX_PATH,
    content: generateAllEntriesLatex({ entries: entryMeta }),
  });

  const neededAssets = new Set<string>();
  if (notebookSummary?.logoAssetId) neededAssets.add(notebookSummary.logoAssetId);
  for (const m of membersList) {
    if (m.imageAssetId) neededAssets.add(m.imageAssetId);
  }

  for (const [id, e] of Object.entries(entries)) {
    if (e.isTemplate) continue;
    onStatus?.(`Preparing entry ${e.title || id}...`, 5, TOTAL, 60);
    const { latex, doc } = await generateCloudEntryLatex(
      orgId,
      notebookId,
      id,
      e,
      phases,
      entries
    );
    files.push({ path: `${LATEX_DIR}/${id}.tex`, content: latex });
    walkRemapAssets(doc, neededAssets);
    for (const aid of e.assetIds || []) neededAssets.add(aid);
  }

  onStatus?.("Downloading images...", 6, TOTAL, 75);
  for (const assetId of neededAssets) {
    try {
      const { url } = await cloudApi.getAssetUrl(orgId, notebookId, assetId);
      const res = await fetch(url);
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      files.push({ path: `${ASSETS_DIR}/${assetId}`, content: bytes });
    } catch (err) {
      console.warn("Failed to load cloud asset for compile", assetId, err);
    }
  }

  const result = await runXeLatex(files, mode, (s, step, _t, pct) =>
    onStatus?.(s, Math.max(step, 7), TOTAL, Math.max(pct, 85))
  );

  if (!result.success || !result.pdf) return result;

  onStatus?.("Uploading PDF...", 8, TOTAL, 95);
  const uploaded = await cloudApi.uploadExportPdf(orgId, notebookId, "latest", result.pdf);
  return { ...result, lastCompiled: uploaded.lastCompiled };
}
