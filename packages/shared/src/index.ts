export const NOTEBOOK_SCHEMA_VERSION = 5;

export type OrgRole = "owner" | "admin" | "member";
export type PlatformRole = "service_admin";
export type NotebookAccessRole = OrgRole;

export type UserGrants = {
  platformAi?: boolean;
};

export type NotebookFolder = {
  name: string;
  parentId: string | null;
  order: number;
};

export type EntryMetadataV5 = {
  title: string;
  authors: string[];
  phase: string;
  date: string;
  folderId: string | null;
  order: number;
  assetIds?: string[];
};

export type NotebookSummaryV5 = {
  schemaVersion: typeof NOTEBOOK_SCHEMA_VERSION;
  orgId: string;
  name: string;
  folders: Record<string, NotebookFolder>;
};

export type RubricScorecard = {
  notebookId: string;
  rubric: string;
  scores: Record<string, number>;
  advice: Array<{ entryId: string | null; message: string }>;
};
