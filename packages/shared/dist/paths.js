/** Firestore document/collection path helpers (standardized on singular entity names). */
export function userPath(uid) {
    return `user/${uid}`;
}
export function orgPath(orgId) {
    return `org/${orgId}`;
}
export function orgsCollection() {
    return "org";
}
export function memberPath(orgId, uid) {
    return `org/${orgId}/member/${uid}`;
}
export function membersCollection(orgId) {
    return `org/${orgId}/member`;
}
export function teamPath(orgId, teamId) {
    return `org/${orgId}/team/${teamId}`;
}
export function teamsCollection(orgId) {
    return `org/${orgId}/team`;
}
export function teamMemberPath(orgId, teamId, uid) {
    return `org/${orgId}/team/${teamId}/member/${uid}`;
}
export function teamMembersCollection(orgId, teamId) {
    return `org/${orgId}/team/${teamId}/member`;
}
export function notebookPath(orgId, notebookId) {
    return `org/${orgId}/notebook/${notebookId}`;
}
export function notebooksCollection(orgId) {
    return `org/${orgId}/notebook`;
}
export function notebookMemberPath(orgId, notebookId, memberId) {
    return `org/${orgId}/notebook/${notebookId}/member/${memberId}`;
}
export function notebookMembersCollection(orgId, notebookId) {
    return `org/${orgId}/notebook/${notebookId}/member`;
}
export function entryPath(orgId, notebookId, entryId) {
    return `org/${orgId}/notebook/${notebookId}/entry/${entryId}`;
}
export function entriesCollection(orgId, notebookId) {
    return `org/${orgId}/notebook/${notebookId}/entry`;
}
export function entryCommentPath(orgId, notebookId, entryId, commentId) {
    return `org/${orgId}/notebook/${notebookId}/entry/${entryId}/comment/${commentId}`;
}
export function entryCommentsCollection(orgId, notebookId, entryId) {
    return `org/${orgId}/notebook/${notebookId}/entry/${entryId}/comment`;
}
export function assetPath(orgId, notebookId, assetId) {
    return `org/${orgId}/notebook/${notebookId}/asset/${assetId}`;
}
export function assetsCollection(orgId, notebookId) {
    return `org/${orgId}/notebook/${notebookId}/asset`;
}
/** Org-scoped assets (People avatars, public CMS media) — not notebook-scoped. */
export function orgAssetPath(orgId, assetId) {
    return `org/${orgId}/asset/${assetId}`;
}
export function orgAssetsCollection(orgId) {
    return `org/${orgId}/asset`;
}
export function rubricPath(orgId, notebookId, rubricId) {
    return `org/${orgId}/notebook/${notebookId}/rubric/${rubricId}`;
}
export function rubricsCollection(orgId, notebookId) {
    return `org/${orgId}/notebook/${notebookId}/rubric`;
}
export function judgmentPath(orgId, notebookId, judgmentId) {
    return `org/${orgId}/notebook/${notebookId}/judgment/${judgmentId}`;
}
export function judgmentsCollection(orgId, notebookId) {
    return `org/${orgId}/notebook/${notebookId}/judgment`;
}
export function jobPath(orgId, notebookId, jobId) {
    return `org/${orgId}/notebook/${notebookId}/job/${jobId}`;
}
export function jobsCollection(orgId, notebookId) {
    return `org/${orgId}/notebook/${notebookId}/job`;
}
export function compileExportPath(orgId, notebookId, exportId) {
    return `org/${orgId}/notebook/${notebookId}/compileExport/${exportId}`;
}
export function compileExportsCollection(orgId, notebookId) {
    return `org/${orgId}/notebook/${notebookId}/compileExport`;
}
export function notebookShareLinkPath(orgId, notebookId, linkId) {
    return `org/${orgId}/notebook/${notebookId}/shareLink/${linkId}`;
}
export function notebookShareLinksCollection(orgId, notebookId) {
    return `org/${orgId}/notebook/${notebookId}/shareLink`;
}
/** Single-flight lock per (type, resourceKey) under a notebook. */
export function jobLockPath(orgId, notebookId, type, resourceKey) {
    const safe = `${type}__${resourceKey}`.replace(/[^a-zA-Z0-9._-]/g, "_");
    return `org/${orgId}/notebook/${notebookId}/jobLock/${safe}`;
}
export function invitePath(inviteId) {
    return `invite/${inviteId}`;
}
export function invitesCollection() {
    return "invite";
}
/** Global uniqueness lookup for public org slugs. */
export function orgSlugPath(slug) {
    return `orgSlug/${slug}`;
}
export function publicNotebookKeyPath(orgId, publicKey) {
    return `org/${orgId}/publicNotebookKey/${publicKey}`;
}
export function publicNotebookKeysCollection(orgId) {
    return `org/${orgId}/publicNotebookKey`;
}
/** First-class org catalogs (optional `public?: boolean`, default true). */
export function donorsCollection(orgId) {
    return `org/${orgId}/donor`;
}
export function projectsCollection(orgId) {
    return `org/${orgId}/project`;
}
export function eventsCollection(orgId) {
    return `org/${orgId}/event`;
}
export function socialLinksCollection(orgId) {
    return `org/${orgId}/socialLink`;
}
/** @deprecated Use donorsCollection — legacy CMS path. */
export function publicDonorsCollection(orgId) {
    return donorsCollection(orgId);
}
/** @deprecated Use projectsCollection */
export function publicProjectsCollection(orgId) {
    return projectsCollection(orgId);
}
/** @deprecated Use eventsCollection */
export function publicEventsCollection(orgId) {
    return eventsCollection(orgId);
}
/** @deprecated Removed — public roster uses member/{uid}.public */
export function publicMembersCollection(orgId) {
    return `org/${orgId}/publicMember`;
}
/** @deprecated Use socialLinksCollection */
export function publicSocialCollection(orgId) {
    return socialLinksCollection(orgId);
}
/** GCS object key builders (mirror Firestore nesting). */
export const gcsKeys = {
    busytex: (appVersion, ...rest) => ["static", "busytex", appVersion, ...rest].join("/"),
    latexTemplate: (appVersion, ...rest) => ["static", "latex-template", appVersion, ...rest].join("/"),
    asset: (orgId, notebookId, assetId, variant = "compressed") => `org/${orgId}/notebook/${notebookId}/asset/${assetId}/${variant}`,
    orgAsset: (orgId, assetId, variant = "compressed") => `org/${orgId}/asset/${assetId}/${variant}`,
    yjs: (orgId, notebookId, entryId) => `org/${orgId}/notebook/${notebookId}/yjs/${entryId}.ydoc`,
    tipTap: (orgId, notebookId, entryId) => `org/${orgId}/notebook/${notebookId}/entry/${entryId}.json`,
    exportPdf: (orgId, notebookId, exportId) => `org/${orgId}/notebook/${notebookId}/export/${exportId}.pdf`,
    rubricSource: (orgId, notebookId, rubricId, ext) => `org/${orgId}/notebook/${notebookId}/rubric/${rubricId}/source${ext.startsWith(".") ? ext : `.${ext}`}`,
};
/** Hocuspocus / Yjs document name — always includes orgId. */
export function collabDocName(orgId, notebookId, entryId) {
    return `org:${orgId}:notebook:${notebookId}:entry:${entryId}`;
}
export function parseCollabDocName(name) {
    const match = /^org:([^:]+):notebook:([^:]+):entry:(.+)$/.exec(name);
    if (!match)
        return null;
    return { orgId: match[1], notebookId: match[2], entryId: match[3] };
}
