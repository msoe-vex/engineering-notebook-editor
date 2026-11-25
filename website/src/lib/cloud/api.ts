"use client";

import { assertUploadSize } from "@engineering-notebook/shared";
import { getIdToken } from "@/lib/auth/client";
import { dedupeGet, dedupeKey } from "@/lib/cloud/fetchDedupe";

const coreBase = () =>
  (process.env.NEXT_PUBLIC_CORE_API_URL || "http://localhost:8080").replace(/\/$/, "");

function byteLengthOf(bytes: Blob | ArrayBuffer | Uint8Array): number {
  if (bytes instanceof Blob) return bytes.size;
  if (bytes instanceof ArrayBuffer) return bytes.byteLength;
  return bytes.byteLength;
}

async function authHeaders(hasJsonBody: boolean): Promise<HeadersInit> {
  const token = await getIdToken();
  const headers: Record<string, string> = {};
  // Fastify rejects empty bodies when Content-Type is application/json (DELETE/GET).
  if (hasJsonBody) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

async function coreFetchOnce<T>(path: string, init?: RequestInit): Promise<T> {
  const hasJsonBody = init?.body != null && init.body !== "";
  const url = `${coreBase()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { ...(await authHeaders(hasJsonBody)), ...(init?.headers || {}) },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot reach Core API at ${coreBase()} (${detail}). Is docker compose core healthy?`
    );
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${body}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

async function coreFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  if (method !== "GET") {
    return coreFetchOnce<T>(path, init);
  }
  const url = `${coreBase()}${path}`;
  return dedupeGet(dedupeKey(method, url), () => coreFetchOnce<T>(path, init));
}

export type OrgSummary = {
  id: string;
  name: string;
  slug?: string;
  publicPage?: {
    visibility?: "public" | "hidden";
    announcement?: { text: string; href?: string };
    about?: string;
    /** @deprecated Prefer `about`. */
    mission?: string;
    logoAssetId?: string;
    cta?: { title?: string; body?: string; joinUrl?: string; donateUrl?: string };
    /** Section gates; omit/true = on. */
    sections?: {
      about?: boolean;
      donors?: boolean;
      projects?: boolean;
      events?: boolean;
      members?: boolean;
      social?: boolean;
    };
  };
  createdAt?: string;
  updatedAt?: string;
  /** Current user's org role when returned from list/get membership context. */
  role?: string | null;
  memberStatus?: "active" | "alumni";
};
export type MemberSummary = {
  uid: string;
  role: string;
  email?: string;
  displayName?: string;
  /** Credits / public title (not ACL role). */
  title?: string;
  imageAssetId?: string;
  /** Show on public roster; omit/true = public. */
  public?: boolean;
  status?: "active" | "alumni";
  alumniAt?: string;
  joinedAt?: string;
};

export type OrgCatalogSection = "donors" | "projects" | "events" | "social-links";
export type OrgCatalogItem = Record<string, unknown> & {
  id: string;
  public?: boolean;
  imageAssetId?: string;
  order?: number;
};
export type InviteSummary = {
  id: string;
  orgId: string;
  email?: string;
  role: string;
  status?: "pending" | "accepted" | "revoked";
  createdAt?: string;
  acceptedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
  acceptPath?: string;
};
export type AssetSummary = {
  id: string;
  contentType: string;
  byteSize: number;
  gcsPath: string;
  createdBy?: string;
  createdAt?: string;
};

export type TeamSummary = {
  id: string;
  orgId: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
};

export type TeamMemberSummary = { uid: string; joinedAt?: string };

export type NotebookAccess = {
  mode: "org" | "restricted";
  teamIds: string[];
  userIds: string[];
};

export type CloudNotebookSummary = {
  id: string;
  name: string;
  title?: string;
  subtitle?: string;
  logoAssetId?: string;
  folders?: Record<string, { name: string; parentId: string | null; order: number }>;
  access?: NotebookAccess;
  phases?: Record<string, unknown>;
  contributorUids?: string[];
  latestExportId?: string;
  publicExportId?: string;
  updatedAt?: string;
  createdAt?: string;
  createdBy?: string;
  archivedAt?: string | null;
  orgId?: string;
  publicAccess?: "off" | "unlisted" | "public";
  publicKey?: string;
  publishedAt?: string;
  publishedBy?: string;
};

export type CompileExportSummary = {
  id: string;
  createdAt?: string;
  createdBy?: string;
  byteSize?: number;
  label?: string;
};

export type NotebookShareLinkSummary = {
  id: string;
  key: string;
  name: string;
  exportId: string;
  visibility?: "public" | "unlisted";
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  revokedAt?: string | null;
};

export type NotebookMemberSummary = {
  id: string;
  name: string;
  role: string;
  order: number;
  imageAssetId?: string;
  orgMemberUid?: string;
  deletedAt?: string | null;
};

export const cloudApi = {
  bootstrap: (body?: { displayName?: string }) =>
    coreFetch("/user/me/bootstrap", { method: "POST", body: JSON.stringify(body || {}) }),
  me: () => coreFetch("/user/me"),
  patchMe: (body: {
    displayName?: string;
    preferences?: {
      theme?: "light" | "dark" | "system";
      defaultAuthors?: string[];
      genai?: {
        enabled?: boolean;
        provider?: string;
        models?: Record<string, string>;
        baseUrls?: Record<string, string>;
      };
      lastOrgId?: string;
    };
  }) =>
    coreFetch("/user/me", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  addSecondaryEmail: (email: string) =>
    coreFetch<{ secondaryEmails: Array<{ email: string; verified: boolean }> }>(
      "/user/me/secondary-emails",
      { method: "POST", body: JSON.stringify({ email }) }
    ),
  /** Server-side cooldown gate before IdP/Better Auth primary email resend. */
  resendEmailVerificationGate: () =>
    coreFetch<{ ok: boolean; cooldownSec: number }>("/user/me/verification/resend-gate", {
      method: "POST",
      body: "{}",
    }),
  verifySecondaryEmail: (token: string) =>
    coreFetch<{ secondaryEmails: Array<{ email: string; verified: boolean }> }>(
      "/user/me/secondary-emails/verify",
      { method: "POST", body: JSON.stringify({ token }) }
    ),
  removeSecondaryEmail: (email: string) =>
    coreFetch<{ secondaryEmails: Array<{ email: string; verified: boolean }> }>(
      `/user/me/secondary-emails/${encodeURIComponent(email)}`,
      { method: "DELETE" }
    ),

  listOrgs: () => coreFetch<OrgSummary[]>("/org"),
  createOrg: (name: string) =>
    coreFetch<OrgSummary>("/org", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  getOrg: (orgId: string) => coreFetch<OrgSummary>(`/org/${orgId}`),
  patchOrg: (
    orgId: string,
    body: {
      name?: string;
      slug?: string;
      publicPage?: OrgSummary["publicPage"];
    }
  ) =>
    coreFetch<OrgSummary>(`/org/${orgId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteOrg: (orgId: string) =>
    coreFetch<{ ok: boolean }>(`/org/${orgId}`, { method: "DELETE" }),

  listOrgCatalog: (orgId: string, section: OrgCatalogSection) =>
    coreFetch<OrgCatalogItem[]>(`/org/${orgId}/${section}`),
  upsertOrgCatalogItem: (
    orgId: string,
    section: OrgCatalogSection,
    itemId: string,
    body: Record<string, unknown>
  ) =>
    coreFetch<OrgCatalogItem>(`/org/${orgId}/${section}/${itemId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteOrgCatalogItem: (orgId: string, section: OrgCatalogSection, itemId: string) =>
    coreFetch<{ ok: boolean }>(`/org/${orgId}/${section}/${itemId}`, { method: "DELETE" }),

  getPublicOrg: (slug: string) =>
    fetch(`${coreBase()}/public/o/${encodeURIComponent(slug)}`).then(async (r) => {
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    }),
  getPublicPublications: (slug: string) =>
    fetch(`${coreBase()}/public/o/${encodeURIComponent(slug)}/publications`).then(async (r) => {
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<{
        publications: Array<{
          title: string;
          subtitle?: string;
          publication: string;
          url: string;
          updatedAt?: string;
        }>;
      }>;
    }),
  getPublicPublication: (slug: string, key: string) =>
    fetch(`${coreBase()}/public/o/${encodeURIComponent(slug)}/publications/${encodeURIComponent(key)}`).then(
      async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json() as Promise<{
          org: { name: string; slug: string };
          notebook: { title: string; subtitle?: string };
          publication: { name: string; visibility: "unlisted" | "public" };
          url: string;
          noindex: boolean;
        }>;
      }
    ),
  /** JSON helper (`?json=1`); prefer the direct PDF proxy stream for browsers. */
  getPublicPublicationPdfUrl: (slug: string, key: string) =>
    fetch(
      `${coreBase()}/public/o/${encodeURIComponent(slug)}/publications/${encodeURIComponent(key)}/pdf?json=1`
    ).then(async (r) => {
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<{ url: string }>;
    }),

  listMembers: (orgId: string) => coreFetch<MemberSummary[]>(`/org/${orgId}/members`),
  addMember: (orgId: string, body: { uid: string; email?: string; role?: string }) =>
    coreFetch<MemberSummary>(`/org/${orgId}/members`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchMember: (
    orgId: string,
    uid: string,
    body: {
      role?: string;
      status?: "active" | "alumni";
      imageAssetId?: string | null;
      displayName?: string;
      title?: string | null;
      public?: boolean;
    }
  ) =>
    coreFetch<MemberSummary>(`/org/${orgId}/members/${uid}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  removeMember: (orgId: string, uid: string) =>
    coreFetch<{ ok: boolean }>(`/org/${orgId}/members/${uid}`, { method: "DELETE" }),

  listInvites: (orgId: string) => coreFetch<InviteSummary[]>(`/org/${orgId}/invites`),
  createInvite: (
    orgId: string,
    body: { email?: string; role?: string; expiresInDays?: number }
  ) =>
    coreFetch<InviteSummary>(`/org/${orgId}/invites`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteInvite: (orgId: string, inviteId: string) =>
    coreFetch<{ ok: boolean }>(`/org/${orgId}/invites/${inviteId}`, { method: "DELETE" }),
  acceptInvite: (inviteId: string) =>
    coreFetch<{ orgId: string }>(`/invites/${inviteId}/accept`, {
      method: "POST",
      body: "{}",
    }),

  listTeams: (orgId: string) => coreFetch<TeamSummary[]>(`/org/${orgId}/teams`),
  createTeam: (orgId: string, name: string) =>
    coreFetch<TeamSummary>(`/org/${orgId}/teams`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  getTeam: (orgId: string, teamId: string) =>
    coreFetch<TeamSummary>(`/org/${orgId}/teams/${teamId}`),
  patchTeam: (orgId: string, teamId: string, body: { name: string }) =>
    coreFetch<TeamSummary>(`/org/${orgId}/teams/${teamId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteTeam: (orgId: string, teamId: string) =>
    coreFetch<{ ok: boolean }>(`/org/${orgId}/teams/${teamId}`, { method: "DELETE" }),
  listTeamMembers: (orgId: string, teamId: string) =>
    coreFetch<TeamMemberSummary[]>(`/org/${orgId}/teams/${teamId}/members`),
  addTeamMember: (orgId: string, teamId: string, uid: string) =>
    coreFetch<TeamMemberSummary>(`/org/${orgId}/teams/${teamId}/members/${uid}`, {
      method: "PUT",
      body: "{}",
    }),
  removeTeamMember: (orgId: string, teamId: string, uid: string) =>
    coreFetch<{ ok: boolean }>(`/org/${orgId}/teams/${teamId}/members/${uid}`, {
      method: "DELETE",
    }),

  listNotebooks: (orgId: string) => coreFetch<CloudNotebookSummary[]>(`/org/${orgId}/notebooks`),
  createNotebook: (
    orgId: string,
    body: string | { name?: string; title?: string; subtitle?: string; access?: NotebookAccess }
  ) =>
    coreFetch<CloudNotebookSummary>(`/org/${orgId}/notebooks`, {
      method: "POST",
      body: JSON.stringify(typeof body === "string" ? { name: body } : body),
    }),
  getNotebook: (orgId: string, notebookId: string) =>
    coreFetch<CloudNotebookSummary>(`/org/${orgId}/notebook/${notebookId}`),
  patchNotebook: (orgId: string, notebookId: string, body: unknown) =>
    coreFetch<CloudNotebookSummary>(`/org/${orgId}/notebook/${notebookId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteNotebook: (orgId: string, notebookId: string) =>
    coreFetch<{ ok: boolean }>(`/org/${orgId}/notebook/${notebookId}`, { method: "DELETE" }),
  archiveNotebook: (orgId: string, notebookId: string) =>
    coreFetch<CloudNotebookSummary>(`/org/${orgId}/notebook/${notebookId}/archive`, {
      method: "POST",
    }),
  unarchiveNotebook: (orgId: string, notebookId: string) =>
    coreFetch<CloudNotebookSummary>(`/org/${orgId}/notebook/${notebookId}/unarchive`, {
      method: "POST",
    }),

  createFolder: (
    orgId: string,
    notebookId: string,
    body: { name: string; parentId?: string | null; order?: number }
  ) =>
    coreFetch<{
      id: string;
      folder: { name: string; parentId: string | null; order: number };
      folders: Record<string, { name: string; parentId: string | null; order: number }>;
    }>(`/org/${orgId}/notebook/${notebookId}/folders`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchFolder: (
    orgId: string,
    notebookId: string,
    folderId: string,
    body: { name?: string; parentId?: string | null; order?: number }
  ) =>
    coreFetch<{
      id: string;
      folder: { name: string; parentId: string | null; order: number };
      folders: Record<string, { name: string; parentId: string | null; order: number }>;
    }>(`/org/${orgId}/notebook/${notebookId}/folders/${folderId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteFolder: (orgId: string, notebookId: string, folderId: string) =>
    coreFetch<{
      ok: boolean;
      folders: Record<string, { name: string; parentId: string | null; order: number }>;
    }>(`/org/${orgId}/notebook/${notebookId}/folders/${folderId}`, { method: "DELETE" }),

  listNotebookMembers: (orgId: string, notebookId: string, opts?: { trashed?: boolean }) => {
    const q = opts?.trashed ? "?trashed=1" : "";
    return coreFetch<NotebookMemberSummary[]>(
      `/org/${orgId}/notebook/${notebookId}/members${q}`
    );
  },
  createNotebookMember: (
    orgId: string,
    notebookId: string,
    body: {
      name: string;
      role?: string;
      order?: number;
      imageAssetId?: string;
      orgMemberUid?: string;
    }
  ) =>
    coreFetch<NotebookMemberSummary>(`/org/${orgId}/notebook/${notebookId}/members`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchNotebookMember: (
    orgId: string,
    notebookId: string,
    memberId: string,
    body: Partial<NotebookMemberSummary>
  ) =>
    coreFetch<NotebookMemberSummary>(
      `/org/${orgId}/notebook/${notebookId}/members/${memberId}`,
      { method: "PATCH", body: JSON.stringify(body) }
    ),
  deleteNotebookMember: (orgId: string, notebookId: string, memberId: string) =>
    coreFetch<{ ok: boolean; deletedAt?: string }>(
      `/org/${orgId}/notebook/${notebookId}/members/${memberId}`,
      { method: "DELETE" }
    ),
  restoreNotebookMember: (orgId: string, notebookId: string, memberId: string) =>
    coreFetch<NotebookMemberSummary>(
      `/org/${orgId}/notebook/${notebookId}/members/${memberId}/restore`,
      { method: "POST" }
    ),
  purgeNotebookMember: (orgId: string, notebookId: string, memberId: string) =>
    coreFetch<{ ok: boolean }>(
      `/org/${orgId}/notebook/${notebookId}/members/${memberId}/permanent`,
      { method: "DELETE" }
    ),

  listEntries: (orgId: string, notebookId: string) =>
    coreFetch<{
      entries: Record<
        string,
        {
          title: string;
          folderId: string | null;
          order: number;
          explorerOrder?: number;
          date: string;
          phase: string | null;
          authors?: string[];
          assetIds?: string[];
          isTemplate?: boolean;
          hidden?: boolean;
          isValid?: boolean;
          validationErrors?: string[];
          createdAt?: string;
          updatedAt?: string;
          deletedAt?: string | null;
        }
      >;
    }>(`/org/${orgId}/notebook/${notebookId}/entries`),

  /** Server search: metadata always; set includeBody to scan TipTap text (capped). */
  searchEntries: (
    orgId: string,
    notebookId: string,
    q: string,
    opts?: { includeBody?: boolean }
  ) => {
    const params = new URLSearchParams({ q });
    if (opts?.includeBody) params.set("includeBody", "1");
    return coreFetch<{
      q: string;
      includeBody: boolean;
      hits: Array<{
        id: string;
        title?: string;
        authors?: string[];
        phase?: string;
        date?: string;
        match: "meta" | "body" | "both";
        excerpt?: string;
      }>;
    }>(`/org/${orgId}/notebook/${notebookId}/entry/search?${params.toString()}`);
  },

  /** Sibling reindex: explorer → explorerOrder; day → order (same-date tiebreaker). */
  reorderEntries: (
    orgId: string,
    notebookId: string,
    body:
      | { mode: "explorer"; orderedIds: string[]; folderId?: string | null }
      | { mode: "day"; orderedIds: string[]; date?: string }
  ) =>
    coreFetch<{ ok: boolean; mode: string; orderedIds: string[] }>(
      `/org/${orgId}/notebook/${notebookId}/entry/reorder`,
      { method: "POST", body: JSON.stringify(body) }
    ),
  createEntry: (
    orgId: string,
    notebookId: string,
    body?: {
      id?: string;
      title?: string;
      folderId?: string | null;
      order?: number;
      explorerOrder?: number;
      date?: string;
      phase?: string | null;
      authors?: string[];
      isTemplate?: boolean;
    }
  ) =>
    coreFetch<{ id: string }>(`/org/${orgId}/notebook/${notebookId}/entries`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  getEntryContent: (orgId: string, notebookId: string, entryId: string) =>
    coreFetch<unknown>(`/org/${orgId}/notebook/${notebookId}/entry/${entryId}/content`),
  putEntryContent: (orgId: string, notebookId: string, entryId: string, content: unknown) =>
    coreFetch(`/org/${orgId}/notebook/${notebookId}/entry/${entryId}/content`, {
      method: "PUT",
      body: JSON.stringify(content),
    }),
  patchEntry: (orgId: string, notebookId: string, entryId: string, body: unknown) =>
    coreFetch(`/org/${orgId}/notebook/${notebookId}/entry/${entryId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  /** Soft-delete: move entry to Trash (content retained until permanent purge). */
  deleteEntry: (orgId: string, notebookId: string, entryId: string) =>
    coreFetch<{ ok: boolean; deletedAt?: string }>(
      `/org/${orgId}/notebook/${notebookId}/entry/${entryId}`,
      { method: "DELETE" }
    ),
  restoreEntry: (orgId: string, notebookId: string, entryId: string) =>
    coreFetch(`/org/${orgId}/notebook/${notebookId}/entry/${entryId}/restore`, {
      method: "POST",
    }),
  /** Hard-delete TipTap/Yjs + metadata (empty trash / delete forever). */
  purgeEntry: (orgId: string, notebookId: string, entryId: string) =>
    coreFetch<{ ok: boolean }>(
      `/org/${orgId}/notebook/${notebookId}/entry/${entryId}/permanent`,
      { method: "DELETE" }
    ),

  listEntryComments: (orgId: string, notebookId: string, entryId: string) =>
    coreFetch<
      Array<{
        id: string;
        entryId: string;
        body: string;
        createdBy: string;
        createdAt: string;
        updatedAt?: string;
        resolvedAt?: string | null;
        resolvedBy?: string | null;
        anchorQuote?: string;
      }>
    >(`/org/${orgId}/notebook/${notebookId}/entry/${entryId}/comments`),
  createEntryComment: (
    orgId: string,
    notebookId: string,
    entryId: string,
    body: { body: string; anchorQuote?: string; id?: string; mentionedUids?: string[] }
  ) =>
    coreFetch<{ id: string; body: string; createdAt: string }>(
      `/org/${orgId}/notebook/${notebookId}/entry/${entryId}/comments`,
      { method: "POST", body: JSON.stringify(body) }
    ),
  patchEntryComment: (
    orgId: string,
    notebookId: string,
    entryId: string,
    commentId: string,
    body: { body?: string; resolved?: boolean }
  ) =>
    coreFetch(
      `/org/${orgId}/notebook/${notebookId}/entry/${entryId}/comments/${commentId}`,
      { method: "PATCH", body: JSON.stringify(body) }
    ),
  deleteEntryComment: (
    orgId: string,
    notebookId: string,
    entryId: string,
    commentId: string
  ) =>
    coreFetch<{ ok: boolean }>(
      `/org/${orgId}/notebook/${notebookId}/entry/${entryId}/comments/${commentId}`,
      { method: "DELETE" }
    ),

  listAssets: (orgId: string, notebookId: string) =>
    coreFetch<AssetSummary[]>(`/org/${orgId}/notebook/${notebookId}/assets`),
  createAsset: (
    orgId: string,
    notebookId: string,
    body: { contentType?: string; byteSize?: number; usedByEntryId?: string }
  ) =>
    coreFetch<{ asset: AssetSummary; uploadPath: string; uploadUrl: string }>(
      `/org/${orgId}/notebook/${notebookId}/assets`,
      { method: "POST", body: JSON.stringify(body) }
    ),
  getAssetUrl: (orgId: string, notebookId: string, assetId: string) =>
    coreFetch<{ url: string; asset: AssetSummary }>(
      `/org/${orgId}/notebook/${notebookId}/assets/${assetId}/url`
    ),
  deleteAsset: (orgId: string, notebookId: string, assetId: string) =>
    coreFetch<{ ok: boolean }>(`/org/${orgId}/notebook/${notebookId}/assets/${assetId}`, {
      method: "DELETE",
    }),
  /** Authenticated upload through Core (avoids browser → fake-gcs CORS / wrong host). */
  async uploadAssetContent(
    orgId: string,
    notebookId: string,
    assetId: string,
    bytes: Blob | ArrayBuffer | Uint8Array,
    contentType: string
  ) {
    assertUploadSize(byteLengthOf(bytes), "File");
    const body: BodyInit =
      bytes instanceof Blob
        ? bytes
        : bytes instanceof ArrayBuffer
          ? bytes
          : new Blob([new Uint8Array(bytes)]);
    const token = await getIdToken();
    const headers: Record<string, string> = { "content-type": contentType };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(
      `${coreBase()}/org/${orgId}/notebook/${notebookId}/assets/${assetId}/content`,
      { method: "PUT", headers, body }
    );
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 413) {
        throw new Error("File is too large for the server to accept.");
      }
      throw new Error(`asset upload ${res.status} ${text}`);
    }
  },

  listOrgAssets: (orgId: string) => coreFetch<AssetSummary[]>(`/org/${orgId}/assets`),
  createOrgAsset: (orgId: string, body: { contentType?: string; byteSize?: number }) =>
    coreFetch<{ asset: AssetSummary; uploadPath: string; uploadUrl: string }>(
      `/org/${orgId}/assets`,
      { method: "POST", body: JSON.stringify(body) }
    ),
  getOrgAssetUrl: (orgId: string, assetId: string) =>
    coreFetch<{ url: string; asset: AssetSummary }>(`/org/${orgId}/assets/${assetId}/url`),
  deleteOrgAsset: (orgId: string, assetId: string) =>
    coreFetch<{ ok: boolean }>(`/org/${orgId}/assets/${assetId}`, { method: "DELETE" }),
  async uploadOrgAssetContent(
    orgId: string,
    assetId: string,
    bytes: Blob | ArrayBuffer | Uint8Array,
    contentType: string
  ) {
    assertUploadSize(byteLengthOf(bytes), "File");
    const body: BodyInit =
      bytes instanceof Blob
        ? bytes
        : bytes instanceof ArrayBuffer
          ? bytes
          : new Blob([new Uint8Array(bytes)]);
    const token = await getIdToken();
    const headers: Record<string, string> = { "content-type": contentType };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${coreBase()}/org/${orgId}/assets/${assetId}/content`, {
      method: "PUT",
      headers,
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 413) {
        throw new Error("File is too large for the server to accept.");
      }
      throw new Error(`org asset upload ${res.status} ${text}`);
    }
  },
  /** @deprecated Prefer uploadAssetContent — signed fake-gcs URLs fail in the browser. */
  async uploadAssetBytes(
    uploadUrl: string,
    bytes: Blob | ArrayBuffer | Uint8Array,
    contentType: string
  ) {
    if (uploadUrl.startsWith("/") || uploadUrl.startsWith(coreBase())) {
      const path = uploadUrl.startsWith("/")
        ? uploadUrl
        : uploadUrl.slice(coreBase().length);
      const parts = path.split("/");
      // /org/:orgId/notebook/:notebookId/assets/:assetId/content
      return this.uploadAssetContent(parts[2], parts[4], parts[6], bytes, contentType);
    }
    assertUploadSize(byteLengthOf(bytes), "File");
    const body: BodyInit =
      bytes instanceof Blob
        ? bytes
        : bytes instanceof ArrayBuffer
          ? bytes
          : new Blob([new Uint8Array(bytes)]);
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-type": contentType },
      body,
    });
    if (!res.ok) throw new Error(`asset upload ${res.status}`);
  },

  adminUsers: () =>
    coreFetch<
      Array<{
        uid: string;
        email?: string;
        displayName?: string;
        platformRole?: string;
        grants?: { platformAi?: boolean };
        createdAt?: string;
        updatedAt?: string;
      }>
    >("/api/admin/user"),
  adminMetrics: () => coreFetch<Record<string, number>>("/api/admin/metrics"),
  adminOrgs: () =>
    coreFetch<
      Array<{
        id: string;
        name: string;
        slug?: string;
        createdAt?: string;
        createdBy?: string;
        membersCount?: number;
        notebooksCount?: number;
        publicPage?: { visibility?: string };
      }>
    >("/api/admin/org"),
  patchAdminUser: (uid: string, body: unknown) =>
    coreFetch(`/api/admin/user/${uid}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteAdminUser: (uid: string) =>
    coreFetch<{ status: string; uid: string }>(`/api/admin/user/${uid}`, { method: "DELETE" }),
  async uploadExportPdf(
    orgId: string,
    notebookId: string,
    exportId: string,
    pdf: Uint8Array
  ) {
    assertUploadSize(pdf.byteLength, "Compiled PDF");
    const res = await fetch(
      `${coreBase()}/org/${orgId}/notebook/${notebookId}/exports/${exportId}/content`,
      {
        method: "PUT",
        headers: {
          ...(await authHeaders(false)),
          "content-type": "application/pdf",
        },
        body: pdf.slice(),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 413) {
        throw new Error("Compiled PDF is too large for the server to accept.");
      }
      throw new Error(`export upload ${res.status} ${text}`);
    }
    return res.json() as Promise<{
      ok: boolean;
      exportId: string;
      createdAt?: string;
      byteSize: number;
    }>;
  },
  listCompileExports: (orgId: string, notebookId: string) =>
    coreFetch<{
      exports: CompileExportSummary[];
      latestExportId?: string | null;
      publicExportId?: string | null;
      publicAccess?: "off" | "unlisted" | "public";
      publicKey?: string | null;
    }>(`/org/${orgId}/notebook/${notebookId}/exports`),
  getExportPdfUrl: (orgId: string, notebookId: string, exportId = "latest") =>
    coreFetch<{ url: string; exportId: string }>(
      `/org/${orgId}/notebook/${notebookId}/exports/${exportId}/url`
    ),
  downloadExportPdfBlob: async (orgId: string, notebookId: string, exportId = "latest"): Promise<Blob> => {
    const res = await fetch(
      `${coreBase()}/org/${orgId}/notebook/${notebookId}/exports/${exportId}/pdf`,
      {
        headers: await authHeaders(false),
      }
    );
    if (!res.ok) throw new Error(`Failed to load PDF (${res.status})`);
    return await res.blob();
  },
  deleteCompileExport: (orgId: string, notebookId: string, exportId: string) =>
    coreFetch<{
      ok: boolean;
      latestExportId: string | null;
      publicExportId: string | null;
      publicAccess: "off" | "unlisted" | "public";
    }>(`/org/${orgId}/notebook/${notebookId}/exports/${exportId}`, {
      method: "DELETE",
    }),
  saveCompileExport: (
    orgId: string,
    notebookId: string,
    body?: { label?: string | null }
  ) =>
    coreFetch<{ ok: boolean; export: CompileExportSummary }>(
      `/org/${orgId}/notebook/${notebookId}/exports/save`,
      { method: "POST", body: JSON.stringify(body || {}) }
    ),
  patchCompileExport: (
    orgId: string,
    notebookId: string,
    exportId: string,
    body: { label?: string | null }
  ) =>
    coreFetch<CompileExportSummary>(
      `/org/${orgId}/notebook/${notebookId}/exports/${exportId}`,
      { method: "PATCH", body: JSON.stringify(body) }
    ),

  listShareLinks: (orgId: string, notebookId: string, opts?: { includeRevoked?: boolean }) => {
    const q = opts?.includeRevoked ? "?includeRevoked=1" : "";
    return coreFetch<{ links: NotebookShareLinkSummary[] }>(
      `/org/${orgId}/notebook/${notebookId}/share-links${q}`
    );
  },
  createShareLink: (
    orgId: string,
    notebookId: string,
    body: { name: string; exportId: string; visibility?: "public" | "unlisted" }
  ) =>
    coreFetch<NotebookShareLinkSummary>(`/org/${orgId}/notebook/${notebookId}/share-links`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchShareLink: (
    orgId: string,
    notebookId: string,
    linkId: string,
    body: { name?: string; exportId?: string; visibility?: "public" | "unlisted" }
  ) =>
    coreFetch<NotebookShareLinkSummary>(
      `/org/${orgId}/notebook/${notebookId}/share-links/${linkId}`,
      { method: "PATCH", body: JSON.stringify(body) }
    ),
  revokeShareLink: (orgId: string, notebookId: string, linkId: string) =>
    coreFetch<{ ok: boolean; link: NotebookShareLinkSummary }>(
      `/org/${orgId}/notebook/${notebookId}/share-links/${linkId}`,
      { method: "DELETE" }
    ),

  /**
   * Enqueue server XeLaTeX compile job.
   * - 202 → new jobId
   * - 409 → job already in flight (same jobId; attach to SSE)
   * - 503 → worker not configured
   */
  async startCompile(
    orgId: string,
    notebookId: string
  ): Promise<{ jobId: string; inFlight?: boolean }> {
    const url = `${coreBase()}/org/${orgId}/notebook/${notebookId}/compile`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: await authHeaders(true),
        body: "{}",
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Cannot reach Core API at ${coreBase()} (${detail}).`);
    }
    const bodyText = await res.text();
    let data: { jobId?: string; error?: string; message?: string } = {};
    try {
      data = bodyText ? (JSON.parse(bodyText) as typeof data) : {};
    } catch {
      /* non-JSON */
    }
    if (res.status === 409 && data.jobId) {
      return { jobId: data.jobId, inFlight: true };
    }
    if (res.status === 503) {
      throw new Error(
        data.message ||
          data.error ||
          "Server compile is not configured. Start the Compose compile service."
      );
    }
    if (!res.ok) {
      throw new Error(`${res.status} ${bodyText || data.error || "compile failed"}`);
    }
    if (!data.jobId) throw new Error("compile response missing jobId");
    return { jobId: data.jobId };
  },

  getJob: (orgId: string, notebookId: string, jobId: string) =>
    coreFetch<{ job: Record<string, unknown> }>(
      `/org/${orgId}/notebook/${notebookId}/jobs/${jobId}`
    ),

  startJob: (
    orgId: string,
    notebookId: string,
    body: { type: string; resourceKey?: string; payload?: Record<string, unknown> }
  ) =>
    coreFetch<{ ok: boolean; jobId: string; job?: Record<string, unknown> }>(
      `/org/${orgId}/notebook/${notebookId}/jobs`,
      { method: "POST", body: JSON.stringify(body) }
    ),

  aiComplete: (body: { prompt: string; temperature?: number; model?: string }) =>
    coreFetch<{ provider: "vertex"; model: string; text: string }>("/ai/complete", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  listRubrics: (orgId: string, notebookId: string, opts?: { trashed?: boolean }) =>
    coreFetch<RubricRecord[]>(
      `/org/${orgId}/notebook/${notebookId}/rubrics${opts?.trashed ? "?trashed=1" : ""}`
    ),

  getRubric: (orgId: string, notebookId: string, rubricId: string) =>
    coreFetch<RubricRecord>(`/org/${orgId}/notebook/${notebookId}/rubric/${rubricId}`),

  trashRubric: (orgId: string, notebookId: string, rubricId: string) =>
    coreFetch<{ ok: boolean; deletedAt?: string }>(
      `/org/${orgId}/notebook/${notebookId}/rubric/${rubricId}`,
      { method: "DELETE" }
    ),

  restoreRubric: (orgId: string, notebookId: string, rubricId: string) =>
    coreFetch<RubricRecord>(
      `/org/${orgId}/notebook/${notebookId}/rubric/${rubricId}/restore`,
      { method: "POST" }
    ),

  purgeRubric: (orgId: string, notebookId: string, rubricId: string) =>
    coreFetch<{ ok: boolean }>(
      `/org/${orgId}/notebook/${notebookId}/rubric/${rubricId}/permanent`,
      { method: "DELETE" }
    ),

  createCustomRubric: (
    orgId: string,
    notebookId: string,
    body?: { name?: string; matrix?: RubricMatrixPayload }
  ) =>
    coreFetch<RubricRecord>(`/org/${orgId}/notebook/${notebookId}/rubric/custom`, {
      method: "POST",
      body: JSON.stringify(body || {}),
    }),

  updateRubric: (
    orgId: string,
    notebookId: string,
    rubricId: string,
    body: { name?: string; matrix?: RubricMatrixPayload }
  ) =>
    coreFetch<RubricRecord>(`/org/${orgId}/notebook/${notebookId}/rubric/${rubricId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  async uploadRubric(
    orgId: string,
    notebookId: string,
    file: File | Blob,
    name?: string
  ): Promise<RubricRecord> {
    const headers = (await authHeaders(false)) as Record<string, string>;
    // Prefer a known type so Core's raw body parser matches (empty File.type breaks some browsers).
    const contentType =
      (file instanceof File && file.type) ||
      (typeof (file as Blob).type === "string" && (file as Blob).type) ||
      "application/octet-stream";
    headers["content-type"] = contentType;
    if (name) headers["x-rubric-name"] = name;
    const q = name ? `?name=${encodeURIComponent(name)}` : "";
    let res: Response;
    try {
      res = await fetch(
        `${coreBase()}/org/${orgId}/notebook/${notebookId}/rubrics${q}`,
        { method: "POST", headers, body: file }
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Cannot reach Core to upload rubric (${detail}). Is Core running at ${coreBase()}?`
      );
    }
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return (await res.json()) as RubricRecord;
  },

  async normalizeRubric(
    orgId: string,
    notebookId: string,
    rubricId: string,
    body: {
      inference?: "vertex" | "byok";
      byok?: { provider: "openai" | "anthropic" | "gemini"; apiKey: string; model: string };
    }
  ): Promise<{ jobId: string; rubricId: string; inFlight?: boolean }> {
    const url = `${coreBase()}/org/${orgId}/notebook/${notebookId}/rubric/${rubricId}/normalize`;
    const res = await fetch(url, {
      method: "POST",
      headers: await authHeaders(true),
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: { jobId?: string; rubricId?: string; error?: string; message?: string } = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      /* ignore */
    }
    if (res.status === 409 && data.jobId) {
      return { jobId: data.jobId, rubricId, inFlight: true };
    }
    if (!res.ok) {
      throw new Error(data.message || data.error || `${res.status} ${text}`);
    }
    if (!data.jobId) throw new Error("normalize response incomplete");
    return { jobId: data.jobId, rubricId: data.rubricId || rubricId };
  },

  /**
   * Start document extract. Draft is hidden until ready; source file is discarded after success.
   * On failure the draft is deleted.
   */
  async extractRubricFromDocument(
    orgId: string,
    notebookId: string,
    file: File | Blob,
    body: {
      name?: string;
      inference?: "vertex" | "byok";
      byok?: { provider: "openai" | "anthropic" | "gemini"; apiKey: string; model: string };
    }
  ): Promise<{ jobId: string; rubricId: string }> {
    const name =
      body.name ||
      (file instanceof File ? file.name.replace(/\.[^.]+$/, "") || file.name : undefined);
    const doc = await cloudApi.uploadRubric(orgId, notebookId, file, name);
    try {
      const result = await cloudApi.normalizeRubric(orgId, notebookId, doc.id, {
        inference: body.inference,
        byok: body.byok,
      });
      return { jobId: result.jobId, rubricId: doc.id };
    } catch (err) {
      // Best-effort cleanup if enqueue failed before the job ran.
      try {
        await cloudApi.purgeRubric(orgId, notebookId, doc.id);
      } catch {
        /* ignore */
      }
      throw err;
    }
  },

  listJudgments: (orgId: string, notebookId: string) =>
    coreFetch<JudgmentRecord[]>(`/org/${orgId}/notebook/${notebookId}/judgments`),

  getJudgment: (orgId: string, notebookId: string, judgmentId: string) =>
    coreFetch<JudgmentRecord>(
      `/org/${orgId}/notebook/${notebookId}/judgments/${judgmentId}`
    ),

  deleteJudgment: (orgId: string, notebookId: string, judgmentId: string) =>
    coreFetch<{ ok: boolean }>(
      `/org/${orgId}/notebook/${notebookId}/judgments/${judgmentId}`,
      { method: "DELETE" }
    ),

  clearJudgments: (orgId: string, notebookId: string) =>
    coreFetch<{ ok: boolean; deleted: number }>(
      `/org/${orgId}/notebook/${notebookId}/judgments`,
      { method: "DELETE" }
    ),

  async startJudge(
    orgId: string,
    notebookId: string,
    body: {
      rubricId: string;
      inference?: "vertex" | "byok";
      byok?: { provider: "openai" | "anthropic" | "gemini"; apiKey: string; model: string };
    }
  ): Promise<{ jobId: string; judgmentId: string; inFlight?: boolean }> {
    const url = `${coreBase()}/org/${orgId}/notebook/${notebookId}/judge`;
    const res = await fetch(url, {
      method: "POST",
      headers: await authHeaders(true),
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: { jobId?: string; judgmentId?: string; error?: string; message?: string } = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      /* ignore */
    }
    if (res.status === 409 && data.jobId) {
      return { jobId: data.jobId, judgmentId: data.judgmentId || "", inFlight: true };
    }
    if (!res.ok) {
      throw new Error(data.message || data.error || `${res.status} ${text}`);
    }
    if (!data.jobId || !data.judgmentId) throw new Error("judge response incomplete");
    return { jobId: data.jobId, judgmentId: data.judgmentId };
  },
};

export type RubricLevelPayload = {
  id: string;
  label: string;
  description: string;
  points: number;
};

export type RubricCategoryPayload = {
  id: string;
  name: string;
  section?: string;
  description?: string;
  maxPoints: number;
  levels: RubricLevelPayload[];
};

export type RubricMatrixPayload = {
  title: string;
  sourceName?: string;
  totalMaxPoints: number;
  categories: RubricCategoryPayload[];
};

export type RubricRecord = {
  id: string;
  name?: string;
  sourceContentType?: string;
  sourceGcsPath?: string;
  status?: string;
  matrix?: RubricMatrixPayload;
  error?: string;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type JudgmentRecord = {
  id: string;
  rubricId?: string;
  rubricName?: string;
  jobId?: string;
  status?: string;
  summary?: string;
  totalPoints?: number;
  totalMaxPoints?: number;
  matrix?: RubricMatrixPayload;
  categories?: Array<{
    categoryId: string;
    categoryName: string;
    awardedPoints: number;
    maxPoints: number;
    levelId?: string;
    levelLabel?: string;
    rationale: string;
    entryIds: string[];
  }>;
  error?: string;
  createdAt?: string;
};

export function collabWsUrl(): string {
  return process.env.NEXT_PUBLIC_COLLAB_WS_URL || "ws://localhost:1234";
}

export function assetsBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_ASSETS_BASE_URL ||
    process.env.NEXT_PUBLIC_CORE_API_URL ||
    "http://localhost:8080"
  ).replace(/\/$/, "");
}
