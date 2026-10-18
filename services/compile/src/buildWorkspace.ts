import fs from "node:fs";
import path from "node:path";
import type { CompileSnapshot } from "./coreClient.js";
import {
  generateAllEntriesLatex,
  generateEntryLatex,
  generatePhasesLatex,
  generateTeamLatex,
  latexPhaseRef,
} from "./latex.js";
import {
  sortedForCompile,
  type EntryMetadata,
  type ProjectPhase,
  type TeamMetadata,
  type TipTapNode,
} from "./types.js";

const ASSETS_DIR = "data/assets";

function extFromContentType(ct?: string | null): string {
  const c = (ct || "").toLowerCase();
  if (c.includes("png")) return ".png";
  if (c.includes("webp")) return ".webp";
  if (c.includes("gif")) return ".gif";
  if (c.includes("pdf")) return ".pdf";
  return ".jpg";
}

function cloudAssetPath(assetId: string, contentType?: string | null): string {
  if (/\.(jpe?g|png|gif|webp|pdf)$/i.test(assetId)) return `${ASSETS_DIR}/${assetId}`;
  return `${ASSETS_DIR}/${assetId}${extFromContentType(contentType)}`;
}

function bareAssetId(ref: string): string | null {
  if (!ref) return null;
  if (ref.startsWith("cloud:")) return ref.slice("cloud:".length) || null;
  if (ref.startsWith(`${ASSETS_DIR}/`)) {
    const rest = ref
      .slice(`${ASSETS_DIR}/`.length)
      .replace(/^(compressed|original)\//, "");
    return rest.replace(/\.(jpe?g|png|gif|webp|pdf)$/i, "") || null;
  }
  if (/^[0-9a-f-]{36}$/i.test(ref)) return ref;
  return null;
}

function walkRemapAssets(
  node: TipTapNode,
  pathForId: (id: string) => string | undefined
): TipTapNode {
  if (node.type === "image") {
    const attrs = { ...(node.attrs || {}) };
    const fp = String(attrs.filePath || "");
    const id = String(attrs.id || "");
    const assetId = bareAssetId(fp) || bareAssetId(id);
    if (assetId) {
      const p = pathForId(assetId);
      if (p) {
        attrs.filePath = p;
        attrs.originalFilePath = p;
        attrs.id = assetId;
      }
    }
    return { ...node, attrs };
  }
  return {
    ...node,
    content: node.content?.map((c) => walkRemapAssets(c, pathForId)),
  };
}

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

export function buildWorkspace(opts: {
  workDir: string;
  templateDir: string;
  snapshot: CompileSnapshot;
}): { mainTex: string } {
  const { workDir, templateDir, snapshot } = opts;
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });

  // Template: main.tex, notebook.sty, fonts/
  for (const name of ["main.tex", "notebook.sty"]) {
    const src = path.join(templateDir, name);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(workDir, name));
  }
  const fontsSrc = path.join(templateDir, "fonts");
  if (fs.existsSync(fontsSrc)) copyDir(fontsSrc, path.join(workDir, "fonts"));

  fs.mkdirSync(path.join(workDir, "latex", "entries"), { recursive: true });
  fs.mkdirSync(path.join(workDir, ASSETS_DIR), { recursive: true });

  const pathByAsset = new Map<string, string>();
  for (const [assetId, blob] of Object.entries(snapshot.assets || {})) {
    const vfsPath = cloudAssetPath(assetId, blob.contentType);
    const abs = path.join(workDir, vfsPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, Buffer.from(blob.base64, "base64"));
    pathByAsset.set(assetId, vfsPath);
  }
  const pathForId = (id: string) => pathByAsset.get(id);

  const phases: Record<string, ProjectPhase> = {};
  for (const [id, p] of Object.entries(snapshot.notebook.phases || {})) {
    phases[id] = {
      name: p.name || id,
      description: p.description || "",
      iconName: p.iconName || "Circle",
      color: p.color || "#888888",
      order: p.order ?? 0,
    };
  }

  const team: TeamMetadata = {
    teamName: snapshot.notebook.title || snapshot.notebook.name || "",
    teamNumber: snapshot.notebook.subtitle || "",
    organization: "",
    members: Object.fromEntries(
      snapshot.members.map((m) => [
        m.id,
        {
          name: m.name,
          role: m.role || "Member",
          order: m.order ?? 0,
          ...(m.imageAssetId && pathByAsset.has(m.imageAssetId)
            ? { image: pathForId(m.imageAssetId)! }
            : {}),
        },
      ])
    ),
    ...(snapshot.notebook.logoAssetId && pathByAsset.has(snapshot.notebook.logoAssetId)
      ? { logo: pathForId(snapshot.notebook.logoAssetId)! }
      : {}),
  };

  const entryMeta: Record<string, EntryMetadata> = {};
  for (const [id, e] of Object.entries(snapshot.entries)) {
    entryMeta[id] = {
      title: e.title || "Untitled",
      authors: e.authors || [],
      phase: e.phase ?? null,
      createdAt: e.createdAt || "",
      updatedAt: e.updatedAt || "",
      date: e.date || "",
      filename: id,
      order: e.order ?? 0,
      isTemplate: e.isTemplate,
      deletedAt: e.deletedAt,
      assets: (e.assetIds || [])
        .map((aid) => pathForId(aid))
        .filter((p): p is string => Boolean(p)),
    };
  }

  // Prelude: cloud assets are compressed JPEG — prefer the non-quality branch in notebook.sty
  const prelude = "\\newif\\ifnotebookqualityimages\\notebookqualityimagesfalse\n";
  const mainSrc = fs.readFileSync(path.join(workDir, "main.tex"), "utf8");
  fs.writeFileSync(path.join(workDir, "main.tex"), `${prelude}${mainSrc}`);

  fs.writeFileSync(path.join(workDir, "latex", "team.tex"), generateTeamLatex(team));
  fs.writeFileSync(path.join(workDir, "latex", "phases.tex"), generatePhasesLatex(phases));

  const compileEntries = sortedForCompile(entryMeta);
  const indexBody = compileEntries
    .map((e) => `\\input{latex/entries/${e.id}.tex}`)
    .join("\n") + "\n";
  // Keep generateAllEntriesLatex available for parity; we write date-sorted index explicitly.
  void generateAllEntriesLatex;
  fs.writeFileSync(path.join(workDir, "latex", "entries.tex"), indexBody);

  for (const e of compileEntries) {
    const raw = snapshot.entries[e.id]?.tipTap ?? { type: "doc", content: [] };
    const doc = walkRemapAssets(raw as TipTapNode, pathForId);
    const latex = generateEntryLatex(
      doc,
      e.title || "Untitled",
      e.authors || [],
      latexPhaseRef(e.phase, phases),
      e.createdAt,
      e.id,
      undefined,
      e.date
    );
    fs.writeFileSync(path.join(workDir, "latex", "entries", `${e.id}.tex`), latex);
  }

  return { mainTex: path.join(workDir, "main.tex") };
}
