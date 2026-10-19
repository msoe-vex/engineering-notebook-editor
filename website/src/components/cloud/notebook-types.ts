import type { NotebookSummaryV5 } from "@engineering-notebook/shared";
import type { AssetSummary } from "@/lib/cloud/api";

export type EntryMeta = {
  title: string;
  folderId: string | null;
  /** Calendar / compile same-day sequence. */
  order: number;
  /** Sibling position in the file explorer within `folderId`. */
  explorerOrder?: number;
  date: string;
  phase: string | null;
  authors?: string[];
  assetIds?: string[];
  isTemplate?: boolean;
  isValid?: boolean;
  validationErrors?: string[];
  createdAt?: string;
  updatedAt?: string;
  /** Soft-deleted (in Trash) when set. */
  deletedAt?: string | null;
};

export function isEntryTrashed(entry: { deletedAt?: string | null } | null | undefined): boolean {
  return Boolean(entry?.deletedAt);
}

export type NotebookWorkspaceState = {
  orgId: string;
  notebookId: string;
  notebookName: string;
  notebookSummary: NotebookSummaryV5 | null;
  /** True after the first notebook load attempt finishes (success or failure). */
  initialLoaded: boolean;
  /** Notebook/org failed to load (missing or forbidden) — show empty state, not the editor. */
  notebookUnavailable: boolean;
  folders: Record<string, { name: string; parentId: string | null; order: number }>;
  entries: Record<string, EntryMeta>;
  assets: AssetSummary[];
  error: string | null;
  busy: boolean;
  canManage?: boolean;
  refresh: () => void;
  setEntries?: React.Dispatch<React.SetStateAction<Record<string, EntryMeta>>>;
  setFolders?: React.Dispatch<
    React.SetStateAction<Record<string, { name: string; parentId: string | null; order: number }>>
  >;
  setError: (message: string | null) => void;
  setBusy: (busy: boolean) => void;
  setNotebookSummary: (summary: NotebookSummaryV5 | null) => void;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    variant?: "danger" | "warning" | "info",
    confirmText?: string
  ) => void;
  showPrompt: (
    title: string,
    initialValue: string,
    onConfirm: (value: string) => void,
    label?: string
  ) => void;
  /** Viewport below `md` — mobile shell (drawer explorer, no split). */
  isNarrowViewport?: boolean;
  /** Open the entry-list drawer while an entry is open (phone). */
  openMobileExplorer?: () => void;
  /**
   * Entry id highlighted/opened immediately on click before the route catches up.
   * Cleared when `pathname` matches or navigation is cancelled.
   */
  optimisticEntryId?: string | null;
  setOptimisticEntryId?: (id: string | null) => void;
};
