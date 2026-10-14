export const NOTEBOOK_SCHEMA_VERSION = 5 as const;

export type OrgRole = "owner" | "admin" | "member";
export type PlatformRole = "service_admin";
export type NotebookAccessRole = OrgRole;

export type UserGrants = {
  platformAi?: boolean;
};

export type UserProfile = {
  uid: string;
  email?: string;
  displayName?: string;
  platformRole?: PlatformRole;
  grants?: UserGrants;
  createdAt: string;
  updatedAt: string;
};

export type Organization = {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type OrgMember = {
  uid: string;
  role: OrgRole;
  email?: string;
  joinedAt: string;
};

export type Invite = {
  id: string;
  orgId: string;
  email: string;
  role: OrgRole;
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  acceptedAt?: string;
};

export type NotebookFolder = {
  name: string;
  parentId: string | null;
  order: number;
};

export type TeamMemberV5 = {
  name: string;
  role: string;
  order: number;
  imageAssetId?: string;
  imageOriginalAssetId?: string;
};

export type TeamMetadataV5 = {
  teamName: string;
  teamNumber: string;
  startDate?: string;
  endDate?: string;
  autoCalculateDates?: boolean;
  /** School / team organization string — not the platform Organization. */
  organization: string;
  logoAssetId?: string;
  logoOriginalAssetId?: string;
  members: Record<string, TeamMemberV5>;
};

export type ProjectPhase = {
  name: string;
  description: string;
  iconName: string;
  color: string;
  order: number;
};

export type EntryMetadataV5 = {
  title: string;
  authors: string[];
  phase: string | null;
  createdAt: string;
  updatedAt: string;
  date: string;
  folderId: string | null;
  order: number;
  isTemplate?: boolean;
  resources?: Record<string, { title: string; caption: string; type: string }>;
  isValid?: boolean;
  references?: string[];
  assetIds?: string[];
  validationErrors?: string[];
  tipTapGcsPath?: string;
  tipTapRev?: number;
  yjsGcsPath?: string;
  yjsRev?: number;
};

export type NotebookSummaryV5 = {
  schemaVersion: typeof NOTEBOOK_SCHEMA_VERSION;
  orgId: string;
  name: string;
  folders: Record<string, NotebookFolder>;
  team?: TeamMetadataV5;
  phases?: Record<string, ProjectPhase>;
  lastCompiled?: string;
  updatedAt: string;
  createdAt?: string;
  createdBy?: string;
};

export type AssetMetadata = {
  id: string;
  contentType: string;
  byteSize: number;
  gcsPath: string;
  gcsPathOriginal?: string;
  createdBy: string;
  createdAt: string;
  usedBy: string[];
};

export type RubricScorecard = {
  id?: string;
  orgId: string;
  notebookId: string;
  rubric: string;
  provider: "byok" | "vertex";
  scores: Record<string, number>;
  advice: Array<{ entryId: string | null; message: string }>;
  summary?: string;
  createdBy: string;
  createdAt: string;
};

/** ZIP / export envelope (no TipTap bodies). */
export type NotebookExportV5 = {
  schemaVersion: typeof NOTEBOOK_SCHEMA_VERSION;
  name: string;
  folders: Record<string, NotebookFolder>;
  team?: TeamMetadataV5;
  phases?: Record<string, ProjectPhase>;
  lastCompiled?: string;
  entries: Record<string, EntryMetadataV5>;
};
