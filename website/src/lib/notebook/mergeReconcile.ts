import { ENTRIES_DIR, LATEX_DIR } from "@/lib/constants";
import type { NotebookMetadata } from "./metadata";
import { mergeNotebookMetadata } from "./metadata";
import { normalizeNotebookMetadata, serializeNotebookMetadata } from "./notebookSchema";

export function cloneNotebookMetadata(metadata: NotebookMetadata): NotebookMetadata {
  return JSON.parse(serializeNotebookMetadata(metadata)) as NotebookMetadata;
}

export function jsonEntryIdFromPath(path: string): string | null {
  const prefix = `${ENTRIES_DIR}/`;
  if (!path.startsWith(prefix) || !path.endsWith(".json")) return null;
  const name = path.slice(prefix.length, -".json".length);
  if (!name || name.includes("/")) return null;
  return name;
}

export function entryArtifactPaths(id: string): { jsonPath: string; texPath: string } {
  return { jsonPath: `${ENTRIES_DIR}/${id}.json`, texPath: `${LATEX_DIR}/${id}.tex` };
}

export function collectEntryFileIds(
  filePaths: string[],
  pending: { path: string; operation: string }[]
): { fileIds: Set<string>; pendingUpsertIds: Set<string> } {
  const fileIds = new Set<string>();
  const pendingUpsertIds = new Set<string>();
  for (const path of filePaths) {
    const id = jsonEntryIdFromPath(path);
    if (id) fileIds.add(id);
  }
  for (const change of pending) {
    const id = jsonEntryIdFromPath(change.path);
    if (!id) continue;
    if (change.operation === "upsert") {
      fileIds.add(id);
      pendingUpsertIds.add(id);
    } else if (change.operation === "delete") {
      fileIds.delete(id);
      pendingUpsertIds.delete(id);
    }
  }
  return { fileIds, pendingUpsertIds };
}

/**
 * 3-way merge plus recovery for a polluted base snapshot (local adds looking like
 * remote deletes) and leftover JSON files no longer referenced by merged metadata.
 */
export function reconcileNotebookMerge(
  base: NotebookMetadata | null,
  local: NotebookMetadata,
  remote: NotebookMetadata,
  options: { fileIds: Set<string>; pendingUpsertIds: Set<string> }
): {
  merged: NotebookMetadata;
  hasCollisions: boolean;
  collidingEntryIds: string[];
  orphanIds: string[];
} {
  const { fileIds, pendingUpsertIds } = options;
  const result = mergeNotebookMetadata(base, local, remote, { validEntryIds: fileIds });
  const entries = { ...result.merged.entries };
  let restored = false;
  for (const id of pendingUpsertIds) {
    if (!entries[id] && local.entries[id]) {
      entries[id] = local.entries[id];
      restored = true;
    }
  }
  const merged = restored
    ? normalizeNotebookMetadata({ ...result.merged, entries })
    : result.merged;
  const orphanIds = [...fileIds].filter((id) => !merged.entries[id]);
  return { ...result, merged, orphanIds };
}
