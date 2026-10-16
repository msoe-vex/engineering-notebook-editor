import { ENTRIES_DIR } from "@/lib/constants";
import { formatAuthors } from "@/lib/notebook/metadata";
import type { ExplorerFile } from "@/lib/types";
import type { EntryMeta } from "@/components/cloud/notebook-types";

type FolderMap = Record<string, { name: string; parentId: string | null; order: number }>;

/** Map cloud Firestore entry metadata → FileExplorer rows. */
export function cloudEntriesToExplorerFiles(
  entries: Record<string, EntryMeta>,
  folders: FolderMap = {}
): ExplorerFile[] {
  return Object.entries(entries).map(([id, e]) => {
    const folderId = e.folderId ?? null;
    const folderName = folderId ? folders[folderId]?.name ?? null : null;
    return {
      name: `${id}.json`,
      path: `${ENTRIES_DIR}/${id}.json`,
      title: (e.title || "").trim(),
      author: formatAuthors(e.authors),
      authors: e.authors,
      phase: e.phase ?? null,
      timestamp: e.createdAt,
      updatedAt: e.updatedAt,
      date: e.date,
      order: e.explorerOrder ?? e.order ?? 0,
      folderId,
      folderName,
      isTemplate: e.isTemplate || false,
      isValid: true,
      validationErrors: [],
    };
  });
}

export function explorerFileEntryId(file: ExplorerFile): string {
  return file.name.replace(/\.json$/, "");
}
