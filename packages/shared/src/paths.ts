/** Firestore document/collection path helpers (nested under organizations). */

export function userPath(uid: string): string {
  return `users/${uid}`;
}

export function orgPath(orgId: string): string {
  return `organizations/${orgId}`;
}

export function memberPath(orgId: string, uid: string): string {
  return `organizations/${orgId}/members/${uid}`;
}

export function membersCollection(orgId: string): string {
  return `organizations/${orgId}/members`;
}

export function teamPath(orgId: string, teamId: string): string {
  return `organizations/${orgId}/teams/${teamId}`;
}

export function teamsCollection(orgId: string): string {
  return `organizations/${orgId}/teams`;
}

export function teamMemberPath(orgId: string, teamId: string, uid: string): string {
  return `organizations/${orgId}/teams/${teamId}/members/${uid}`;
}

export function teamMembersCollection(orgId: string, teamId: string): string {
  return `organizations/${orgId}/teams/${teamId}/members`;
}

export function notebookPath(orgId: string, notebookId: string): string {
  return `organizations/${orgId}/notebooks/${notebookId}`;
}

export function notebooksCollection(orgId: string): string {
  return `organizations/${orgId}/notebooks`;
}

export function notebookMemberPath(orgId: string, notebookId: string, memberId: string): string {
  return `organizations/${orgId}/notebooks/${notebookId}/members/${memberId}`;
}

export function notebookMembersCollection(orgId: string, notebookId: string): string {
  return `organizations/${orgId}/notebooks/${notebookId}/members`;
}

export function entryPath(orgId: string, notebookId: string, entryId: string): string {
  return `organizations/${orgId}/notebooks/${notebookId}/entries/${entryId}`;
}

export function entriesCollection(orgId: string, notebookId: string): string {
  return `organizations/${orgId}/notebooks/${notebookId}/entries`;
}

export function entryCommentPath(
  orgId: string,
  notebookId: string,
  entryId: string,
  commentId: string
): string {
  return `organizations/${orgId}/notebooks/${notebookId}/entries/${entryId}/comments/${commentId}`;
}

export function entryCommentsCollection(
  orgId: string,
  notebookId: string,
  entryId: string
): string {
  return `organizations/${orgId}/notebooks/${notebookId}/entries/${entryId}/comments`;
}

export function assetPath(orgId: string, notebookId: string, assetId: string): string {
  return `organizations/${orgId}/notebooks/${notebookId}/assets/${assetId}`;
}

export function assetsCollection(orgId: string, notebookId: string): string {
  return `organizations/${orgId}/notebooks/${notebookId}/assets`;
}

/** Org-scoped assets (People avatars, public CMS media) — not notebook-scoped. */
export function orgAssetPath(orgId: string, assetId: string): string {
  return `organizations/${orgId}/assets/${assetId}`;
}

export function orgAssetsCollection(orgId: string): string {
  return `organizations/${orgId}/assets`;
}

export function rubricPath(orgId: string, notebookId: string, rubricId: string): string {
  return `organizations/${orgId}/notebooks/${notebookId}/rubrics/${rubricId}`;
}

export function rubricsCollection(orgId: string, notebookId: string): string {
  return `organizations/${orgId}/notebooks/${notebookId}/rubrics`;
}

export function judgmentPath(orgId: string, notebookId: string, judgmentId: string): string {
  return `organizations/${orgId}/notebooks/${notebookId}/judgments/${judgmentId}`;
}

export function judgmentsCollection(orgId: string, notebookId: string): string {
  return `organizations/${orgId}/notebooks/${notebookId}/judgments`;
}

export function jobPath(orgId: string, notebookId: string, jobId: string): string {
  return `organizations/${orgId}/notebooks/${notebookId}/jobs/${jobId}`;
}

export function jobsCollection(orgId: string, notebookId: string): string {
  return `organizations/${orgId}/notebooks/${notebookId}/jobs`;
}

export function compileExportPath(orgId: string, notebookId: string, exportId: string): string {
  return `organizations/${orgId}/notebooks/${notebookId}/compileExports/${exportId}`;
}

export function compileExportsCollection(orgId: string, notebookId: string): string {
  return `organizations/${orgId}/notebooks/${notebookId}/compileExports`;
}

/** Single-flight lock per (type, resourceKey) under a notebook. */
export function jobLockPath(
  orgId: string,
  notebookId: string,
  type: string,
  resourceKey: string
): string {
  const safe = `${type}__${resourceKey}`.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `organizations/${orgId}/notebooks/${notebookId}/jobLocks/${safe}`;
}

export function invitePath(inviteId: string): string {
  return `invites/${inviteId}`;
}

/** Global uniqueness lookup for public org slugs. */
export function orgSlugPath(slug: string): string {
  return `orgSlugs/${slug}`;
}

export function publicNotebookKeyPath(orgId: string, publicKey: string): string {
  return `organizations/${orgId}/publicNotebookKeys/${publicKey}`;
}

export function publicNotebookKeysCollection(orgId: string): string {
  return `organizations/${orgId}/publicNotebookKeys`;
}

/** First-class org catalogs (optional `public?: boolean`, default true). */
export function donorsCollection(orgId: string): string {
  return `organizations/${orgId}/donors`;
}

export function projectsCollection(orgId: string): string {
  return `organizations/${orgId}/projects`;
}

export function eventsCollection(orgId: string): string {
  return `organizations/${orgId}/events`;
}

export function socialLinksCollection(orgId: string): string {
  return `organizations/${orgId}/socialLinks`;
}

/** @deprecated Use donorsCollection — legacy CMS path. */
export function publicDonorsCollection(orgId: string): string {
  return donorsCollection(orgId);
}

/** @deprecated Use projectsCollection */
export function publicProjectsCollection(orgId: string): string {
  return projectsCollection(orgId);
}

/** @deprecated Use eventsCollection */
export function publicEventsCollection(orgId: string): string {
  return eventsCollection(orgId);
}

/** @deprecated Removed — public roster uses members/{uid}.public */
export function publicMembersCollection(orgId: string): string {
  return `organizations/${orgId}/publicMembers`;
}

/** @deprecated Use socialLinksCollection */
export function publicSocialCollection(orgId: string): string {
  return socialLinksCollection(orgId);
}

/** GCS object key builders (mirror Firestore nesting). */
export const gcsKeys = {
  busytex: (appVersion: string, ...rest: string[]) =>
    ["static", "busytex", appVersion, ...rest].join("/"),
  latexTemplate: (appVersion: string, ...rest: string[]) =>
    ["static", "latex-template", appVersion, ...rest].join("/"),
  asset: (orgId: string, notebookId: string, assetId: string, variant: "compressed" | "original" = "compressed") =>
    `organizations/${orgId}/notebooks/${notebookId}/assets/${assetId}/${variant}`,
  orgAsset: (orgId: string, assetId: string, variant: "compressed" | "original" = "compressed") =>
    `organizations/${orgId}/assets/${assetId}/${variant}`,
  yjs: (orgId: string, notebookId: string, entryId: string) =>
    `organizations/${orgId}/notebooks/${notebookId}/yjs/${entryId}.ydoc`,
  tipTap: (orgId: string, notebookId: string, entryId: string) =>
    `organizations/${orgId}/notebooks/${notebookId}/entries/${entryId}.json`,
  exportPdf: (orgId: string, notebookId: string, exportId: string) =>
    `organizations/${orgId}/notebooks/${notebookId}/exports/${exportId}.pdf`,
  rubricSource: (orgId: string, notebookId: string, rubricId: string, ext: string) =>
    `organizations/${orgId}/notebooks/${notebookId}/rubrics/${rubricId}/source${ext.startsWith(".") ? ext : `.${ext}`}`,
};

/** Hocuspocus / Yjs document name — always includes orgId. */
export function collabDocName(orgId: string, notebookId: string, entryId: string): string {
  return `org:${orgId}:notebook:${notebookId}:entry:${entryId}`;
}

export type ParsedCollabDocName = {
  orgId: string;
  notebookId: string;
  entryId: string;
};

export function parseCollabDocName(name: string): ParsedCollabDocName | null {
  const match = /^org:([^:]+):notebook:([^:]+):entry:(.+)$/.exec(name);
  if (!match) return null;
  return { orgId: match[1], notebookId: match[2], entryId: match[3] };
}
