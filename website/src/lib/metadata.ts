import { ASSETS_DIR, ASSETS_COMPRESSED_DIR, ASSETS_ORIGINAL_DIR, TYPE_LABELS } from "./constants";
import { generateUUID } from "./utils";

export const getLocalDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * metadata.ts — resource ↔ entry relationship tracking.
 *
 * Notebook index (data/notebook.json) shape (high level):
 * {
 *   "version": 3,
 *   "entries": { "<entryId>": { <EntryMetadata> } },
 *   "team": { <TeamMetadata> },
 *   "phases": [ <ProjectPhase[]> ],
 *   "assetRefs": { "<assetPath>": ["entries/<id>.json" ] },
 *   "lastCompiled": "2026-05-22T..."
 * }
 *
 * This module operates primarily on TipTap JSON (the `content` stored
 * inside the `% METADATA: {...}` comment at the top of each entry .tex
 * file) and on the NotebookMetadata index. Use `dehydrateAssets` /
 * `hydrateAssets` to map between data-URLs and hashed asset paths.
 *
 * Shared UI labels for resource node types are defined in
 * `src/lib/constants.ts` as `TYPE_LABELS`.
 */

export interface EntryMetadata {
  id: string; // Entry UUID
  title: string;
  author: string;
  phase: number | null; // Phase ID
  createdAt: string;
  updatedAt: string;
  date: string; // YYYY-MM-DD
  filename: string; // Path to the entry file (e.g. "entries/uuid.json")
  isTemplate?: boolean; // When true, excluded from LaTeX entries.tex compilation and export
  resources?: Record<string, { title: string, caption: string, type: string }>; // block uuid -> metadata
  isValid?: boolean;
  references?: string[]; // List of target UUIDs this entry points to
  assets?: string[]; // List of asset paths used in this entry
  validationErrors?: string[]; // Detailed messages for the UI
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  image?: string; // Path to asset
  imageOriginal?: string; // Path to original asset
}

export interface TeamMetadata {
  teamName: string;
  teamNumber: string;
  startDate?: string;
  endDate?: string;
  organization: string;
  logo?: string; // Path to asset
  logoOriginal?: string; // Path to original asset
  members: TeamMember[];
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

export interface ProjectPhase {
  id: string;
  index: number;
  name: string;
  description: string;
  iconName: string; // Lucide icon name
  color: string;    // Hex color
}

export interface NotebookMetadata {
  version: number;
  entries: Record<string, EntryMetadata>; // uuid -> metadata
  team?: TeamMetadata;
  phases?: ProjectPhase[];
  assetRefs?: Record<string, string[]>; // asset path -> [entry id or "team"]
  lastCompiled?: string; // ISO string
}

/**
 * Builds a notebook-wide resource type index for LaTeX generation.
 * Includes all entries, all stored resources, and optional local unsaved resources.
 */
export function buildResourceTypeIndex(
  entries: Record<string, EntryMetadata>,
  localResources: Record<string, { type: string }> = {},
  currentEntryId?: string
): Record<string, string> {
  const resourceTypes: Record<string, string> = {};

  for (const [entryId, entry] of Object.entries(entries || {})) {
    resourceTypes[entryId] = "entry";

    if (entry.resources) {
      for (const [resourceId, resource] of Object.entries(entry.resources)) {
        resourceTypes[resourceId] = resource.type;
      }
    }
  }

  if (currentEntryId) {
    resourceTypes[currentEntryId] = "entry";
  }

  for (const [resourceId, resource] of Object.entries(localResources || {})) {
    resourceTypes[resourceId] = resource.type;
  }

  return resourceTypes;
}

export const DEFAULT_PHASES: ProjectPhase[] = [];

export const EMPTY_METADATA: NotebookMetadata = {
  version: 3,
  entries: {},
  phases: DEFAULT_PHASES,
  team: {
    teamName: "",
    teamNumber: "",
    startDate: "",
    endDate: "",
    organization: "",
    members: []
  }
};

// ─── TipTap JSON helpers ──────────────────────────────────────────────────────
// ... (omitting unchanged TipTap helpers for brevity in thought, but tool will replace the block)

type TipTapDoc = TipTapNode;

/** Walk every node in a ProseMirror doc and collect image filePaths. */
export function extractImagePaths(doc: TipTapDoc): string[] {
  const paths: string[] = [];
  function walk(node: TipTapNode | undefined) {
    if (!node) return;
    if (node.type === "image") {
      const compressedPath = (node.attrs?.filePath as string) || (node.attrs?.src as string);
      const originalPath = node.attrs?.originalFilePath as string | undefined;
      if (compressedPath && compressedPath.startsWith(`${ASSETS_DIR}/`)) {
        paths.push(compressedPath);
      }
      if (originalPath && originalPath.startsWith(`${ASSETS_DIR}/`) && originalPath !== compressedPath) {
        paths.push(originalPath);
      }
    }
    (node.content ?? []).forEach(walk);
  }
  walk(doc);
  return paths;
}

/** Walk every node and extract resources (blocks with IDs and titles), including headers. */
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

    // Include headings as resources with their own IDs
    if (node.type === "heading" && node.attrs?.id) {
      const id = node.attrs.id as string;
      // Extract heading text from content
      const headingText = (node.content || [])
        .map(child => child.text || "")
        .join("")
        .trim() || "Untitled Header";
      resources[id] = {
        title: headingText,
        caption: headingText,
        type: "heading"
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
export async function dehydrateAssets(
  doc: TipTapDoc,
  knownAssetPaths: string[] = []
): Promise<{ cleanDoc: TipTapDoc; newAssets: { path: string; base64: string }[] }> {
  const { hashContent, getExtensionFromDataUrl } = await import("./utils");
  const assets: { path: string; base64: string }[] = [];
  const knownPaths = new Set(knownAssetPaths);

  async function walk(node: TipTapNode): Promise<TipTapNode> {
    if (!node) return node;
    if (node.type === "image") {
      const attrs = (node.attrs || {}) as Record<string, string | undefined>;
      const compressedSrc = attrs.src;
      const originalSrc = attrs.originalSrc;
      const compressedBase64 = compressedSrc?.startsWith("data:") ? compressedSrc.split(",")[1]?.trim() : undefined;
      const originalBase64 = originalSrc?.startsWith("data:") ? originalSrc.split(",")[1]?.trim() : undefined;

      if (compressedBase64 || originalBase64) {
        const compressedHash = compressedBase64 ? await hashContent(compressedBase64) : undefined;
        const originalHash = originalBase64 ? await hashContent(originalBase64) : undefined;
        const defaultCompressedPath = compressedHash ? `${ASSETS_COMPRESSED_DIR}/${compressedHash}.jpg` : undefined;
        const compressedPath = attrs.filePath || defaultCompressedPath;
        const originalExt = originalSrc ? getExtensionFromDataUrl(originalSrc) : "jpg";
        const defaultOriginalPath = originalHash ? `${ASSETS_ORIGINAL_DIR}/${originalHash}.${originalExt}` : compressedPath;
        const originalPath = attrs.originalFilePath || defaultOriginalPath;

        // Only skip when this entry already knows the asset path and the content hash matches.
        const compressedUnchanged = !!(compressedBase64 && compressedHash && compressedPath && knownPaths.has(compressedPath) && compressedPath.includes(compressedHash));
        const originalUnchanged = !!(originalBase64 && originalHash && originalPath && knownPaths.has(originalPath) && originalPath.includes(originalHash));

        if (originalBase64 && originalPath && !originalUnchanged) assets.push({ path: originalPath, base64: originalBase64 });
        if (compressedBase64 && compressedPath && !compressedUnchanged) assets.push({ path: compressedPath, base64: compressedBase64 });

        const nextAttrs = { ...node.attrs } as Record<string, unknown>;
        if (compressedPath) {
          nextAttrs.src = compressedPath;
          nextAttrs.filePath = compressedPath;
        }
        if (originalPath) nextAttrs.originalFilePath = originalPath;
        delete nextAttrs.originalSrc;

        return { ...node, attrs: nextAttrs };
      }

      // If already a persisted image node with file paths, make sure temporary originalSrc is stripped
      if (node.attrs && 'originalSrc' in node.attrs) {
        const nextAttrs = { ...node.attrs };
        delete nextAttrs.originalSrc;
        return { ...node, attrs: nextAttrs };
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
      const src = attrs.src || attrs.filePath;
      if (src && !src.startsWith("data:")) {
        const dataUrl = assetCache.get(src);
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
 * Validate a single entry and return a list of error strings.
 * Templates are exempt from author / date / phase requirements.
 *
 * @param entry       - The entry metadata to validate
 * @param phases      - Available phase definitions (used to check phase validity)
 * @param existingIds - Set of all known entry/resource IDs (for broken-reference checks)
 */
export function validateEntry(
  entry: EntryMetadata,
  phases: { index: number }[],
  existingIds: Set<string>
): string[] {
  const errors: string[] = [];

  if (!entry.title?.trim()) errors.push("Entry title is required.");

  // Templates are exempt from author, date, and phase requirements
  if (!entry.isTemplate) {
    if (!entry.author?.trim()) errors.push("Author name is required.");
    if (!entry.date?.trim()) errors.push("Date is required.");
    if (typeof entry.phase !== "number" || !phases.some(p => p.index === entry.phase)) {
      errors.push("Entry phase is required.");
    }
  }

  // Check local resources (applies to both entries and templates)
  if (entry.resources) {
    for (const res of Object.values(entry.resources)) {
      if (res.type === "rawLatex") continue;
      const label = TYPE_LABELS[res.type] || res.type;
      if (!res.title?.trim()) errors.push(`Title missing for ${label}.`);
      if (!res.caption?.trim()) errors.push(`Caption missing for ${label}.`);
    }
  }

  // Check internal references
  if (entry.references) {
    for (const refId of entry.references) {
      if (!existingIds.has(refId)) errors.push(`Broken reference found: ${refId}`);
    }
  }

  return errors;
}

/** 
 * Scans the entire notebook metadata and evaluates the integrity of every entry.
 * Checks for missing required fields, empty resource metadata, and dead internal links.
 */
export function validateNotebookIntegrity(metadata: NotebookMetadata): NotebookMetadata {
    // noop placeholder to ensure patch context (will add import next)
  const newEntries = { ...metadata.entries };
  const assetRefs: Record<string, string[]> = {};

  const trackAsset = (path: string, owner: string) => {
    if (!path || path.startsWith("data:")) return; // Don't track hydrated data
    if (!assetRefs[path]) assetRefs[path] = [];
    if (!assetRefs[path].includes(owner)) assetRefs[path].push(owner);
  };

  // 1. Collect assets from team
  if (metadata.team) {
    if (metadata.team.logo) trackAsset(metadata.team.logo, "team");
    if (metadata.team.logoOriginal) trackAsset(metadata.team.logoOriginal, "team");
    metadata.team.members.forEach(m => {
      if (m.image) trackAsset(m.image, "team");
      if (m.imageOriginal) trackAsset(m.imageOriginal, "team");
    });
  }

  // 2. Build global set of all IDs and collect assets from entries
  const existingIds = new Set<string>();
  for (const [entryId, entry] of Object.entries(metadata.entries)) {
    existingIds.add(entry.id);
    if (entry.resources) {
      for (const resId of Object.keys(entry.resources)) {
        existingIds.add(resId);
      }
    }
    if (entry.assets) {
      entry.assets.forEach(a => trackAsset(a, entryId));
    }
  }

  // Resolve phases — respect explicit empty array, fall back to DEFAULT_PHASES only when undefined
  const phases = metadata.phases !== undefined ? metadata.phases : DEFAULT_PHASES;

  // 3. Validate each entry using the shared helper
  for (const [id, entry] of Object.entries(newEntries)) {
    const errors = validateEntry(entry, phases, existingIds);
    newEntries[id] = { ...entry, isValid: errors.length === 0, validationErrors: errors };
  }

  return { ...metadata, entries: newEntries, assetRefs };
}

/** Check if an entry has all required metadata fields (template-aware). */
export function isEntryValid(info: EntryMetadata): boolean {
  if (!info.title?.trim()) return false;
  if (!info.isTemplate) {
    if (!info.author?.trim()) return false;
    if (!info.date?.trim()) return false;
    if (info.phase === null || info.phase === undefined) return false;
  }
  if (info.resources) {
    for (const res of Object.values(info.resources)) {
      if (res.type === "rawLatex") continue;
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
 * If globalIdMap is provided, it will use and update it for cross-entry consistency.
 */
export function remapContentIds(doc: TipTapDoc | TipTapNode[], globalIdMap: Map<string, string> = new Map()): { doc: TipTapDoc | TipTapNode[], idMap: Map<string, string> } {
  if (!doc) return { doc: doc as TipTapDoc, idMap: globalIdMap };

  // Pass 1: Collect and remap IDs for this doc specifically
  function collect(node: TipTapNode | TipTapNode[]) {
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }

    // For headings without IDs, assign new UUIDs
    if (node.type === "heading" && !node.attrs?.id) {
      if (!node.attrs) node.attrs = {};
      const newId = generateUUID();
      (node.attrs as Record<string, unknown>).id = newId;
      globalIdMap.set(newId, newId); // Map to itself (no old ID to track)
    } else if (node.attrs?.id) {
      const oldId = node.attrs.id as string;
      if (!globalIdMap.has(oldId)) {
        globalIdMap.set(oldId, generateUUID());
      }
    }

    if (Array.isArray(node.content)) {
      node.content.forEach(collect);
    }
  }
  collect(doc);

  // Pass 2: Apply remapping using the map
  function apply(node: TipTapNode | TipTapNode[]): TipTapNode | TipTapNode[] {
    if (!node || typeof node !== "object") return node;

    if (Array.isArray(node)) {
      return node.map((n) => apply(n) as TipTapNode);
    }

    const newNode = { ...node };

    // Update ID attribute if present
    if (node.attrs?.id) {
      const oldId = node.attrs.id as string;
      if (globalIdMap.has(oldId)) {
        newNode.attrs = { ...node.attrs, id: globalIdMap.get(oldId) };
      } else {
        // This shouldn't happen due to Pass 1, but for safety:
        const newId = generateUUID();
        globalIdMap.set(oldId, newId);
        newNode.attrs = { ...node.attrs, id: newId };
      }
    }

    // Update marks (for links)
    if (Array.isArray(node.marks)) {
      newNode.marks = node.marks.map((mark: TipTapMark) => {
        if (mark.type === 'link') {
          const { href = "", resourceId, entryId } = (mark.attrs || {}) as { href?: string, resourceId?: string, entryId?: string };

          const newAttrs = { ...mark.attrs } as Record<string, unknown>;
          let changed = false;

          if (href.startsWith('#')) {
            const oldId = href.substring(1);
            if (globalIdMap.has(oldId)) {
              const newId = globalIdMap.get(oldId);
              newAttrs.href = `#${newId}`;
              newAttrs.resourceId = newId;
              changed = true;
            }
          } else if (resourceId && globalIdMap.has(resourceId)) {
            newAttrs.resourceId = globalIdMap.get(resourceId);
            changed = true;
          }

          if (entryId && globalIdMap.has(entryId)) {
            newAttrs.entryId = globalIdMap.get(entryId);
            changed = true;
          }

          if (changed) {
            return { ...mark, attrs: newAttrs };
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

  return { doc: apply(doc) as TipTapDoc, idMap: globalIdMap };
}

/**
 * Ensures all referenceable resource nodes (headings, tables, code blocks, images, math blocks) have UUIDs in attrs.id.
 * Note: rawLatex is deliberately omitted as it is not referenceable.
 * Returns the modified document (mutates in place)
 */
export function ensureResourceIds(doc: TipTapDoc | TipTapNode): TipTapDoc | TipTapNode {
  if (!doc || typeof doc !== "object") return doc;

  function walk(node: TipTapNode | undefined) {
    if (!node) return;

    // Determine whether this node should be treated as a referenceable resource.
    // Instead of a hard-coded set, detect resource-like nodes by:
    // - nodes that expose caption/title attrs (image/table/code blocks usually do),
    // - headings (they become reference targets), or
    // - well-known structural types that don't normally carry title/caption but must be ids.
    const hasTitleOrCaption = !!(node.attrs && (node.attrs.title !== undefined || node.attrs.caption !== undefined));
    const isHeading = node.type === "heading";
    const isStructuralResource = node.type === "image" || node.type === "table" || node.type === "codeBlock" || node.type === "mathBlock";

    const isResourceNode = hasTitleOrCaption || isHeading || isStructuralResource;

    // Assign UUID to resource nodes without IDs
    if (node.type && isResourceNode && !node.attrs?.id) {
      if (!node.attrs) node.attrs = {};
      (node.attrs as Record<string, unknown>).id = generateUUID();
    }

    if (Array.isArray(node.content)) {
      node.content.forEach(walk);
    }
  }

  walk(doc as TipTapNode);
  return doc;
}

/**
 * Safely sanitizes a TipTap JSON node using a dynamic set of valid node types.
 * Automatically recovers raw text content from any unknown or invalid node type,
 * converting them to standard paragraphs and keeping the document structure clean.
 */
export function sanitizeTipTapDoc(node: TipTapNode | null | undefined, validTypes: Set<string>): TipTapNode | null | undefined {
  if (!node || typeof node !== "object") return node;

  function walk(n: TipTapNode | null | undefined): TipTapNode | null | undefined {
    if (!n || typeof n !== "object") return n;

    // If the node type is invalid/unknown, generically extract its text contents
    if (n.type && !validTypes.has(n.type)) {
      const textNodes: TipTapNode[] = [];
      
      // Recursive helper to gather text
      function collectText(item: TipTapNode | null | undefined) {
        if (!item || typeof item !== "object") return;
        if (item.type === "text") {
          textNodes.push({ type: "text", text: item.text, marks: item.marks });
        } else if (Array.isArray(item.content)) {
          item.content.forEach(collectText);
        }
      }
      collectText(n);

      return {
        type: "paragraph",
        content: textNodes.length > 0 ? textNodes : [{ type: "text", text: "" }]
      };
    }

    // Otherwise, standard recursive walk for valid types
    if (Array.isArray(n.content)) {
      n.content = n.content.map(walk).filter((item): item is TipTapNode => !!item);
    }
    return n;
  }

  return walk(node);
}

/**
 * Remaps IDs in the entry metadata's resources and references fields.
 */
export function remapEntryMetadataIds(entry: EntryMetadata, idMap: Map<string, string>): EntryMetadata {
  const newEntry = { ...entry };

  // Remap resources
  if (entry.resources) {
    const newResources: Record<string, { title: string; caption: string; type: string }> = {};
    for (const [oldId, res] of Object.entries(entry.resources)) {
      const newId = idMap.get(oldId) || oldId;
      newResources[newId] = { ...res };
    }
    newEntry.resources = newResources;
  }

  // Remap references
  if (entry.references) {
    newEntry.references = entry.references.map(refId => idMap.get(refId) || refId);
  }

  return newEntry;
}

/**
 * Replaces Base64 data URLs with hashed asset paths in Team Metadata.
 */
export async function dehydrateTeamAssets(team: TeamMetadata): Promise<{ cleanTeam: TeamMetadata; newAssets: { path: string; base64: string }[] }> {
  const { hashContent, getExtensionFromDataUrl } = await import("./utils");
  const assets: { path: string; base64: string }[] = [];

  const cleanTeam = JSON.parse(JSON.stringify(team)) as TeamMetadata;

  const processImg = async (src: string | undefined, targetDir: string, forceJpeg = false) => {
    if (src?.startsWith("data:")) {
      const base64 = src.split(",")[1]?.trim();
      if (!base64) return src;
      const hash = await hashContent(base64);
      const ext = forceJpeg ? "jpg" : getExtensionFromDataUrl(src);
      const assetPath = `${targetDir}/${hash}.${ext}`;
      assets.push({ path: assetPath, base64 });
      return assetPath;
    }
    return src;
  };

  if (cleanTeam.logo) cleanTeam.logo = await processImg(cleanTeam.logo, ASSETS_COMPRESSED_DIR, true);
  if (cleanTeam.logoOriginal) cleanTeam.logoOriginal = await processImg(cleanTeam.logoOriginal, ASSETS_ORIGINAL_DIR);
  for (const member of cleanTeam.members) {
    if (member.image) member.image = await processImg(member.image, ASSETS_COMPRESSED_DIR, true);
    if (member.imageOriginal) member.imageOriginal = await processImg(member.imageOriginal, ASSETS_ORIGINAL_DIR);
  }

  return { cleanTeam, newAssets: assets };
}

/**
 * Replaces asset paths with data URLs from the cache in Team Metadata.
 */
export function hydrateTeamAssets(team: TeamMetadata, assetCache: Map<string, string>): TeamMetadata {
  const hydrated = JSON.parse(JSON.stringify(team)) as TeamMetadata;
  const processImg = (src: string | undefined) => {
    if (src && !src.startsWith("data:")) {
      const cached = assetCache.get(src);
      return cached || src;
    }
    return src;
  };
  if (hydrated.logo) hydrated.logo = processImg(hydrated.logo);
  if (hydrated.logoOriginal) hydrated.logoOriginal = processImg(hydrated.logoOriginal);
  for (const member of hydrated.members) {
    if (member.image) member.image = processImg(member.image);
    if (member.imageOriginal) member.imageOriginal = processImg(member.imageOriginal);
  }
  return hydrated;
}

/**
 * 3-Way Merge for NotebookMetadata (Base, Local, Remote).
 * Automatically merges non-colliding entry metadata additions/modifications and preserves team/phase changes.
 */
export function mergeNotebookMetadata(
  base: NotebookMetadata | null,
  local: NotebookMetadata,
  remote: NotebookMetadata
): { merged: NotebookMetadata; hasCollisions: boolean; collidingEntryIds: string[] } {
  const baseEntries = base?.entries || {};
  const localEntries = local.entries || {};
  const remoteEntries = remote.entries || {};

  const mergedEntries: Record<string, EntryMetadata> = {};
  const allEntryIds = new Set([
    ...Object.keys(baseEntries),
    ...Object.keys(localEntries),
    ...Object.keys(remoteEntries)
  ]);

  const collidingEntryIds: string[] = [];

  for (const id of allEntryIds) {
    const b = baseEntries[id];
    const l = localEntries[id];
    const r = remoteEntries[id];

    // Case 1: Only in local (newly created locally)
    if (!b && l && !r) {
      mergedEntries[id] = l;
      continue;
    }

    // Case 2: Only in remote (newly created on remote)
    if (!b && !l && r) {
      mergedEntries[id] = r;
      continue;
    }

    // Case 3: Deleted in local, unchanged in remote
    if (b && !l && r && JSON.stringify(b) === JSON.stringify(r)) {
      continue; // keep deleted
    }

    // Case 4: Deleted in remote, unchanged in local
    if (b && l && !r && JSON.stringify(b) === JSON.stringify(l)) {
      continue; // keep deleted
    }

    // Case 5: Modified in local, unchanged in remote
    if (b && l && r && JSON.stringify(b) !== JSON.stringify(l) && JSON.stringify(b) === JSON.stringify(r)) {
      mergedEntries[id] = l;
      continue;
    }

    // Case 6: Modified in remote, unchanged in local
    if (b && l && r && JSON.stringify(b) === JSON.stringify(l) && JSON.stringify(b) !== JSON.stringify(r)) {
      mergedEntries[id] = r;
      continue;
    }

    // Case 7: Same modifications in both
    if (l && r && JSON.stringify(l) === JSON.stringify(r)) {
      mergedEntries[id] = l;
      continue;
    }

    // Case 8: True collision (both modified differently, or added same ID differently)
    if (l && r) {
      collidingEntryIds.push(id);
      // For level 1, keep local but flag collision
      mergedEntries[id] = l;
    } else if (l) {
      mergedEntries[id] = l;
    } else if (r) {
      mergedEntries[id] = r;
    }
  }

  // Merge team and phases (favor local if modified from base, else remote)
  const baseTeamStr = JSON.stringify(base?.team || null);
  const localTeamStr = JSON.stringify(local.team || null);
  const remoteTeamStr = JSON.stringify(remote.team || null);
  const team = localTeamStr !== baseTeamStr ? local.team : remote.team;

  const basePhasesStr = JSON.stringify(base?.phases || null);
  const localPhasesStr = JSON.stringify(local.phases || null);
  const remotePhasesStr = JSON.stringify(remote.phases || null);
  const phases = localPhasesStr !== basePhasesStr ? local.phases : remote.phases;

  const merged = validateNotebookIntegrity({
    version: Math.max(local.version || 3, remote.version || 3),
    entries: mergedEntries,
    team: team || local.team,
    phases: phases || local.phases,
    lastCompiled: local.lastCompiled || remote.lastCompiled
  });

  return {
    merged,
    hasCollisions: collidingEntryIds.length > 0,
    collidingEntryIds
  };
}


