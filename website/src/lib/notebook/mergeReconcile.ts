import { ENTRIES_DIR, LATEX_DIR } from "@/lib/constants";
import type { NotebookMetadata } from "./metadata";
import { mergeNotebookMetadata } from "./metadata";
import { entriesEqualForMerge, normalizeNotebookMetadata, serializeNotebookMetadata } from "./notebookSchema";

export type EntryConflictKind =
  | "both_edited"
  | "local_edit_remote_delete"
  | "local_delete_remote_edit";

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
): { fileIds: Set<string>; pendingUpsertIds: Set<string>; pendingDeleteIds: Set<string> } {
  const fileIds = new Set<string>();
  const pendingUpsertIds = new Set<string>();
  const pendingDeleteIds = new Set<string>();
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
      pendingDeleteIds.delete(id);
    } else if (change.operation === "delete") {
      fileIds.delete(id);
      pendingUpsertIds.delete(id);
      pendingDeleteIds.add(id);
    }
  }
  return { fileIds, pendingUpsertIds, pendingDeleteIds };
}

function classifyEntryConflict(
  id: string,
  base: NotebookMetadata | null,
  local: NotebookMetadata,
  remote: NotebookMetadata,
  pendingUpsertIds: Set<string>,
  pendingDeleteIds: Set<string>
): EntryConflictKind | null {
  const baseEntry = base?.entries?.[id];
  const localEntry = local.entries[id];
  const remoteEntry = remote.entries?.[id];

  // Only staged entry-file ops count as intentional local edits. Index-only churn
  // (resource sync, validation) must not block adopting remote sibling changes.
  const localFileEdited = pendingUpsertIds.has(id);
  const localDeleted = pendingDeleteIds.has(id) || (!!baseEntry && !localEntry && !localFileEdited);
  const remoteDeleted = !!baseEntry && !remoteEntry;
  const remoteEdited =
    !!remoteEntry && !!baseEntry && !entriesEqualForMerge(remoteEntry, baseEntry);

  if (localFileEdited && remoteDeleted) return "local_edit_remote_delete";
  if (localDeleted && remoteEntry && (remoteEdited || !baseEntry)) {
    return "local_delete_remote_edit";
  }
  if (localFileEdited && remoteEntry && remoteEdited) return "both_edited";
  // Staged upsert vs remote upsert with no/corrupt base: still a content conflict if they differ.
  if (localFileEdited && remoteEntry && localEntry && !baseEntry && !entriesEqualForMerge(localEntry, remoteEntry)) {
    return "both_edited";
  }
  return null;
}

/**
 * 3-way merge plus recovery for a polluted base snapshot (local adds looking like
 * remote deletes) and leftover JSON files no longer referenced by merged metadata.
 *
 * `fileIds` is the locally known entry file set (workspace tree + pending upserts).
 * Remote-only entries are always kept even when they are missing from `fileIds`
 * (e.g. commit/sync before a refresh). Orphans are only files that neither the
 * merge result nor remote metadata still claim.
 *
 * Entries the user did not stage as content upserts adopt remote metadata when
 * local still matches base (or base is missing) so sibling remote edits survive sync.
 *
 * Delete-vs-edit is surfaced as a collision so the UI can prompt instead of
 * silently resurrecting or discarding work.
 */
export function reconcileNotebookMerge(
  base: NotebookMetadata | null,
  local: NotebookMetadata,
  remote: NotebookMetadata,
  options: {
    fileIds: Set<string>;
    pendingUpsertIds: Set<string>;
    pendingDeleteIds?: Set<string>;
  }
): {
  merged: NotebookMetadata;
  hasCollisions: boolean;
  collidingEntryIds: string[];
  conflictKinds: Record<string, EntryConflictKind>;
  orphanIds: string[];
} {
  const { fileIds, pendingUpsertIds, pendingDeleteIds = new Set<string>() } = options;
  const validEntryIds = new Set(fileIds);
  for (const id of Object.keys(remote.entries || {})) {
    if (!pendingDeleteIds.has(id)) validEntryIds.add(id);
  }
  for (const id of pendingUpsertIds) validEntryIds.add(id);
  // Keep brand-new local entries even if their JSON is not in the remote tree yet.
  for (const id of Object.keys(local.entries || {})) {
    if (!base?.entries?.[id] && !remote.entries?.[id]) validEntryIds.add(id);
  }
  // Keep locally deleted entries in the merge set until delete-vs-edit is resolved.
  for (const id of pendingDeleteIds) {
    if (remote.entries?.[id] || base?.entries?.[id]) validEntryIds.add(id);
  }

  const result = mergeNotebookMetadata(base, local, remote, { validEntryIds });
  const entries = { ...result.merged.entries };
  let restored = false;
  const conflictKinds: Record<string, EntryConflictKind> = {};
  const colliding = new Set(result.collidingEntryIds);

  for (const id of pendingUpsertIds) {
    if (!entries[id] && local.entries[id]) {
      entries[id] = local.entries[id];
      restored = true;
    }
  }

  // Classify delete/edit conflicts before applying pending deletes.
  const candidateIds = new Set([
    ...Object.keys(base?.entries || {}),
    ...Object.keys(local.entries || {}),
    ...Object.keys(remote.entries || {}),
    ...pendingUpsertIds,
    ...pendingDeleteIds,
  ]);
  for (const id of candidateIds) {
    const kind = classifyEntryConflict(id, base, local, remote, pendingUpsertIds, pendingDeleteIds);
    if (!kind) continue;
    conflictKinds[id] = kind;
    colliding.add(id);
    if (kind === "local_edit_remote_delete" && local.entries[id]) {
      entries[id] = local.entries[id];
      restored = true;
    } else if (kind === "local_delete_remote_edit" && remote.entries?.[id]) {
      // Hold remote in merged until the user chooses delete vs keep.
      entries[id] = remote.entries[id];
      restored = true;
    }
  }

  // Apply pending deletes only when they are not contested by a remote edit.
  for (const id of pendingDeleteIds) {
    if (conflictKinds[id] === "local_delete_remote_edit") continue;
    if (entries[id]) {
      delete entries[id];
      restored = true;
    }
  }

  // Hard rule: entries the user did not stage as upsert/delete always take remote.
  // Prevents stale/polluted local notebook.json from undoing teammate work.
  const allIndexIds = new Set([
    ...Object.keys(entries),
    ...Object.keys(remote.entries || {}),
    ...Object.keys(local.entries || {}),
    ...Object.keys(base?.entries || {}),
  ]);
  for (const id of allIndexIds) {
    if (pendingUpsertIds.has(id) || pendingDeleteIds.has(id) || conflictKinds[id]) continue;

    const remoteEntry = remote.entries?.[id];
    if (remoteEntry) {
      if (!entries[id] || !entriesEqualForMerge(entries[id], remoteEntry)) {
        entries[id] = remoteEntry;
        restored = true;
      }
    } else if (entries[id]) {
      // Remote does not have it. Keep only brand-new local adds (not in base/remote).
      const isLocalOnlyAdd = !base?.entries?.[id] && local.entries[id];
      if (!isLocalOnlyAdd) {
        delete entries[id];
        restored = true;
      }
    }
  }

  // Fill both_edited kinds for collisions that came from content merge,
  // but only when the user actually staged that entry's file.
  for (const id of [...colliding]) {
    if (!conflictKinds[id]) {
      if (pendingUpsertIds.has(id)) {
        conflictKinds[id] = "both_edited";
      } else {
        // Index-only / merge-noise collision — do not prompt; remote already applied above.
        colliding.delete(id);
      }
    }
  }

  const merged = restored
    ? normalizeNotebookMetadata({ ...result.merged, entries })
    : normalizeNotebookMetadata({ ...result.merged, entries });

  const collidingEntryIds = [...colliding];

  const orphanIds = [...fileIds].filter(
    (id) => !merged.entries[id] && !remote.entries?.[id] && !conflictKinds[id]
  );
  return {
    ...result,
    merged,
    hasCollisions: collidingEntryIds.length > 0,
    collidingEntryIds,
    conflictKinds,
    orphanIds,
  };
}
