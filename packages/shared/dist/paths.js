/** Firestore document/collection path helpers (nested under organizations). */
export function userPath(uid) {
    return `users/${uid}`;
}
export function orgPath(orgId) {
    return `organizations/${orgId}`;
}
export function memberPath(orgId, uid) {
    return `organizations/${orgId}/members/${uid}`;
}
export function membersCollection(orgId) {
    return `organizations/${orgId}/members`;
}
export function teamPath(orgId, teamId) {
    return `organizations/${orgId}/teams/${teamId}`;
}
export function teamsCollection(orgId) {
    return `organizations/${orgId}/teams`;
}
export function teamMemberPath(orgId, teamId, uid) {
    return `organizations/${orgId}/teams/${teamId}/members/${uid}`;
}
export function teamMembersCollection(orgId, teamId) {
    return `organizations/${orgId}/teams/${teamId}/members`;
}
export function notebookPath(orgId, notebookId) {
    return `organizations/${orgId}/notebooks/${notebookId}`;
}
export function notebooksCollection(orgId) {
    return `organizations/${orgId}/notebooks`;
}
export function notebookMemberPath(orgId, notebookId, memberId) {
    return `organizations/${orgId}/notebooks/${notebookId}/members/${memberId}`;
}
export function notebookMembersCollection(orgId, notebookId) {
    return `organizations/${orgId}/notebooks/${notebookId}/members`;
}
export function entryPath(orgId, notebookId, entryId) {
    return `organizations/${orgId}/notebooks/${notebookId}/entries/${entryId}`;
}
export function entriesCollection(orgId, notebookId) {
    return `organizations/${orgId}/notebooks/${notebookId}/entries`;
}
export function entryCommentPath(orgId, notebookId, entryId, commentId) {
    return `organizations/${orgId}/notebooks/${notebookId}/entries/${entryId}/comments/${commentId}`;
}
export function entryCommentsCollection(orgId, notebookId, entryId) {
    return `organizations/${orgId}/notebooks/${notebookId}/entries/${entryId}/comments`;
}
export function assetPath(orgId, notebookId, assetId) {
    return `organizations/${orgId}/notebooks/${notebookId}/assets/${assetId}`;
}
export function assetsCollection(orgId, notebookId) {
    return `organizations/${orgId}/notebooks/${notebookId}/assets`;
}
/** Org-scoped assets (People avatars, public CMS media) — not notebook-scoped. */
export function orgAssetPath(orgId, assetId) {
    return `organizations/${orgId}/assets/${assetId}`;
}
export function orgAssetsCollection(orgId) {
    return `organizations/${orgId}/assets`;
}
export function rubricPath(orgId, notebookId, rubricId) {
    return `organizations/${orgId}/notebooks/${notebookId}/rubrics/${rubricId}`;
}
export function rubricsCollection(orgId, notebookId) {
    return `organizations/${orgId}/notebooks/${notebookId}/rubrics`;
}
export function judgmentPath(orgId, notebookId, judgmentId) {
    return `organizations/${orgId}/notebooks/${notebookId}/judgments/${judgmentId}`;
}
export function judgmentsCollection(orgId, notebookId) {
    return `organizations/${orgId}/notebooks/${notebookId}/judgments`;
}
export function jobPath(orgId, notebookId, jobId) {
    return `organizations/${orgId}/notebooks/${notebookId}/jobs/${jobId}`;
}
export function jobsCollection(orgId, notebookId) {
    return `organizations/${orgId}/notebooks/${notebookId}/jobs`;
}
export function compileExportPath(orgId, notebookId, exportId) {
    return `organizations/${orgId}/notebooks/${notebookId}/compileExports/${exportId}`;
}
export function compileExportsCollection(orgId, notebookId) {
    return `organizations/${orgId}/notebooks/${notebookId}/compileExports`;
}
export function notebookShareLinkPath(orgId, notebookId, linkId) {
    return `organizations/${orgId}/notebooks/${notebookId}/shareLinks/${linkId}`;
}
export function notebookShareLinksCollection(orgId, notebookId) {
    return `organizations/${orgId}/notebooks/${notebookId}/shareLinks`;
}
/** Single-flight lock per (type, resourceKey) under a notebook. */
export function jobLockPath(orgId, notebookId, type, resourceKey) {
    const safe = `${type}__${resourceKey}`.replace(/[^a-zA-Z0-9._-]/g, "_");
    return `organizations/${orgId}/notebooks/${notebookId}/jobLocks/${safe}`;
}
export function invitePath(inviteId) {
    return `invites/${inviteId}`;
}
/** Global uniqueness lookup for public org slugs. */
export function orgSlugPath(slug) {
    return `orgSlugs/${slug}`;
}
export function publicNotebookKeyPath(orgId, publicKey) {
    return `organizations/${orgId}/publicNotebookKeys/${publicKey}`;
}
export function publicNotebookKeysCollection(orgId) {
    return `organizations/${orgId}/publicNotebookKeys`;
}
/** First-class org catalogs (optional `public?: boolean`, default true). */
export function donorsCollection(orgId) {
    return `organizations/${orgId}/donors`;
}
export function projectsCollection(orgId) {
    return `organizations/${orgId}/projects`;
}
export function eventsCollection(orgId) {
    return `organizations/${orgId}/events`;
}
export function socialLinksCollection(orgId) {
    return `organizations/${orgId}/socialLinks`;
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
/** @deprecated Removed — public roster uses members/{uid}.public */
export function publicMembersCollection(orgId) {
    return `organizations/${orgId}/publicMembers`;
}
/** @deprecated Use socialLinksCollection */
export function publicSocialCollection(orgId) {
    return socialLinksCollection(orgId);
}
/** GCS object key builders (mirror Firestore nesting). */
export const gcsKeys = {
    busytex: (appVersion, ...rest) => ["static", "busytex", appVersion, ...rest].join("/"),
    latexTemplate: (appVersion, ...rest) => ["static", "latex-template", appVersion, ...rest].join("/"),
    asset: (orgId, notebookId, assetId, variant = "compressed") => `organizations/${orgId}/notebooks/${notebookId}/assets/${assetId}/${variant}`,
    orgAsset: (orgId, assetId, variant = "compressed") => `organizations/${orgId}/assets/${assetId}/${variant}`,
    yjs: (orgId, notebookId, entryId) => `organizations/${orgId}/notebooks/${notebookId}/yjs/${entryId}.ydoc`,
    tipTap: (orgId, notebookId, entryId) => `organizations/${orgId}/notebooks/${notebookId}/entries/${entryId}.json`,
    exportPdf: (orgId, notebookId, exportId) => `organizations/${orgId}/notebooks/${notebookId}/exports/${exportId}.pdf`,
    rubricSource: (orgId, notebookId, rubricId, ext) => `organizations/${orgId}/notebooks/${notebookId}/rubrics/${rubricId}/source${ext.startsWith(".") ? ext : `.${ext}`}`,
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
