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

export function assetPath(orgId: string, notebookId: string, assetId: string): string {
  return `organizations/${orgId}/notebooks/${notebookId}/assets/${assetId}`;
}

export function assetsCollection(orgId: string, notebookId: string): string {
  return `organizations/${orgId}/notebooks/${notebookId}/assets`;
}

export function auditPath(orgId: string, notebookId: string, auditId: string): string {
  return `organizations/${orgId}/notebooks/${notebookId}/audits/${auditId}`;
}

export function auditsCollection(orgId: string, notebookId: string): string {
  return `organizations/${orgId}/notebooks/${notebookId}/audits`;
}

export function jobPath(orgId: string, notebookId: string, jobId: string): string {
  return `organizations/${orgId}/notebooks/${notebookId}/jobs/${jobId}`;
}

export function jobsCollection(orgId: string, notebookId: string): string {
  return `organizations/${orgId}/notebooks/${notebookId}/jobs`;
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

/** GCS object key builders (mirror Firestore nesting). */
export const gcsKeys = {
  busytex: (appVersion: string, ...rest: string[]) =>
    ["static", "busytex", appVersion, ...rest].join("/"),
  latexTemplate: (appVersion: string, ...rest: string[]) =>
    ["static", "latex-template", appVersion, ...rest].join("/"),
  asset: (orgId: string, notebookId: string, assetId: string, variant: "compressed" | "original" = "compressed") =>
    `organizations/${orgId}/notebooks/${notebookId}/assets/${assetId}/${variant}`,
  yjs: (orgId: string, notebookId: string, entryId: string) =>
    `organizations/${orgId}/notebooks/${notebookId}/yjs/${entryId}.ydoc`,
  tipTap: (orgId: string, notebookId: string, entryId: string) =>
    `organizations/${orgId}/notebooks/${notebookId}/entries/${entryId}.json`,
  exportPdf: (orgId: string, notebookId: string, exportId: string) =>
    `organizations/${orgId}/notebooks/${notebookId}/exports/${exportId}.pdf`,
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
