import { generateEntryLatex } from "./latex";

/**
 * metadata.ts — resource ↔ entry relationship tracking.
 *
 * metadata.json shape:
 * {
 *   "version": 1,
 *   "resourceRefs": {
 *     "assets/2026-04-28T09-00-00.png": [
 *       "entries/2026-04-28T09-00-00.json"
 *     ]
 *   }
 * }
 *
 * All operations work on TipTap JSON (the value of the "content" key stored
 * inside the % METADATA: {...} comment at the top of every .tex file).
 * This is more robust than scanning generated LaTeX.
 */

export interface EntryMetadata {
  id: string;
  title: string;
  author: string;
  phase: string;
  createdAt: string;
}

export interface EntryWrapper {
  version: number;
  metadata: EntryMetadata;
  content: any; // TipTap JSON
}

export interface NotebookMetadata {
  version: number;
  entries: Record<string, EntryMetadata>; // entryPath -> metadata (e.g. "entries/uuid.json")
  knownAuthors: Record<string, string[]>;
  knownProjectTitles: Record<string, string[]>;
}

export const EMPTY_METADATA: NotebookMetadata = { 
  version: 2, 
  entries: {},
  knownAuthors: {},
  knownProjectTitles: {}
};

// ─── TipTap JSON helpers ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TipTapDoc = any;

/** Walk every node in a ProseMirror doc and collect image filePaths. */
export function extractImagePaths(doc: TipTapDoc): string[] {
  const paths: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function walk(node: any) {
    if (!node) return;
    if (node.type === "image" && node.attrs?.filePath) {
      paths.push(node.attrs.filePath);
    }
    (node.content ?? []).forEach(walk);
  }
  walk(doc);
  return paths;
}

/**
 * Strips large binary data (base64) from image nodes in TipTap JSON.
 * Replaces 'src' data URLs with 'filePath' or a placeholder to keep metadata small.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dehydrateTipTapJson(json: any): any {
  if (!json || typeof json !== "object") return json;

  if (json.type === "image") {
    const newAttrs = { ...json.attrs };
    // If we have a filePath, we don't need the base64 src in metadata
    if (newAttrs.src?.startsWith("data:")) {
      newAttrs.src = newAttrs.filePath || "assets/placeholder.png";
    }
    return { ...json, attrs: newAttrs };
  }

  if (Array.isArray(json.content)) {
    return { ...json, content: json.content.map(dehydrateTipTapJson) };
  }

  return json;
}

/**
 * Replace any image node whose filePath === oldPath with newPath.
 * Returns a new doc (deep clone with modifications).
 */
export function renameImageInDoc(
  doc: TipTapDoc,
  oldPath: string,
  newPath: string
): TipTapDoc {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function walk(node: any): any {
    if (!node) return node;
    if (node.type === "image" && node.attrs?.filePath === oldPath) {
      return { ...node, attrs: { ...node.attrs, filePath: newPath } };
    }
    if (node.content) {
      return { ...node, content: node.content.map(walk) };
    }
    return node;
  }
  return walk(doc);
}

/**
 * Remove any image node whose filePath === deletedPath.
 * Returns a new doc.
 */
export function removeImageFromDoc(doc: TipTapDoc, deletedPath: string): TipTapDoc {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function walk(node: any): any | null {
    if (!node) return node;
    if (node.type === "image" && node.attrs?.filePath === deletedPath) {
      return null; // Mark for removal
    }
    if (node.content) {
      const filtered = node.content.map(walk).filter(Boolean);
      return { ...node, content: filtered };
    }
    return node;
  }
  return walk(doc);
}

/**
 * Replaces Base64 data URLs with hashed asset paths.
 * Returns { cleanDoc, newAssets }.
 * newAssets is a list of { path, base64 } to be saved.
 */
export async function dehydrateAssets(doc: any): Promise<{ cleanDoc: any; newAssets: { path: string; base64: string }[] }> {
  const { hashContent, getExtensionFromDataUrl } = await import("./utils");
  const assets: { path: string; base64: string }[] = [];

  async function walk(node: any): Promise<any> {
    if (!node) return node;
    if (node.type === "image" && node.attrs?.src?.startsWith("data:")) {
      const base64 = node.attrs.src.split(",")[1];
      const hash = await hashContent(base64);
      const ext = getExtensionFromDataUrl(node.attrs.src);
      const assetPath = `assets/${hash}.${ext}`;
      
      assets.push({ path: assetPath, base64 });
      return { ...node, attrs: { ...node.attrs, src: assetPath, filePath: assetPath } };
    }
    if (node.content) {
      const newContent = await Promise.all(node.content.map(walk));
      return { ...node, content: newContent };
    }
    return node;
  }

  const cleanDoc = await walk(doc);
  return { cleanDoc, newAssets: assets };
}

/**
 * Replaces asset paths with data URLs from the provided cache.
 */
export function hydrateAssets(doc: any, assetCache: Map<string, string>): any {
  function walk(node: any): any {
    if (!node) return node;
    if (node.type === "image" && node.attrs?.src?.startsWith("assets/")) {
      const dataUrl = assetCache.get(node.attrs.src);
      if (dataUrl) {
        return { ...node, attrs: { ...node.attrs, src: dataUrl } };
      }
    }
    if (node.content) {
      return { ...node, content: node.content.map(walk) };
    }
    return node;
  }
  return walk(doc);
}

// ─── notebook.json helpers ────────────────────────────────────────────────────

/** Rebuild the index for a single entry. */
export function updateEntryInIndex(
  metadata: NotebookMetadata,
  entryPath: string,
  info: EntryMetadata
): NotebookMetadata {
  const newEntries = { ...metadata.entries, [entryPath]: info };
  return updateMetadataSuggestions({ ...metadata, entries: newEntries });
}

/** 
 * Update the lists of known authors and project titles in metadata. 
 * Rebuilds the lists based on all current entries.
 */
export function updateMetadataSuggestions(metadata: NotebookMetadata): NotebookMetadata {
  const newAuthors: Record<string, string[]> = {};
  const newTitles: Record<string, string[]> = {};

  for (const [entryPath, info] of Object.entries(metadata.entries)) {
    if (info.author?.trim()) {
      const a = info.author.trim();
      if (!newAuthors[a]) newAuthors[a] = [];
      newAuthors[a].push(entryPath);
    }
    if (info.title?.trim() && !info.title.endsWith(".tex")) {
      const t = info.title.trim();
      if (!newTitles[t]) newTitles[t] = [];
      newTitles[t].push(entryPath);
    }
  }

  return {
    ...metadata,
    knownAuthors: newAuthors,
    knownProjectTitles: newTitles,
  };
}

/** Remove an entry from the metadata index. */
export function removeEntryFromMetadata(
  metadata: NotebookMetadata,
  entryPath: string
): NotebookMetadata {
  const newEntries = { ...metadata.entries };
  delete newEntries[entryPath];
  return updateMetadataSuggestions({ ...metadata, entries: newEntries });
}

/** Rename an entry in the metadata index. */
export function renameEntryInMetadata(
  metadata: NotebookMetadata,
  oldPath: string,
  newPath: string
): NotebookMetadata {
  const newEntries = { ...metadata.entries };
  if (newEntries[oldPath]) {
    newEntries[newPath] = newEntries[oldPath];
    delete newEntries[oldPath];
  }
  return updateMetadataSuggestions({ ...metadata, entries: newEntries });
}
