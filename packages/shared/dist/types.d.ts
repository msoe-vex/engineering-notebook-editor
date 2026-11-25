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
export type SecondaryEmail = {
    email: string;
    verified: boolean;
    verifiedAt?: string;
    /** Opaque verify token (server-only; omit from public responses when possible). */
    verifyToken?: string;
    addedAt: string;
};
export type UserProfile = {
    uid: string;
    email?: string;
    displayName?: string;
    platformRole?: PlatformRole;
    grants?: UserGrants;
    preferences?: UserPreferences;
    /** Additional emails for invite matching once verified. */
    secondaryEmails?: SecondaryEmail[];
    createdAt: string;
    updatedAt: string;
};
/** Which public-site sections are enabled. Missing keys default to true. */
export type OrgPublicSections = {
    about?: boolean;
    donors?: boolean;
    projects?: boolean;
    events?: boolean;
    members?: boolean;
    social?: boolean;
    publications?: boolean;
};
export type OrgPublicPage = {
    visibility: "public" | "hidden";
    announcement?: {
        text: string;
        href?: string;
    };
    /**
     * About blurb on the public home (UI label “About”).
     * Legacy field name `mission` kept for stored docs; prefer writing `about`.
     */
    about?: string;
    /** @deprecated Prefer `about` — still read for older documents. */
    mission?: string;
    /** Org logo for public header (org-scoped asset id). */
    logoAssetId?: string;
    /** Call-to-action block: join / donate buttons on public home. */
    cta?: {
        title?: string;
        body?: string;
        joinUrl?: string;
        donateUrl?: string;
    };
    /**
     * Section-level gates for the public site. Omit or true ⇒ section may appear
     * (still filtered by per-item `public`). False hides the whole section.
     */
    sections?: OrgPublicSections;
};
export type OrgPublicSectionKey = keyof OrgPublicSections;
/** Section enabled on the public site? Default true. */
export declare function isPublicSection(page: OrgPublicPage | null | undefined, key: OrgPublicSectionKey): boolean;
export type Organization = {
    id: string;
    name: string;
    /** Globally unique public URL slug (`/o/:slug`). */
    slug?: string;
    publicPage?: OrgPublicPage;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
};
export type OrgMemberStatus = "active" | "alumni";
export type OrgMember = {
    uid: string;
    role: OrgRole;
    email?: string;
    displayName?: string;
    /**
     * Credits / public-facing title (e.g. “Captain”, “Programmer”).
     * Distinct from ACL `role` (owner/admin/member).
     */
    title?: string;
    /** Org member avatar (asset id). */
    imageAssetId?: string;
    /**
     * Show on the public org roster. Missing or true ⇒ public; false ⇒ org-only.
     */
    public?: boolean;
    /** Missing ⇒ active (back-compat). */
    status?: OrgMemberStatus;
    alumniAt?: string;
    joinedAt: string;
};
/** Whether a catalog/member record appears on the public site. Default true. */
export declare function isPublicRecord(doc: {
    public?: boolean;
} | null | undefined): boolean;
/**
 * Record is visible publicly when the section is on and the item is public.
 * Default both true.
 */
export declare function isListedOnPublicSite(page: OrgPublicPage | null | undefined, section: OrgPublicSectionKey, doc: {
    public?: boolean;
} | null | undefined): boolean;
export type OrgDonor = {
    id: string;
    name: string;
    url?: string;
    tier?: string;
    imageAssetId?: string;
    order?: number;
    public?: boolean;
    updatedAt?: string;
};
export type OrgProject = {
    id: string;
    title: string;
    season?: string;
    summary?: string;
    highlights?: string[];
    externalUrl?: string;
    imageAssetId?: string;
    order?: number;
    public?: boolean;
    updatedAt?: string;
};
export type OrgEvent = {
    id: string;
    title: string;
    kind?: string;
    location?: string;
    date?: string;
    day?: string;
    time?: string;
    imageAssetId?: string;
    order?: number;
    public?: boolean;
    updatedAt?: string;
};
export type OrgSocialLink = {
    id: string;
    label: string;
    url: string;
    imageAssetId?: string;
    order?: number;
    public?: boolean;
    updatedAt?: string;
};
/** Invite lifecycle. Legacy docs without `status` derive from `acceptedAt`. */
export type InviteStatus = "pending" | "accepted" | "revoked";
export type Invite = {
    id: string;
    orgId: string;
    email?: string;
    role: OrgRole;
    /** Defaults to pending when omitted (older documents). */
    status?: InviteStatus;
    createdBy: string;
    createdAt: string;
    expiresAt?: string;
    acceptedAt?: string;
    revokedAt?: string;
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
/**
 * @deprecated Prefer `NotebookSummary.contributorUids` (org member uids only).
 * Legacy roster docs may still exist until purged.
 */
export type NotebookMember = {
    id: string;
    name: string;
    role: string;
    order: number;
    imageAssetId?: string;
    orgMemberUid?: string;
    deletedAt?: string | null;
};
export type ProjectPhase = {
    name: string;
    description: string;
    iconName: string;
    color: string;
    order: number;
    /** Soft-hide from pickers; entries may still reference the phase id. */
    deletedAt?: string | null;
};
/**
 * Entry metadata in Firestore.
 *
 * Ordering is intentionally split:
 * - `date` + `order` → compile / calendar sequence (date primary; `order` is same-day tiebreaker, rearranged in calendar)
 * - `folderId` + `explorerOrder` → file-explorer tree (sibling position within a folder; unrelated to compile)
 */
/** Current entry metadata (`schemaVersion` 5). */
export type EntryMetadata = {
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
    /**
     * When true, entry stays in the explorer but is omitted from competition PDF compile.
     * Distinct from trash (`deletedAt`) and templates (`isTemplate`).
     */
    hidden?: boolean;
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
    /** Denormalized open (unresolved) comment thread count for explorer filters. */
    openCommentCount?: number;
    /** Denormalized total comment threads (including resolved). */
    commentCount?: number;
};
/** Entry comment thread body (MetadataStore). Anchor lives in TipTap as `commentAnchor` mark. */
export type EntryComment = {
    id: string;
    entryId: string;
    body: string;
    createdBy: string;
    createdAt: string;
    updatedAt?: string;
    resolvedAt?: string | null;
    resolvedBy?: string | null;
    /** Optional quote snapshot at create time (not used for positioning). */
    anchorQuote?: string;
    /** Org member uids @mentioned in the body (NotificationPort targets). */
    mentionedUids?: string[];
};
/** Current notebook summary (`schemaVersion` 5). */
export type NotebookSummary = {
    schemaVersion: typeof NOTEBOOK_SCHEMA_VERSION;
    orgId: string;
    name: string;
    title?: string;
    subtitle?: string;
    logoAssetId?: string;
    folders: Record<string, NotebookFolder>;
    access?: NotebookAccess;
    phases?: Record<string, ProjectPhase>;
    /**
     * Ordered org member uids for notebook credits.
     * Display name / title / photo come from `organizations/…/members/{uid}`.
     */
    contributorUids?: string[];
    /** Most recent compile export id (PDF version). */
    latestExportId?: string;
    /** Compile export id served on the public notebook link (PDF-only). */
    publicExportId?: string;
    updatedAt: string;
    createdAt?: string;
    createdBy?: string;
    archivedAt?: string | null;
    /**
     * Share link: `off` (default) or `unlisted` (anyone with the link → PDF).
     * Legacy stored value `public` is treated as `unlisted`.
     */
    publicAccess?: "off" | "unlisted" | "public";
    /** Per-org key for `/o/:orgSlug/n/:publicKey` */
    publicKey?: string;
    publishedAt?: string;
    publishedBy?: string;
};
/** One compiled PDF version under a notebook. */
export type CompileExport = {
    id: string;
    createdAt: string;
    createdBy?: string;
    byteSize: number;
    /** Optional user-facing name (e.g. "Submit v3"). */
    label?: string;
};
/**
 * Explicit public PDF share link. URL: `/o/:orgSlug/n/:key`.
 * Independent of notebook id; points at one compile export version.
 */
export type NotebookShareLink = {
    id: string;
    /** Unguessable token in the public URL (UUID). */
    key: string;
    /** User-facing name (e.g. "Judges", "Draft"). */
    name: string;
    /** Compile export id this link serves. */
    exportId: string;
    /**
     * Visibility on public listings:
     * - "unlisted" (default): Accessible to anyone with the link, but not listed in public catalog/notebooks query.
     * - "public": Listed in the organization's public notebooks query / catalog.
     */
    visibility?: "unlisted" | "public";
    createdAt: string;
    createdBy?: string;
    updatedAt?: string;
    /** Set when revoked; omitted/null while active. */
    revokedAt?: string | null;
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
/** Run lifecycle for judge grades (and similar async product runs). */
export type JudgmentStatus = "running" | "completed" | "failed";
/** ZIP / export envelope (no TipTap bodies). */
export type NotebookExport = {
    schemaVersion: typeof NOTEBOOK_SCHEMA_VERSION;
    name: string;
    title?: string;
    subtitle?: string;
    logoAssetId?: string;
    folders: Record<string, NotebookFolder>;
    access?: NotebookAccess;
    phases?: Record<string, ProjectPhase>;
    members?: Record<string, Omit<NotebookMember, "id">>;
    entries: Record<string, EntryMetadata>;
};
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
/** Server judge grade / past run (job type `judge`, Firestore `judgments/{id}`). */
export type Judgment = {
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
    status: JudgmentStatus;
    error?: string;
    createdBy: string;
    createdAt: string;
    updatedAt?: string;
};
/**
 * Async notebook job types.
 * `judge` payload.phase: `"normalize"` (rubric extract only) | `"score"` (notebook judgment).
 */
export type NotebookJobType = "compile" | "judge" | "asset.process";
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
