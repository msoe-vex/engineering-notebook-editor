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
export function assetPath(orgId, notebookId, assetId) {
    return `organizations/${orgId}/notebooks/${notebookId}/assets/${assetId}`;
}
export function assetsCollection(orgId, notebookId) {
    return `organizations/${orgId}/notebooks/${notebookId}/assets`;
}
export function auditPath(orgId, notebookId, auditId) {
    return `organizations/${orgId}/notebooks/${notebookId}/audits/${auditId}`;
}
export function auditsCollection(orgId, notebookId) {
    return `organizations/${orgId}/notebooks/${notebookId}/audits`;
}
export function invitePath(inviteId) {
    return `invites/${inviteId}`;
}
/** GCS object key builders (mirror Firestore nesting). */
export const gcsKeys = {
    busytex: (appVersion, ...rest) => ["static", "busytex", appVersion, ...rest].join("/"),
    latexTemplate: (appVersion, ...rest) => ["static", "latex-template", appVersion, ...rest].join("/"),
    asset: (orgId, notebookId, assetId, variant = "compressed") => `organizations/${orgId}/notebooks/${notebookId}/assets/${assetId}/${variant}`,
    yjs: (orgId, notebookId, entryId) => `organizations/${orgId}/notebooks/${notebookId}/yjs/${entryId}.ydoc`,
    tipTap: (orgId, notebookId, entryId) => `organizations/${orgId}/notebooks/${notebookId}/entries/${entryId}.json`,
    exportPdf: (orgId, notebookId, exportId) => `organizations/${orgId}/notebooks/${notebookId}/exports/${exportId}.pdf`,
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
