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
  id: string; // Entry UUID
  title: string;
  author: string;
  phase: string;
  createdAt: string;
  filename: string; // Path to the entry file (e.g. "entries/uuid.json")
  resources?: Record<string, { title: string, type: string }>; // block uuid -> metadata
}

export interface EntryWrapper {
  version: number;
  metadata: EntryMetadata;
  content: any; // TipTap JSON
}

export interface NotebookMetadata {
  version: number;
  entries: Record<string, EntryMetadata>; // uuid -> metadata
  knownAuthors: Record<string, string[]>; // author -> uuids
  knownProjectTitles: Record<string, string[]>; // title -> uuids
}

export const EMPTY_METADATA: NotebookMetadata = { 
  version: 3, 
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

/** Walk every node and extract resources (blocks with IDs and titles). */
export function extractResources(doc: TipTapDoc): Record<string, { title: string, type: string }> {
  const resources: Record<string, { title: string, type: string }> = {};
  
  function walk(node: any) {
    if (!node) return;
    
    // We only care about blocks that have an ID and either a title or a caption (legacy)
    if (node.attrs?.id) {
      const title = node.attrs.title || node.attrs.caption || "";
      if (title) {
        resources[node.attrs.id] = {
          title,
          type: node.type
        };
      }
    }
    
    if (Array.isArray(node.content)) {
      node.content.forEach(walk);
    }
  }
  
  walk(doc);
  return resources;
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
  entryId: string,
  info: EntryMetadata
): NotebookMetadata {
  const newEntries = { ...metadata.entries, [entryId]: info };
  return updateMetadataSuggestions({ ...metadata, entries: newEntries });
}

/** 
 * Update the lists of known authors and project titles in metadata. 
 * Rebuilds the lists based on all current entries.
 */
export function updateMetadataSuggestions(metadata: NotebookMetadata): NotebookMetadata {
  const newAuthors: Record<string, string[]> = {};
  const newTitles: Record<string, string[]> = {};

  for (const [entryId, info] of Object.entries(metadata.entries)) {
    if (info.author?.trim()) {
      const a = info.author.trim();
      if (!newAuthors[a]) newAuthors[a] = [];
      newAuthors[a].push(entryId);
    }
    if (info.title?.trim() && !info.title.endsWith(".tex")) {
      const t = info.title.trim();
      if (!newTitles[t]) newTitles[t] = [];
      newTitles[t].push(entryId);
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
  entryId: string
): NotebookMetadata {
  const newEntries = { ...metadata.entries };
  delete newEntries[entryId];
  return updateMetadataSuggestions({ ...metadata, entries: newEntries });
}

/** Rename an entry in the metadata index. */
export function renameEntryInMetadata(
  metadata: NotebookMetadata,
  oldId: string,
  newId: string
): NotebookMetadata {
  const newEntries = { ...metadata.entries };
  if (newEntries[oldId]) {
    newEntries[newId] = newEntries[oldId];
    delete newEntries[oldId];
  }
  return updateMetadataSuggestions({ ...metadata, entries: newEntries });
}

/** 
 * Migration helper to convert older notebook.json formats to the current UUID-based structure.
 */
export function migrateMetadata(raw: any): NotebookMetadata {
  if (!raw || typeof raw !== "object") return EMPTY_METADATA;

  // Version 2: entries indexed by path
  if (raw.version === 2) {
    const newEntries: Record<string, EntryMetadata> = {};
    for (const [path, info] of Object.entries(raw.entries as Record<string, any>)) {
      const id = info.id || path.split('/').pop()?.replace('.json', '') || "";
      newEntries[id] = {
        ...info,
        id,
        filename: path,
      } as EntryMetadata;
    }
    return updateMetadataSuggestions({
      ...raw,
      version: 3,
      entries: newEntries,
    });
  }

  // Version 1: very old format, unlikely to exist but safe to handle
  if (!raw.version || raw.version === 1) {
    return { ...EMPTY_METADATA, ...raw, version: 3 };
  }

  return raw as NotebookMetadata;
}
