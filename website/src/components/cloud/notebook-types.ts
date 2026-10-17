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
};

export type NotebookWorkspaceState = {
  orgId: string;
  notebookId: string;
  notebookName: string;
  notebookSummary: NotebookSummaryV5 | null;
  folders: Record<string, { name: string; parentId: string | null; order: number }>;
  entries: Record<string, EntryMeta>;
  assets: AssetSummary[];
  error: string | null;
  busy: boolean;
  auditResult: string | null;
  refresh: () => void;
  setEntries?: React.Dispatch<React.SetStateAction<Record<string, EntryMeta>>>;
  setFolders?: React.Dispatch<
    React.SetStateAction<Record<string, { name: string; parentId: string | null; order: number }>>
  >;
  setError: (message: string | null) => void;
  setBusy: (busy: boolean) => void;
  setAuditResult: (result: string | null) => void;
  setNotebookSummary: (summary: NotebookSummaryV5 | null) => void;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    variant?: "danger" | "warning" | "info"
  ) => void;
  showPrompt: (
    title: string,
    initialValue: string,
    onConfirm: (value: string) => void,
    label?: string
  ) => void;
};
