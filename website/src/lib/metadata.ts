import { generateEntryLatex } from "./latex";

/**
 * metadata.ts — resource ↔ entry relationship tracking.
 *
 * metadata.json shape:
 * {
 *   "version": 1,
 *   "resourceRefs": {
 *     "resources/2026-04-28T09-00-00.png": [
 *       "entries/2026-04-28T09-00-00_entry.tex"
 *     ]
 *   }
 * }
 *
 * All operations work on TipTap JSON (the value of the "content" key stored
 * inside the % METADATA: {...} comment at the top of every .tex file).
 * This is more robust than scanning generated LaTeX.
 */

export interface EntryInfo {
  title: string;
  author: string;
  phase: string;
  createdAt: string;
  content?: any;
}

export interface NotebookMetadata {
  version: number;
  resourceRefs: Record<string, string[]>; // resourcePath -> entryPaths[]
  entries: Record<string, EntryInfo>;      // entryPath -> info
  knownAuthors: Record<string, string[]>;
  knownProjectTitles: Record<string, string[]>;
}

export const EMPTY_METADATA: NotebookMetadata = { 
  version: 1, 
  resourceRefs: {}, 
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
      newAttrs.src = newAttrs.filePath || "resources/placeholder.png";
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

// ─── metadata.json helpers ────────────────────────────────────────────────────

/** Parse the METADATA comment from a .tex file and return the TipTap JSON doc, or null. */
export function parseTipTapFromLatex(latexContent: string): TipTapDoc | null {
  const match = latexContent.match(/^% METADATA: (.+)$/m);
  if (!match) return null;
  try {
    const meta = JSON.parse(match[1]);
    if (!meta.content) return null;
    return typeof meta.content === "string" ? JSON.parse(meta.content) : meta.content;
  } catch {
    return null;
  }
}

/** Extract image filePaths from a raw .tex file string. */
export function extractImagePathsFromLatex(latexContent: string): string[] {
  const doc = parseTipTapFromLatex(latexContent);
  if (!doc) return [];
  return extractImagePaths(doc);
}

/** Rebuild the resourceRefs entry for a single entry after it has been saved. */
export function rebuildEntryRefs(
  metadata: NotebookMetadata,
  entryPath: string,
  tiptapDocOrContent: TipTapDoc | string,
  info?: Partial<EntryInfo>
): NotebookMetadata {
  let doc: TipTapDoc = null;
  if (typeof tiptapDocOrContent === "string") {
    try { doc = JSON.parse(tiptapDocOrContent); } catch { doc = null; }
  } else {
    doc = tiptapDocOrContent;
  }
  
  const usedPaths = doc ? extractImagePaths(doc) : [];

  // Remove this entry from all existing refs
  const newRefs: Record<string, string[]> = {};
  for (const [resource, entries] of Object.entries(metadata.resourceRefs)) {
    const filtered = entries.filter((e) => e !== entryPath);
    if (filtered.length > 0) newRefs[resource] = filtered;
  }

  // Add fresh refs
  for (const p of usedPaths) {
    newRefs[p] = [...(newRefs[p] ?? []), entryPath];
  }

  // Update entry info
  const newEntries = { ...metadata.entries };
  if (info) {
    const existing = newEntries[entryPath] ?? { title: "", author: "", phase: "", createdAt: "" };
    newEntries[entryPath] = {
      ...existing,
      ...info,
      // Only set createdAt if it doesn't exist yet (first save) or if explicitly provided
      createdAt: info.createdAt || existing.createdAt || new Date().toISOString(),
    };
  }

  return { ...metadata, resourceRefs: newRefs, entries: newEntries };
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


/**
 * Returns a list of { entryPath, updatedLatex } for every entry that
 * references oldResourcePath, with the path replaced by newResourcePath.
 * Caller is responsible for staging / writing these files.
 */
export function computeRenameUpdates(
  metadata: NotebookMetadata,
  oldResourcePath: string,
  newResourcePath: string,
): { entryPath: string; updatedLatex: string; updatedDoc: TipTapDoc }[] {
  const affected = metadata.resourceRefs[oldResourcePath] ?? [];
  const updates: { entryPath: string; updatedLatex: string; updatedDoc: TipTapDoc }[] = [];

  for (const entryPath of affected) {
    const entryInfo = metadata.entries[entryPath];
    if (!entryInfo || !entryInfo.content) continue;
    
    let doc: TipTapDoc;
    try {
      doc = typeof entryInfo.content === "string" ? JSON.parse(entryInfo.content) : entryInfo.content;
    } catch {
      continue;
    }
    
    const updatedDoc = renameImageInDoc(doc, oldResourcePath, newResourcePath);
    const updatedContent = JSON.stringify(updatedDoc);
    
    const updatedLatex = generateEntryLatex(
      updatedContent,
      entryInfo.title,
      entryInfo.author,
      entryInfo.phase,
      entryInfo.createdAt
    );
    
    updates.push({ entryPath, updatedLatex, updatedDoc });
  }
  return updates;
}

/**
 * Returns a list of { entryPath, updatedLatex } for every entry that
 * references deletedResourcePath, with the image node removed.
 */
export function computeDeleteUpdates(
  metadata: NotebookMetadata,
  deletedResourcePath: string,
): { entryPath: string; updatedLatex: string; updatedDoc: TipTapDoc }[] {
  const affected = metadata.resourceRefs[deletedResourcePath] ?? [];
  const updates: { entryPath: string; updatedLatex: string; updatedDoc: TipTapDoc }[] = [];

  for (const entryPath of affected) {
    const entryInfo = metadata.entries[entryPath];
    if (!entryInfo || !entryInfo.content) continue;
    
    let doc: TipTapDoc;
    try {
      doc = typeof entryInfo.content === "string" ? JSON.parse(entryInfo.content) : entryInfo.content;
    } catch {
      continue;
    }
    
    const updatedDoc = removeImageFromDoc(doc, deletedResourcePath);
    const updatedContent = JSON.stringify(updatedDoc);
    
    const updatedLatex = generateEntryLatex(
      updatedContent,
      entryInfo.title,
      entryInfo.author,
      entryInfo.phase,
      entryInfo.createdAt
    );
    
    updates.push({ entryPath, updatedLatex, updatedDoc });
  }
  return updates;
}

/** Remove a resource from the metadata index entirely. */
export function removeResourceFromMetadata(
  metadata: NotebookMetadata,
  resourcePath: string
): NotebookMetadata {
  const newRefs = { ...metadata.resourceRefs };
  delete newRefs[resourcePath];
  return { ...metadata, resourceRefs: newRefs };
}

/** Rename a resource in the metadata index. */
export function renameResourceInMetadata(
  metadata: NotebookMetadata,
  oldPath: string,
  newPath: string
): NotebookMetadata {
  const newRefs = { ...metadata.resourceRefs };
  if (newRefs[oldPath]) {
    newRefs[newPath] = newRefs[oldPath];
    delete newRefs[oldPath];
  }
  return { ...metadata, resourceRefs: newRefs };
}

/** Remove an entry from the metadata index. */
export function removeEntryFromMetadata(
  metadata: NotebookMetadata,
  entryPath: string
): NotebookMetadata {
  const newEntries = { ...metadata.entries };
  delete newEntries[entryPath];

  // Also remove from all resourceRefs
  const newRefs: Record<string, string[]> = {};
  for (const [res, entries] of Object.entries(metadata.resourceRefs)) {
    const filtered = entries.filter(e => e !== entryPath);
    if (filtered.length > 0) newRefs[res] = filtered;
  }

  return { ...metadata, entries: newEntries, resourceRefs: newRefs };
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

  // Also update resourceRefs
  const newRefs: Record<string, string[]> = {};
  for (const [res, entries] of Object.entries(metadata.resourceRefs)) {
    newRefs[res] = entries.map(e => e === oldPath ? newPath : e);
  }

  return { ...metadata, entries: newEntries, resourceRefs: newRefs };
}
