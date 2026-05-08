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
  phase: number | null; // Phase ID
  createdAt: string;
  updatedAt: string;
  filename: string; // Path to the entry file (e.g. "entries/uuid.json")
  resources?: Record<string, { title: string, caption: string, type: string }>; // block uuid -> metadata
  isValid?: boolean;
  references?: string[]; // List of target UUIDs this entry points to
  assets?: string[]; // List of asset paths used in this entry
  validationErrors?: string[]; // Detailed messages for the UI
}

export interface TeamMember {
  name: string;
  role: string;
  image?: string; // Path to asset
}

export interface TeamMetadata {
  teamName: string;
  teamNumber: string;
  startDate?: string;
  endDate?: string;
  organization: string;
  logo?: string; // Path to asset
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

export const DEFAULT_PHASES: ProjectPhase[] = [
  { id: "define-problem", index: 1, name: "Define Problem", description: "Identifying the core issue, setting SMART goals, outlining constraints and deliverables.", iconName: "Goal", color: "#3b82f6" },
  { id: "generate-concepts", index: 2, name: "Generate Concepts", description: "Brainstorming, research, prototyping, and decision matrices to evaluate potential solutions.", iconName: "Brain", color: "#a855f7" },
  { id: "develop-solution", index: 3, name: "Develop Solution", description: "Creating CAD, detailed sketches, math calculations, graphical models, and pseudocode.", iconName: "PencilRuler", color: "#6366f1" },
  { id: "construct-test", index: 4, name: "Construct and Test", description: "Building the robot, writing the code, executing test plans, and gathering qualitative/quantitative data.", iconName: "Hammer", color: "#f97316" },
  { id: "evaluate-solution", index: 5, name: "Evaluate Solution", description: "Reflecting on constraints, event outcomes, and planning future improvements.", iconName: "SearchCheck", color: "#10b981" },
];

export const EMPTY_METADATA: NotebookMetadata = { 
  version: 3, 
  entries: {},
  phases: DEFAULT_PHASES,
  team: {
    teamName: "",
    teamNumber: "",
    startDate: "TBD",
    endDate: "TBD",
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
      const path = (node.attrs?.filePath as string) || (node.attrs?.src as string);
      if (path && path.startsWith(`${ASSETS_DIR}/`)) {
        paths.push(path);
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
        caption: "", 
        type: "header" 
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
        const base64 = attrs.src.split(",")[1]?.trim();
        if (!base64) return node; // Skip if malformed
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
 * Scans the entire notebook metadata and evaluates the integrity of every entry.
 * Checks for missing required fields, empty resource metadata, and dead internal links.
 */
export function validateNotebookIntegrity(metadata: NotebookMetadata): NotebookMetadata {
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
    metadata.team.members.forEach(m => {
      if (m.image) trackAsset(m.image, "team");
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

  // 3. Validate each entry
  for (const [id, entry] of Object.entries(newEntries)) {
    const errors: string[] = [];

    // Check basic metadata
    if (!entry.title?.trim()) errors.push("Missing title");
    if (!entry.author?.trim()) errors.push("Missing author");
    
    // Phase validation
    const phases = metadata.phases && metadata.phases.length > 0 ? metadata.phases : DEFAULT_PHASES;
    if (typeof entry.phase !== "number" || !phases.some(p => p.index === entry.phase)) {
      errors.push("Missing or invalid phase");
    }

    // Check local resources
    if (entry.resources) {
      for (const [resId, res] of Object.entries(entry.resources)) {
        if (!res.title?.trim()) errors.push(`Resource "${resId}" missing title`);
        if (res.type !== "header" && !res.caption?.trim()) {
          errors.push(`Resource "${resId}" missing caption`);
        }
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
    entries: newEntries,
    assetRefs
  };
}

/** Check if an entry has all required metadata fields. */
export function isEntryValid(info: EntryMetadata): boolean {
  if (!info.title?.trim()) return false;
  if (!info.author?.trim()) return false;
  if (info.phase === null) return false;
  
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
 * Ensures all heading nodes have UUIDs in attrs.id
 * Returns the modified document (mutates in place)
 */
export function ensureHeadingIds(doc: TipTapDoc | TipTapNode): TipTapDoc | TipTapNode {
  if (!doc || typeof doc !== "object") return doc;

  function walk(node: TipTapNode | undefined) {
    if (!node) return;

    // Assign UUID to headings without IDs
    if (node.type === "heading" && !node.attrs?.id) {
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

  const processImg = async (src: string | undefined) => {
    if (src?.startsWith("data:")) {
      const base64 = src.split(",")[1]?.trim();
      if (!base64) return src;
      const hash = await hashContent(base64);
      const ext = getExtensionFromDataUrl(src);
      const assetPath = `${ASSETS_DIR}/${hash}.${ext}`;
      assets.push({ path: assetPath, base64 });
      return assetPath;
    }
    return src;
  };

  if (cleanTeam.logo) cleanTeam.logo = await processImg(cleanTeam.logo);
  for (const member of cleanTeam.members) {
    if (member.image) member.image = await processImg(member.image);
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
      if (!cached) console.warn(`[Hydrate] Asset not found in cache: ${src}`);
      return cached || src;
    }
    return src;
  };
  if (hydrated.logo) hydrated.logo = processImg(hydrated.logo);
  for (const member of hydrated.members) {
    if (member.image) member.image = processImg(member.image);
  }
  return hydrated;
}


