import { generateUUID } from "./utils";
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
}

export const EMPTY_METADATA: NotebookMetadata = { 
  version: 3, 
  entries: {},
};

// ─── TipTap JSON helpers ──────────────────────────────────────────────────────
// ... (omitting unchanged TipTap helpers for brevity in thought, but tool will replace the block)

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
    
    // Include any node that has a UUID id
    if (node.attrs?.id) {
      const title = node.attrs.title || node.attrs.caption || "";

      resources[node.attrs.id] = {
        title,
        type: node.type
      };
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
  return {
    ...metadata,
    entries: { ...metadata.entries, [entryId]: info }
  };
}

/** Remove an entry from the metadata index. */
export function removeEntryFromMetadata(
  metadata: NotebookMetadata,
  entryId: string
): NotebookMetadata {
  const newEntries = { ...metadata.entries };
  delete newEntries[entryId];
  return { ...metadata, entries: newEntries };
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
  return { ...metadata, entries: newEntries };
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
    return {
      version: 3,
      entries: newEntries,
    };
  }

  // Version 1: very old format, unlikely to exist but safe to handle
  if (!raw.version || raw.version === 1) {
    return { ...EMPTY_METADATA, ...raw, version: 3 };
  }

  return raw as NotebookMetadata;
}

/**
 * Recursively walks a TipTap document and generates new UUIDs for all nodes with an 'id' attribute.
 * Also updates any internal links (#uuid) that point to the newly remapped IDs.
 */
export function remapContentIds(doc: any): any {
  if (!doc) return doc;

  const idMap = new Map<string, string>();
  const resourceTypes = new Set(["image", "table", "codeBlock", "rawLatex"]);

  // Pass 1: Collect and remap IDs
  function collect(node: any) {
    if (!node || typeof node !== "object") return;
    
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }

    if (node.attrs?.id) {
      const newId = generateUUID();
      idMap.set(node.attrs.id, newId);
    } else if (resourceTypes.has(node.type)) {
      // If it's a resource type but has no ID, we'll give it one in Pass 2
      // We don't need to add it to the map because nothing can be linking to it yet
    }
    
    if (Array.isArray(node.content)) {
      node.content.forEach(collect);
    }
  }
  collect(doc);

  // Pass 2: Apply remapping
  function apply(node: any): any {
    if (!node || typeof node !== "object") return node;

    if (Array.isArray(node)) {
      return node.map(apply);
    }

    const newNode = { ...node };

    // Update ID attribute
    if (resourceTypes.has(node.type)) {
      const oldId = node.attrs?.id;
      if (oldId && idMap.has(oldId)) {
        newNode.attrs = { ...node.attrs, id: idMap.get(oldId) };
      } else if (!oldId) {
        // Assign fresh ID if missing
        newNode.attrs = { ...node.attrs, id: generateUUID() };
      }
    }

    // Update marks (for links)
    if (Array.isArray(node.marks)) {
      newNode.marks = node.marks.map((mark: any) => {
        if (mark.type === 'link') {
          const href = mark.attrs?.href || "";
          const resourceId = mark.attrs?.resourceId;

          if (href.startsWith('#')) {
            const oldId = href.substring(1);
            if (idMap.has(oldId)) {
              return { 
                ...mark, 
                attrs: { 
                  ...mark.attrs, 
                  href: `#${idMap.get(oldId)}`,
                  resourceId: idMap.get(oldId) 
                } 
              };
            }
          } else if (resourceId && idMap.has(resourceId)) {
            return { 
              ...mark, 
              attrs: { 
                ...mark.attrs, 
                resourceId: idMap.get(resourceId) 
              } 
            };
          }
        }
        return mark;
      });
    }

    // Recurse content
    if (Array.isArray(node.content)) {
      newNode.content = node.content.map(apply);
    }

    return newNode;
  }

  return apply(doc);
}
