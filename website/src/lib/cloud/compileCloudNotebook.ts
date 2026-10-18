import type { FileInput } from "texlyre-busytex";
import { cloudApi } from "@/lib/cloud/api";
import type { EntryMeta } from "@/components/cloud/notebook-types";
import { ASSETS_DIR, ENTRIES_INDEX_PATH, LATEX_DIR, PHASES_PATH, TEAM_PATH } from "@/lib/constants";
import {
  loadBusyTexStaticFiles,
  runXeLatex,
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

/** graphicx needs a real extension; cloud asset ids are bare UUIDs. */
function extFromContentType(ct?: string | null): string {
  const c = (ct || "").toLowerCase();
  if (c.includes("png")) return ".png";
  if (c.includes("webp")) return ".webp";
  if (c.includes("gif")) return ".gif";
  if (c.includes("pdf")) return ".pdf";
  return ".jpg";
}

function cloudAssetVfsPath(assetId: string, contentType?: string | null): string {
  if (/\.(jpe?g|png|gif|webp|pdf)$/i.test(assetId)) {
    return `${ASSETS_DIR}/${assetId}`;
  }
  return `${ASSETS_DIR}/${assetId}${extFromContentType(contentType)}`;
}

function bareAssetId(ref: string): string | null {
  if (!ref) return null;
  if (ref.startsWith("cloud:")) return ref.slice("cloud:".length) || null;
  if (ref.startsWith(`${ASSETS_DIR}/`)) {
    const rest = ref.slice(`${ASSETS_DIR}/`.length).replace(/^(compressed|original)\//, "");
    return rest.replace(/\.(jpe?g|png|gif|webp|pdf)$/i, "") || null;
  }
  // bare uuid
  if (/^[0-9a-f-]{36}$/i.test(ref)) return ref;
  return null;
}

function walkRemapAssets(
  node: TipTapNode,
  assetIds: Set<string>,
  pathForId?: (assetId: string) => string
): TipTapNode {
  if (node.type === "image") {
    const attrs = { ...(node.attrs || {}) };
    const fp = String(attrs.filePath || "");
    const id = String(attrs.id || "");
    const assetId = bareAssetId(fp) || bareAssetId(id) || id || null;
    if (assetId) {
      assetIds.add(assetId);
      const path = pathForId?.(assetId) ?? cloudAssetVfsPath(assetId);
      attrs.filePath = path;
      attrs.originalFilePath = path;
      attrs.id = assetId;
    }
    return { ...node, attrs };
  }
  return {
    ...node,
    content: node.content?.map((child) => walkRemapAssets(child, assetIds, pathForId)),
  };
}

function toEntryMetadata(
  id: string,
  e: EntryMeta,
  pathForId?: (assetId: string) => string
): EntryMetadata {
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
    assets: (e.assetIds || []).map((aid) => pathForId?.(aid) ?? cloudAssetVfsPath(aid)),
  };
}

export async function generateCloudEntryLatex(
  orgId: string,
  notebookId: string,
  entryId: string,
  meta: EntryMeta,
  phases: Record<string, ProjectPhase> | undefined,
  allEntries: Record<string, EntryMeta>,
  tipTap?: unknown,
  pathForId?: (assetId: string) => string
): Promise<{ latex: string; doc: TipTapNode; assetIds: Set<string> }> {
  const raw =
    tipTap ?? (await cloudApi.getEntryContent(orgId, notebookId, entryId).catch(() => ({ type: "doc", content: [] })));
  const assetIds = new Set<string>();
  const doc = walkRemapAssets(raw as TipTapNode, assetIds, pathForId);
  const entryMap = Object.fromEntries(
    Object.entries(allEntries).map(([id, e]) => [id, toEntryMetadata(id, e, pathForId)])
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
  return { latex, doc, assetIds };
}

export async function compileCloudNotebook(opts: {
  orgId: string;
  notebookId: string;
  entries: Record<string, EntryMeta>;
  notebookSummary: NotebookSummaryV5 | null;
  onStatus?: CompileStatusCallback;
}): Promise<CompileResult & { lastCompiled?: string }> {
  const { orgId, notebookId, entries, notebookSummary, onStatus } = opts;
  const TOTAL = 8;

  onStatus?.("Loading notebook content...", 1, TOTAL, 8);

  const phases = (notebookSummary?.phases as Record<string, ProjectPhase>) || {};
  const membersList = await cloudApi.listNotebookMembers(orgId, notebookId).catch(() => []);

  const files: FileInput[] = await loadBusyTexStaticFiles((s, step, _t, pct) =>
    onStatus?.(s, step, TOTAL, Math.min(pct, 40))
  );

  // Collect TipTap docs + asset ids before generating LaTeX so VFS paths can include extensions.
  onStatus?.("Collecting images...", 5, TOTAL, 50);
  const neededAssets = new Set<string>();
  if (notebookSummary?.logoAssetId) neededAssets.add(notebookSummary.logoAssetId);
  for (const m of membersList) {
    if (m.imageAssetId) neededAssets.add(m.imageAssetId);
  }

  const tipTapByEntry = new Map<string, TipTapNode>();
  for (const [id, e] of Object.entries(entries)) {
    if (e.isTemplate) continue;
    for (const aid of e.assetIds || []) neededAssets.add(aid);
    const raw = await cloudApi
      .getEntryContent(orgId, notebookId, id)
      .catch(() => ({ type: "doc", content: [] }));
    const collect = new Set<string>();
    const doc = walkRemapAssets(raw as TipTapNode, collect);
    tipTapByEntry.set(id, doc);
    for (const aid of collect) neededAssets.add(aid);
  }

  onStatus?.("Downloading images...", 6, TOTAL, 70);
  const pathByAssetId = new Map<string, string>();
  for (const assetId of neededAssets) {
    try {
      const { url, asset } = await cloudApi.getAssetUrl(orgId, notebookId, assetId);
      const res = await fetch(url);
      if (!res.ok) continue;
      const ct = asset.contentType || res.headers.get("content-type");
      const vfsPath = cloudAssetVfsPath(assetId, ct);
      const bytes = new Uint8Array(await res.arrayBuffer());
      files.push({ path: vfsPath, content: bytes });
      pathByAssetId.set(assetId, vfsPath);
    } catch (err) {
      console.warn("Failed to load cloud asset for compile", assetId, err);
    }
  }

  const pathForId = (assetId: string) =>
    pathByAssetId.get(assetId) ?? cloudAssetVfsPath(assetId);

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
          ...(m.imageAssetId && pathByAssetId.has(m.imageAssetId)
            ? { image: pathForId(m.imageAssetId) }
            : {}),
        },
      ])
    ),
    ...(notebookSummary?.logoAssetId && pathByAssetId.has(notebookSummary.logoAssetId)
      ? { logo: pathForId(notebookSummary.logoAssetId) }
      : {}),
  };

  onStatus?.("Generating LaTeX...", 5, TOTAL, 80);
  const entryMeta: Record<string, EntryMetadata> = {};
  for (const [id, e] of Object.entries(entries)) {
    entryMeta[id] = toEntryMetadata(id, e, pathForId);
  }

  files.push({ path: TEAM_PATH, content: generateTeamLatex(team) });
  files.push({ path: PHASES_PATH, content: generatePhasesLatex(phases) });
  files.push({
    path: ENTRIES_INDEX_PATH,
    content: generateAllEntriesLatex({ entries: entryMeta }),
  });

  for (const [id, e] of Object.entries(entries)) {
    if (e.isTemplate) continue;
    onStatus?.(`Preparing entry ${e.title || id}...`, 5, TOTAL, 82);
    const { latex } = await generateCloudEntryLatex(
      orgId,
      notebookId,
      id,
      e,
      phases,
      entries,
      tipTapByEntry.get(id),
      pathForId
    );
    files.push({ path: `${LATEX_DIR}/${id}.tex`, content: latex });
  }

  const result = await runXeLatex(files, (s, step, _t, pct) =>
    onStatus?.(s, Math.max(step, 7), TOTAL, Math.max(pct, 85))
  );

  if (!result.success || !result.pdf) return result;

  onStatus?.("Uploading PDF...", 8, TOTAL, 95);
  const uploaded = await cloudApi.uploadExportPdf(orgId, notebookId, "latest", result.pdf);
  return { ...result, lastCompiled: uploaded.lastCompiled };
}
