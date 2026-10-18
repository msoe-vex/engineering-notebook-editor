/** Firestore document/collection path helpers (nested under organizations). */
export declare function userPath(uid: string): string;
export declare function orgPath(orgId: string): string;
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
export declare function assetPath(orgId: string, notebookId: string, assetId: string): string;
export declare function assetsCollection(orgId: string, notebookId: string): string;
export declare function auditPath(orgId: string, notebookId: string, auditId: string): string;
export declare function auditsCollection(orgId: string, notebookId: string): string;
export declare function jobPath(orgId: string, notebookId: string, jobId: string): string;
export declare function jobsCollection(orgId: string, notebookId: string): string;
/** Single-flight lock per (type, resourceKey) under a notebook. */
export declare function jobLockPath(orgId: string, notebookId: string, type: string, resourceKey: string): string;
export declare function invitePath(inviteId: string): string;
/** GCS object key builders (mirror Firestore nesting). */
export declare const gcsKeys: {
    busytex: (appVersion: string, ...rest: string[]) => string;
    latexTemplate: (appVersion: string, ...rest: string[]) => string;
    asset: (orgId: string, notebookId: string, assetId: string, variant?: "compressed" | "original") => string;
    yjs: (orgId: string, notebookId: string, entryId: string) => string;
    tipTap: (orgId: string, notebookId: string, entryId: string) => string;
    exportPdf: (orgId: string, notebookId: string, exportId: string) => string;
};
/** Hocuspocus / Yjs document name — always includes orgId. */
export declare function collabDocName(orgId: string, notebookId: string, entryId: string): string;
export type ParsedCollabDocName = {
    orgId: string;
    notebookId: string;
    entryId: string;
};
export declare function parseCollabDocName(name: string): ParsedCollabDocName | null;
