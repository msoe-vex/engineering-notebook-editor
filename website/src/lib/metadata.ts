import { ASSETS_DIR } from "./constants";
import { generateUUID } from "./utils";

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
  updatedAt: string;
  filename: string; // Path to the entry file (e.g. "entries/uuid.json")
  resources?: Record<string, { title: string, caption: string, type: string }>; // block uuid -> metadata
  isValid?: boolean;
  references?: string[]; // List of target UUIDs this entry points to
  validationErrors?: string[]; // Detailed messages for the UI
}

export interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: TipTapMark[];
  text?: string;
}

export interface EntryWrapper {
  version: number;
  metadata: EntryMetadata;
  content: TipTapNode; // TipTap JSON
}

export interface NotebookMetadata {
  version: number;
  projectId?: string;
  projectName?: string;
  entries: Record<string, EntryMetadata>; // uuid -> metadata
}

export const EMPTY_METADATA: NotebookMetadata = { 
  version: 3, 
  entries: {},
};

// ─── TipTap JSON helpers ──────────────────────────────────────────────────────
// ... (omitting unchanged TipTap helpers for brevity in thought, but tool will replace the block)

type TipTapDoc = TipTapNode;

/** Walk every node in a ProseMirror doc and collect image filePaths. */
export function extractImagePaths(doc: TipTapDoc): string[] {
  const paths: string[] = [];
  function walk(node: TipTapNode | undefined) {
    if (!node) return;
    if (node.type === "image" && node.attrs?.filePath) {
      paths.push(node.attrs.filePath as string);
    }
    (node.content ?? []).forEach(walk);
  }
  walk(doc);
  return paths;
}

/** Walk every node and extract resources (blocks with IDs and titles). */
export function extractResources(doc: TipTapDoc): Record<string, { title: string, caption: string, type: string }> {
  const resources: Record<string, { title: string, caption: string, type: string }> = {};
  
  function walk(node: TipTapNode | undefined) {
    if (!node) return;
    
    // Include any node that has a UUID id
    if (node.attrs?.id) {
      const title = (node.attrs.title as string) || "";
      const caption = (node.attrs.caption as string) || "";

      resources[node.attrs.id as string] = {
        title,
        caption,
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

/** Walk every node and extract internal references (link resourceIds and #uuid fragments). */
export function extractReferences(doc: TipTapDoc): string[] {
  const refs = new Set<string>();

  function walk(node: TipTapNode | undefined) {
    if (!node) return;

    // Check marks for links
    if (Array.isArray(node.marks)) {
      for (const mark of node.marks) {
        if (mark.type === "link") {
          const { href, resourceId } = (mark.attrs || {}) as { href?: string, resourceId?: string };
          if (resourceId) {
            refs.add(resourceId);
          } else if (href?.startsWith("#")) {
            refs.add(href.substring(1));
          }
        }
      }
    }

    if (Array.isArray(node.content)) {
      node.content.forEach(walk);
    }
  }

  walk(doc);
  return Array.from(refs);
}

/**
 * Strips large binary data (base64) from image nodes in TipTap JSON.
 * Replaces 'src' data URLs with 'filePath' or a placeholder to keep metadata small.
 */
export function dehydrateTipTapJson(json: TipTapNode): TipTapNode {
  if (!json || typeof json !== "object") return json;

  if (json.type === "image") {
    const newAttrs = { ...(json.attrs || {}) } as Record<string, string | undefined>;
    // If we have a filePath, we don't need the base64 src in metadata
    if (newAttrs.src?.startsWith("data:")) {
      newAttrs.src = newAttrs.filePath || `${ASSETS_DIR}/placeholder.png`;
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
  function walk(node: TipTapNode): TipTapNode {
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
  function walk(node: TipTapNode): TipTapNode | null {
    if (!node) return node;
    if (node.type === "image" && node.attrs?.filePath === deletedPath) {
      return null; // Mark for removal
    }
    if (node.content) {
      const filtered = node.content.map(walk).filter((n): n is TipTapNode => n !== null);
      return { ...node, content: filtered };
    }
    return node;
  }
  const result = walk(doc);
  return result || doc;
}

/**
 * Replaces Base64 data URLs with hashed asset paths.
 * Returns { cleanDoc, newAssets }.
 * newAssets is a list of { path, base64 } to be saved.
 */
export async function dehydrateAssets(doc: TipTapDoc): Promise<{ cleanDoc: TipTapDoc; newAssets: { path: string; base64: string }[] }> {
  const { hashContent, getExtensionFromDataUrl } = await import("./utils");
  const assets: { path: string; base64: string }[] = [];

  async function walk(node: TipTapNode): Promise<TipTapNode> {
    if (!node) return node;
    if (node.type === "image") {
      const attrs = (node.attrs || {}) as Record<string, string | undefined>;
      if (attrs.src?.startsWith("data:")) {
        const base64 = attrs.src.split(",")[1];
        const hash = await hashContent(base64);
        const ext = getExtensionFromDataUrl(attrs.src);
        const assetPath = `${ASSETS_DIR}/${hash}.${ext}`;

        assets.push({ path: assetPath, base64 });
        return { ...node, attrs: { ...node.attrs, src: assetPath, filePath: assetPath } };
      }
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
export function hydrateAssets(doc: TipTapDoc, assetCache: Map<string, string>): TipTapDoc {
  function walk(node: TipTapNode): TipTapNode {
    if (!node) return node;
    if (node.type === "image") {
      const attrs = (node.attrs || {}) as Record<string, string | undefined>;
      if (attrs.src?.startsWith(`${ASSETS_DIR}/`)) {
        const dataUrl = assetCache.get(attrs.src);
        if (dataUrl) {
          return { ...node, attrs: { ...node.attrs, src: dataUrl } };
        }
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
  const next = {
    ...metadata,
    entries: { 
      ...metadata.entries, 
      [entryId]: info
    }
  };

  // Run global integrity check to update isValid/validationErrors for all affected entries
  return validateNotebookIntegrity(next);
}

/** 
 * Scans the entire notebook metadata and evaluates the integrity of every entry.
 * Checks for missing required fields, empty resource metadata, and dead internal links.
 */
export function validateNotebookIntegrity(metadata: NotebookMetadata): NotebookMetadata {
  const newEntries = { ...metadata.entries };
  
  // 1. Build a global set of all existing IDs (entries and resources)
  const existingIds = new Set<string>();
  for (const entry of Object.values(metadata.entries)) {
    existingIds.add(entry.id);
    if (entry.resources) {
      for (const resId of Object.keys(entry.resources)) {
        existingIds.add(resId);
      }
    }
  }

  // 2. Validate each entry
  for (const [id, entry] of Object.entries(newEntries)) {
    const errors: string[] = [];

    // Check basic metadata
    if (!entry.title?.trim()) errors.push("Missing title");
    if (!entry.author?.trim()) errors.push("Missing author");
    if (!entry.phase?.trim()) errors.push("Missing phase");

    // Check local resources
    if (entry.resources) {
      for (const [resId, res] of Object.entries(entry.resources)) {
        if (!res.title?.trim()) errors.push(`Resource "${resId}" missing title`);
        if (!res.caption?.trim()) errors.push(`Resource "${resId}" missing caption`);
      }
    }

    // Check internal references
    if (entry.references) {
      for (const refId of entry.references) {
        if (!existingIds.has(refId)) {
          errors.push(`Broken reference to "${refId}"`);
        }
      }
    }

    newEntries[id] = {
      ...entry,
      isValid: errors.length === 0,
      validationErrors: errors
    };
  }

  return {
    ...metadata,
    entries: newEntries
  };
}

/** Check if an entry has all required metadata fields. */
export function isEntryValid(info: EntryMetadata): boolean {
  if (!info.title?.trim()) return false;
  if (!info.author?.trim()) return false;
  if (!info.phase?.trim()) return false;
  
  if (info.resources) {
    for (const res of Object.values(info.resources)) {
      if (!res.title?.trim() || !res.caption?.trim()) return false;
    }
  }
  
  return true;
}

/** Remove an entry from the metadata index. */
export function removeEntryFromMetadata(
  metadata: NotebookMetadata,
  entryId: string
): NotebookMetadata {
  const newEntries = { ...metadata.entries };
  delete newEntries[entryId];
  
  const next = { ...metadata, entries: newEntries };
  return validateNotebookIntegrity(next);
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
  
  const next = { ...metadata, entries: newEntries };
  return validateNotebookIntegrity(next);
}

/**
 * Recursively walks a TipTap document and generates new UUIDs for all nodes with an 'id' attribute.
 * Also updates any internal links (#uuid) that point to the newly remapped IDs.
 */
export function remapContentIds(doc: TipTapDoc): TipTapDoc {
  if (!doc) return doc;

  const idMap = new Map<string, string>();
  const resourceTypes = new Set(["image", "table", "codeBlock", "rawLatex"]);

  // Pass 1: Collect and remap IDs
  function collect(node: TipTapNode | TipTapNode[]) {
    if (!node || typeof node !== "object") return;
    
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }

    if (node.attrs?.id) {
      const newId = generateUUID();
      idMap.set(node.attrs.id as string, newId);
    }
    
    if (Array.isArray(node.content)) {
      node.content.forEach(collect);
    }
  }
  collect(doc);

  // Pass 2: Apply remapping
  function apply(node: TipTapNode | TipTapNode[]): TipTapNode | TipTapNode[] {
    if (!node || typeof node !== "object") return node;

    if (Array.isArray(node)) {
      return node.map((n) => apply(n) as TipTapNode);
    }

    const newNode = { ...node };

    // Update ID attribute
    if (resourceTypes.has(node.type)) {
      const oldId = node.attrs?.id as string | undefined;
      if (oldId && idMap.has(oldId)) {
        newNode.attrs = { ...node.attrs, id: idMap.get(oldId) };
      } else if (!oldId) {
        // Assign fresh ID if missing
        newNode.attrs = { ...node.attrs, id: generateUUID() };
      }
    }

    // Update marks (for links)
    if (Array.isArray(node.marks)) {
      newNode.marks = node.marks.map((mark: TipTapMark) => {
        if (mark.type === 'link') {
          const { href = "", resourceId } = (mark.attrs || {}) as { href?: string, resourceId?: string };

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
      newNode.content = node.content.map((n) => apply(n) as TipTapNode);
    }

    return newNode;
  }

  return apply(doc) as TipTapNode;
}


