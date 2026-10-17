export declare const NOTEBOOK_SCHEMA_VERSION: 5;
export type OrgRole = "owner" | "admin" | "member";
export type PlatformRole = "service_admin";
export type NotebookAccessRole = OrgRole;
export type UserGrants = {
    platformAi?: boolean;
};
/** Non-secret user prefs (BYOK API keys stay in browser localStorage only). */
export type UserPreferences = {
    theme?: "light" | "dark" | "system";
    defaultAuthors?: string[];
    genai?: {
        enabled?: boolean;
        provider?: string;
        models?: Record<string, string>;
        baseUrls?: Record<string, string>;
    };
    lastOrgId?: string;
    explorerSort?: {
        by: "date" | "title" | "order";
        direction: "asc" | "desc";
    };
};
export type UserProfile = {
    uid: string;
    email?: string;
    displayName?: string;
    platformRole?: PlatformRole;
    grants?: UserGrants;
    preferences?: UserPreferences;
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
/** Named group of Users inside an org (ACL grouping only — no number/logo). */
export type Team = {
    id: string;
    orgId: string;
    name: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
};
export type TeamMembership = {
    uid: string;
    joinedAt: string;
};
/** Folder tree node. `order` is sibling position under `parentId` (explorer only). */
export type NotebookFolder = {
    name: string;
    parentId: string | null;
    order: number;
};
/** Who may open a notebook (org owners/admins always can). */
export type NotebookAccess = {
    mode: "org" | "restricted";
    teamIds: string[];
    userIds: string[];
};
export declare function defaultNotebookAccess(): NotebookAccess;
/** Contributor on a notebook (credits/roster). May exist without an app account. */
export type NotebookMember = {
    id: string;
    name: string;
    role: string;
    order: number;
    imageAssetId?: string;
    linkedUid?: string;
};
export type ProjectPhase = {
    name: string;
    description: string;
    iconName: string;
    color: string;
    order: number;
};
/**
 * Entry metadata in Firestore.
 *
 * Ordering is intentionally split:
 * - `date` + `order` → compile / calendar sequence (date primary; `order` is same-day tiebreaker, rearranged in calendar)
 * - `folderId` + `explorerOrder` → file-explorer tree (sibling position within a folder; unrelated to compile)
 */
export type EntryMetadataV5 = {
    title: string;
    authors: string[];
    phase: string | null;
    createdAt: string;
    updatedAt: string;
    date: string;
    folderId: string | null;
    /** Same-day (and densified) sequence for calendar + compile. Not explorer position. */
    order: number;
    /** Sibling position within `folderId` in the file explorer. Defaults to `order` when absent. */
    explorerOrder?: number;
    isTemplate?: boolean;
    resources?: Record<string, {
        title: string;
        caption: string;
        type: string;
    }>;
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
    title?: string;
    subtitle?: string;
    logoAssetId?: string;
    folders: Record<string, NotebookFolder>;
    access?: NotebookAccess;
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
export type AuditStatus = "running" | "completed" | "failed";
export type AuditProvider = "byok" | "vertex" | "local";
export type AuditStep = {
    at: string;
    message: string;
    entryId?: string | null;
};
/** Rubric audit run (browser-orchestrated; Core persists progress). */
export type RubricScorecard = {
    id: string;
    orgId: string;
    notebookId: string;
    rubric: string;
    provider: AuditProvider;
    status: AuditStatus;
    scores: Record<string, number>;
    advice: Array<{
        entryId: string | null;
        message: string;
    }>;
    summary?: string;
    steps?: AuditStep[];
    error?: string;
    createdBy: string;
    createdAt: string;
    updatedAt?: string;
};
/** ZIP / export envelope (no TipTap bodies). */
export type NotebookExportV5 = {
    schemaVersion: typeof NOTEBOOK_SCHEMA_VERSION;
    name: string;
    title?: string;
    subtitle?: string;
    logoAssetId?: string;
    folders: Record<string, NotebookFolder>;
    access?: NotebookAccess;
    phases?: Record<string, ProjectPhase>;
    members?: Record<string, Omit<NotebookMember, "id">>;
    lastCompiled?: string;
    entries: Record<string, EntryMetadataV5>;
};
/** Legacy embedded team blob (ZIP/local import shim only). */
export type LegacyTeamMemberV5 = {
    name: string;
    role: string;
    order: number;
    imageAssetId?: string;
    imageOriginalAssetId?: string;
};
export type LegacyTeamMetadataV5 = {
    teamName: string;
    teamNumber: string;
    startDate?: string;
    endDate?: string;
    autoCalculateDates?: boolean;
    organization: string;
    logoAssetId?: string;
    logoOriginalAssetId?: string;
    members: Record<string, LegacyTeamMemberV5>;
};
/** @deprecated Use LegacyTeamMetadataV5 — kept for older import paths. */
export type TeamMemberV5 = LegacyTeamMemberV5;
/** @deprecated Use LegacyTeamMetadataV5 */
export type TeamMetadataV5 = LegacyTeamMetadataV5;
