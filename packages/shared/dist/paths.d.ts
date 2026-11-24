/** Firestore document/collection path helpers (standardized on singular entity names). */
export declare function userPath(uid: string): string;
export declare function orgPath(orgId: string): string;
export declare function orgsCollection(): string;
export declare function memberPath(orgId: string, uid: string): string;
export declare function membersCollection(orgId: string): string;
export declare function teamPath(orgId: string, teamId: string): string;
export declare function teamsCollection(orgId: string): string;
export declare function teamMemberPath(orgId: string, teamId: string, uid: string): string;
export declare function teamMembersCollection(orgId: string, teamId: string): string;
export declare function notebookPath(orgId: string, notebookId: string): string;
export declare function notebooksCollection(orgId: string): string;
export declare function notebookMemberPath(orgId: string, notebookId: string, memberId: string): string;
export declare function notebookMembersCollection(orgId: string, notebookId: string): string;
export declare function entryPath(orgId: string, notebookId: string, entryId: string): string;
export declare function entriesCollection(orgId: string, notebookId: string): string;
export declare function entryCommentPath(orgId: string, notebookId: string, entryId: string, commentId: string): string;
export declare function entryCommentsCollection(orgId: string, notebookId: string, entryId: string): string;
export declare function assetPath(orgId: string, notebookId: string, assetId: string): string;
export declare function assetsCollection(orgId: string, notebookId: string): string;
/** Org-scoped assets (People avatars, public CMS media) — not notebook-scoped. */
export declare function orgAssetPath(orgId: string, assetId: string): string;
export declare function orgAssetsCollection(orgId: string): string;
export declare function rubricPath(orgId: string, notebookId: string, rubricId: string): string;
export declare function rubricsCollection(orgId: string, notebookId: string): string;
export declare function judgmentPath(orgId: string, notebookId: string, judgmentId: string): string;
export declare function judgmentsCollection(orgId: string, notebookId: string): string;
export declare function jobPath(orgId: string, notebookId: string, jobId: string): string;
export declare function jobsCollection(orgId: string, notebookId: string): string;
export declare function compileExportPath(orgId: string, notebookId: string, exportId: string): string;
export declare function compileExportsCollection(orgId: string, notebookId: string): string;
export declare function notebookShareLinkPath(orgId: string, notebookId: string, linkId: string): string;
export declare function notebookShareLinksCollection(orgId: string, notebookId: string): string;
/** Single-flight lock per (type, resourceKey) under a notebook. */
export declare function jobLockPath(orgId: string, notebookId: string, type: string, resourceKey: string): string;
export declare function invitePath(inviteId: string): string;
export declare function invitesCollection(): string;
/** Global uniqueness lookup for public org slugs. */
export declare function orgSlugPath(slug: string): string;
export declare function publicNotebookKeyPath(orgId: string, publicKey: string): string;
export declare function publicNotebookKeysCollection(orgId: string): string;
/** First-class org catalogs (optional `public?: boolean`, default true). */
export declare function donorsCollection(orgId: string): string;
export declare function projectsCollection(orgId: string): string;
export declare function eventsCollection(orgId: string): string;
export declare function socialLinksCollection(orgId: string): string;
/** @deprecated Use donorsCollection — legacy CMS path. */
export declare function publicDonorsCollection(orgId: string): string;
/** @deprecated Use projectsCollection */
export declare function publicProjectsCollection(orgId: string): string;
/** @deprecated Use eventsCollection */
export declare function publicEventsCollection(orgId: string): string;
/** @deprecated Removed — public roster uses member/{uid}.public */
export declare function publicMembersCollection(orgId: string): string;
/** @deprecated Use socialLinksCollection */
export declare function publicSocialCollection(orgId: string): string;
/** GCS object key builders (mirror Firestore nesting). */
export declare const gcsKeys: {
    busytex: (appVersion: string, ...rest: string[]) => string;
    latexTemplate: (appVersion: string, ...rest: string[]) => string;
    asset: (orgId: string, notebookId: string, assetId: string, variant?: "compressed" | "original") => string;
    orgAsset: (orgId: string, assetId: string, variant?: "compressed" | "original") => string;
    yjs: (orgId: string, notebookId: string, entryId: string) => string;
    tipTap: (orgId: string, notebookId: string, entryId: string) => string;
    exportPdf: (orgId: string, notebookId: string, exportId: string) => string;
    rubricSource: (orgId: string, notebookId: string, rubricId: string, ext: string) => string;
};
/** Hocuspocus / Yjs document name — always includes orgId. */
export declare function collabDocName(orgId: string, notebookId: string, entryId: string): string;
export type ParsedCollabDocName = {
    orgId: string;
    notebookId: string;
    entryId: string;
};
export declare function parseCollabDocName(name: string): ParsedCollabDocName | null;
