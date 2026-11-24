/** Firestore document/collection path helpers (standardized on singular entity names). */

export function userPath(uid: string): string {
  return `user/${uid}`;
}

export function orgPath(orgId: string): string {
  return `org/${orgId}`;
}

export function orgsCollection(): string {
  return "org";
}

export function memberPath(orgId: string, uid: string): string {
  return `org/${orgId}/member/${uid}`;
}

export function membersCollection(orgId: string): string {
  return `org/${orgId}/member`;
}

export function teamPath(orgId: string, teamId: string): string {
  return `org/${orgId}/team/${teamId}`;
}

export function teamsCollection(orgId: string): string {
  return `org/${orgId}/team`;
}

export function teamMemberPath(orgId: string, teamId: string, uid: string): string {
  return `org/${orgId}/team/${teamId}/member/${uid}`;
}

export function teamMembersCollection(orgId: string, teamId: string): string {
  return `org/${orgId}/team/${teamId}/member`;
}

export function notebookPath(orgId: string, notebookId: string): string {
  return `org/${orgId}/notebook/${notebookId}`;
}

export function notebooksCollection(orgId: string): string {
  return `org/${orgId}/notebook`;
}

export function notebookMemberPath(orgId: string, notebookId: string, memberId: string): string {
  return `org/${orgId}/notebook/${notebookId}/member/${memberId}`;
}

export function notebookMembersCollection(orgId: string, notebookId: string): string {
  return `org/${orgId}/notebook/${notebookId}/member`;
}

export function entryPath(orgId: string, notebookId: string, entryId: string): string {
  return `org/${orgId}/notebook/${notebookId}/entry/${entryId}`;
}

export function entriesCollection(orgId: string, notebookId: string): string {
  return `org/${orgId}/notebook/${notebookId}/entry`;
}

export function entryCommentPath(
  orgId: string,
  notebookId: string,
  entryId: string,
  commentId: string
): string {
  return `org/${orgId}/notebook/${notebookId}/entry/${entryId}/comment/${commentId}`;
}

export function entryCommentsCollection(
  orgId: string,
  notebookId: string,
  entryId: string
): string {
  return `org/${orgId}/notebook/${notebookId}/entry/${entryId}/comment`;
}

export function assetPath(orgId: string, notebookId: string, assetId: string): string {
  return `org/${orgId}/notebook/${notebookId}/asset/${assetId}`;
}

export function assetsCollection(orgId: string, notebookId: string): string {
  return `org/${orgId}/notebook/${notebookId}/asset`;
}

/** Org-scoped assets (People avatars, public CMS media) — not notebook-scoped. */
export function orgAssetPath(orgId: string, assetId: string): string {
  return `org/${orgId}/asset/${assetId}`;
}

export function orgAssetsCollection(orgId: string): string {
  return `org/${orgId}/asset`;
}

export function rubricPath(orgId: string, notebookId: string, rubricId: string): string {
  return `org/${orgId}/notebook/${notebookId}/rubric/${rubricId}`;
}

export function rubricsCollection(orgId: string, notebookId: string): string {
  return `org/${orgId}/notebook/${notebookId}/rubric`;
}

export function judgmentPath(orgId: string, notebookId: string, judgmentId: string): string {
  return `org/${orgId}/notebook/${notebookId}/judgment/${judgmentId}`;
}

export function judgmentsCollection(orgId: string, notebookId: string): string {
  return `org/${orgId}/notebook/${notebookId}/judgment`;
}

export function jobPath(orgId: string, notebookId: string, jobId: string): string {
  return `org/${orgId}/notebook/${notebookId}/job/${jobId}`;
}

export function jobsCollection(orgId: string, notebookId: string): string {
  return `org/${orgId}/notebook/${notebookId}/job`;
}

export function compileExportPath(orgId: string, notebookId: string, exportId: string): string {
  return `org/${orgId}/notebook/${notebookId}/compileExport/${exportId}`;
}

export function compileExportsCollection(orgId: string, notebookId: string): string {
  return `org/${orgId}/notebook/${notebookId}/compileExport`;
}

export function notebookShareLinkPath(orgId: string, notebookId: string, linkId: string): string {
  return `org/${orgId}/notebook/${notebookId}/shareLink/${linkId}`;
}

export function notebookShareLinksCollection(orgId: string, notebookId: string): string {
  return `org/${orgId}/notebook/${notebookId}/shareLink`;
}

/** Single-flight lock per (type, resourceKey) under a notebook. */
export function jobLockPath(
  orgId: string,
  notebookId: string,
  type: string,
  resourceKey: string
): string {
  const safe = `${type}__${resourceKey}`.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `org/${orgId}/notebook/${notebookId}/jobLock/${safe}`;
}

export function invitePath(inviteId: string): string {
  return `invite/${inviteId}`;
}

export function invitesCollection(): string {
  return "invite";
}

/** Global uniqueness lookup for public org slugs. */
export function orgSlugPath(slug: string): string {
  return `orgSlug/${slug}`;
}

export function publicNotebookKeyPath(orgId: string, publicKey: string): string {
  return `org/${orgId}/publicNotebookKey/${publicKey}`;
}

export function publicNotebookKeysCollection(orgId: string): string {
  return `org/${orgId}/publicNotebookKey`;
}

/** First-class org catalogs (optional `public?: boolean`, default true). */
export function donorsCollection(orgId: string): string {
  return `org/${orgId}/donor`;
}

export function projectsCollection(orgId: string): string {
  return `org/${orgId}/project`;
}

export function eventsCollection(orgId: string): string {
  return `org/${orgId}/event`;
}

export function socialLinksCollection(orgId: string): string {
  return `org/${orgId}/socialLink`;
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

/** @deprecated Removed — public roster uses member/{uid}.public */
export function publicMembersCollection(orgId: string): string {
  return `org/${orgId}/publicMember`;
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
    `org/${orgId}/notebook/${notebookId}/asset/${assetId}/${variant}`,
  orgAsset: (orgId: string, assetId: string, variant: "compressed" | "original" = "compressed") =>
    `org/${orgId}/asset/${assetId}/${variant}`,
  yjs: (orgId: string, notebookId: string, entryId: string) =>
    `org/${orgId}/notebook/${notebookId}/yjs/${entryId}.ydoc`,
  tipTap: (orgId: string, notebookId: string, entryId: string) =>
    `org/${orgId}/notebook/${notebookId}/entry/${entryId}.json`,
  exportPdf: (orgId: string, notebookId: string, exportId: string) =>
    `org/${orgId}/notebook/${notebookId}/export/${exportId}.pdf`,
  rubricSource: (orgId: string, notebookId: string, rubricId: string, ext: string) =>
    `org/${orgId}/notebook/${notebookId}/rubric/${rubricId}/source${ext.startsWith(".") ? ext : `.${ext}`}`,
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
