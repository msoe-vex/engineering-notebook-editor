import type { NotebookSummaryV5 } from "@engineering-notebook/shared";
import type { AssetSummary } from "@/lib/cloud/api";

export type EntryMeta = {
  title: string;
  folderId: string | null;
  order: number;
  date: string;
  phase: string | null;
  authors?: string[];
  isTemplate?: boolean;
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
