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
    /**
     * Soft-delete timestamp (ISO). When set, entry is in Trash — hidden from explorer,
     * calendar, and compile until restored or permanently purged.
     */
    deletedAt?: string | null;
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
/** One performance level inside a rubric category (standardized matrix). */
export type RubricLevel = {
    id: string;
    label: string;
    description: string;
    /** Points awarded when this level is selected (usually 0…max for the category). */
    points: number;
};
/** Rubric category / criterion with leveled descriptions. */
export type RubricCategory = {
    id: string;
    name: string;
    /** Optional section/group header from the source rubric (e.g. "Notebook Organization"). */
    section?: string;
    description?: string;
    maxPoints: number;
    levels: RubricLevel[];
};
/**
 * Competition-agnostic rubric after normalization.
 * Any uploaded PDF/text rubric is converted into this shape before judging.
 */
export type RubricMatrix = {
    title: string;
    sourceName?: string;
    categories: RubricCategory[];
    totalMaxPoints: number;
};
/** Rubric document (Firestore). Source files are temporary during extract only. */
export type NotebookRubric = {
    id: string;
    orgId: string;
    notebookId: string;
    name: string;
    /** Set while extracting from a document; cleared once the matrix is ready. */
    sourceContentType?: string;
    /** Temp GCS key during extract; cleared (and object deleted) when ready. */
    sourceGcsPath?: string;
    matrix?: RubricMatrix;
    status: "uploaded" | "normalizing" | "ready" | "failed";
    error?: string;
    /** Soft-delete timestamp (ISO). When set, rubric is in Trash. */
    deletedAt?: string | null;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
};
export type JudgeCategoryResult = {
    categoryId: string;
    categoryName: string;
    awardedPoints: number;
    maxPoints: number;
    levelId?: string;
    levelLabel?: string;
    rationale: string;
    /**
     * Entry ids extracted from UUIDs cited in `rationale` (not a separate model field).
     * UI prefers inline links in the text; this list is for convenience / older clients.
     */
    entryIds: string[];
};
/** Server judge run result (job type `judge`). */
export type JudgeResult = {
    id: string;
    orgId: string;
    notebookId: string;
    rubricId: string;
    /** Denormalized for history lists. */
    rubricName?: string;
    jobId?: string;
    matrix: RubricMatrix;
    categories: JudgeCategoryResult[];
    totalPoints: number;
    totalMaxPoints: number;
    summary: string;
    status: AuditStatus;
    error?: string;
    createdBy: string;
    createdAt: string;
    updatedAt?: string;
};
/**
 * Async notebook job types.
 * `judge` payload.phase: `"normalize"` (rubric extract only) | `"score"` (notebook judgment).
 */
export type NotebookJobType = "compile" | "judge" | "asset.process" | "audit.run";
export type NotebookJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
/** Firestore `…/jobs/{jobId}` document. */
export type NotebookJob = {
    jobId: string;
    type: NotebookJobType | string;
    status: NotebookJobStatus;
    /** Single-flight key within (notebook, type), e.g. `"notebook"` or `asset:${id}`. */
    resourceKey: string;
    payload: Record<string, unknown>;
    result?: Record<string, unknown>;
    error?: string;
    progress?: number;
    statusMessage?: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    orgId: string;
    notebookId: string;
};
