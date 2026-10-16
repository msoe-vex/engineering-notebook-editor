"use client";

import { getIdToken } from "./firebase";

const coreBase = () =>
  (process.env.NEXT_PUBLIC_CORE_API_URL || "http://localhost:8080").replace(/\/$/, "");
const agentsBase = () =>
  (process.env.NEXT_PUBLIC_AGENTS_API_URL || "http://localhost:8000").replace(/\/$/, "");

async function authHeaders(hasJsonBody: boolean): Promise<HeadersInit> {
  const token = await getIdToken();
  const headers: Record<string, string> = {};
  // Fastify rejects empty bodies when Content-Type is application/json (DELETE/GET).
  if (hasJsonBody) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

async function coreFetch<T>(path: string, init?: RequestInit): Promise<T> {
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

export type OrgSummary = {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
  /** Current user's org role when returned from list/get membership context. */
  role?: string | null;
};
export type MemberSummary = { uid: string; role: string; email?: string; joinedAt?: string };
export type InviteSummary = {
  id: string;
  orgId: string;
  email: string;
  role: string;
  createdAt?: string;
  acceptedAt?: string;
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

export type NotebookSummary = {
  id: string;
  name: string;
  title?: string;
  subtitle?: string;
  logoAssetId?: string;
  folders?: Record<string, { name: string; parentId: string | null; order: number }>;
  access?: NotebookAccess;
  phases?: Record<string, unknown>;
  lastCompiled?: string;
  updatedAt?: string;
  createdAt?: string;
  createdBy?: string;
  orgId?: string;
};

export type NotebookMemberSummary = {
  id: string;
  name: string;
  role: string;
  order: number;
  imageAssetId?: string;
  linkedUid?: string;
};

export const cloudApi = {
  bootstrap: () => coreFetch("/users/me/bootstrap", { method: "POST", body: "{}" }),
  me: () => coreFetch("/users/me"),
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
    coreFetch("/users/me", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  listOrgs: () => coreFetch<OrgSummary[]>("/orgs"),
  createOrg: (name: string) =>
    coreFetch<OrgSummary>("/orgs", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  getOrg: (orgId: string) => coreFetch<OrgSummary>(`/orgs/${orgId}`),
  patchOrg: (orgId: string, body: { name: string }) =>
    coreFetch<OrgSummary>(`/orgs/${orgId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteOrg: (orgId: string) =>
    coreFetch<{ ok: boolean }>(`/orgs/${orgId}`, { method: "DELETE" }),

  listMembers: (orgId: string) => coreFetch<MemberSummary[]>(`/orgs/${orgId}/members`),
  addMember: (orgId: string, body: { uid: string; email?: string; role?: string }) =>
    coreFetch<MemberSummary>(`/orgs/${orgId}/members`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchMember: (orgId: string, uid: string, body: { role: string }) =>
    coreFetch<MemberSummary>(`/orgs/${orgId}/members/${uid}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  removeMember: (orgId: string, uid: string) =>
    coreFetch<{ ok: boolean }>(`/orgs/${orgId}/members/${uid}`, { method: "DELETE" }),

  listInvites: (orgId: string) => coreFetch<InviteSummary[]>(`/orgs/${orgId}/invites`),
  createInvite: (orgId: string, body: { email: string; role?: string }) =>
    coreFetch<InviteSummary>(`/orgs/${orgId}/invites`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteInvite: (orgId: string, inviteId: string) =>
    coreFetch<{ ok: boolean }>(`/orgs/${orgId}/invites/${inviteId}`, { method: "DELETE" }),
  acceptInvite: (inviteId: string) =>
    coreFetch<{ orgId: string }>(`/invites/${inviteId}/accept`, {
      method: "POST",
      body: "{}",
    }),

  listTeams: (orgId: string) => coreFetch<TeamSummary[]>(`/orgs/${orgId}/teams`),
  createTeam: (orgId: string, name: string) =>
    coreFetch<TeamSummary>(`/orgs/${orgId}/teams`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  getTeam: (orgId: string, teamId: string) =>
    coreFetch<TeamSummary>(`/orgs/${orgId}/teams/${teamId}`),
  patchTeam: (orgId: string, teamId: string, body: { name: string }) =>
    coreFetch<TeamSummary>(`/orgs/${orgId}/teams/${teamId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteTeam: (orgId: string, teamId: string) =>
    coreFetch<{ ok: boolean }>(`/orgs/${orgId}/teams/${teamId}`, { method: "DELETE" }),
  listTeamMembers: (orgId: string, teamId: string) =>
    coreFetch<TeamMemberSummary[]>(`/orgs/${orgId}/teams/${teamId}/members`),
  addTeamMember: (orgId: string, teamId: string, uid: string) =>
    coreFetch<TeamMemberSummary>(`/orgs/${orgId}/teams/${teamId}/members/${uid}`, {
      method: "PUT",
      body: "{}",
    }),
  removeTeamMember: (orgId: string, teamId: string, uid: string) =>
    coreFetch<{ ok: boolean }>(`/orgs/${orgId}/teams/${teamId}/members/${uid}`, {
      method: "DELETE",
    }),

  listNotebooks: (orgId: string) => coreFetch<NotebookSummary[]>(`/orgs/${orgId}/notebooks`),
  createNotebook: (
    orgId: string,
    body: string | { name?: string; title?: string; subtitle?: string; access?: NotebookAccess }
  ) =>
    coreFetch<NotebookSummary>(`/orgs/${orgId}/notebooks`, {
      method: "POST",
      body: JSON.stringify(typeof body === "string" ? { name: body } : body),
    }),
  getNotebook: (orgId: string, notebookId: string) =>
    coreFetch<NotebookSummary>(`/orgs/${orgId}/notebooks/${notebookId}`),
  patchNotebook: (orgId: string, notebookId: string, body: unknown) =>
    coreFetch<NotebookSummary>(`/orgs/${orgId}/notebooks/${notebookId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteNotebook: (orgId: string, notebookId: string) =>
    coreFetch<{ ok: boolean }>(`/orgs/${orgId}/notebooks/${notebookId}`, { method: "DELETE" }),

  createFolder: (
    orgId: string,
    notebookId: string,
    body: { name: string; parentId?: string | null; order?: number }
  ) =>
    coreFetch<{
      id: string;
      folder: { name: string; parentId: string | null; order: number };
      folders: Record<string, { name: string; parentId: string | null; order: number }>;
    }>(`/orgs/${orgId}/notebooks/${notebookId}/folders`, {
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
    }>(`/orgs/${orgId}/notebooks/${notebookId}/folders/${folderId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteFolder: (orgId: string, notebookId: string, folderId: string) =>
    coreFetch<{
      ok: boolean;
      folders: Record<string, { name: string; parentId: string | null; order: number }>;
    }>(`/orgs/${orgId}/notebooks/${notebookId}/folders/${folderId}`, { method: "DELETE" }),

  listNotebookMembers: (orgId: string, notebookId: string) =>
    coreFetch<NotebookMemberSummary[]>(`/orgs/${orgId}/notebooks/${notebookId}/members`),
  createNotebookMember: (
    orgId: string,
    notebookId: string,
    body: { name: string; role?: string; order?: number; imageAssetId?: string; linkedUid?: string }
  ) =>
    coreFetch<NotebookMemberSummary>(`/orgs/${orgId}/notebooks/${notebookId}/members`, {
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
      `/orgs/${orgId}/notebooks/${notebookId}/members/${memberId}`,
      { method: "PATCH", body: JSON.stringify(body) }
    ),
  deleteNotebookMember: (orgId: string, notebookId: string, memberId: string) =>
    coreFetch<{ ok: boolean }>(`/orgs/${orgId}/notebooks/${notebookId}/members/${memberId}`, {
      method: "DELETE",
    }),

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
          isValid?: boolean;
          validationErrors?: string[];
          createdAt?: string;
          updatedAt?: string;
        }
      >;
    }>(`/orgs/${orgId}/notebooks/${notebookId}/entries`),
  /** Sibling reindex: explorer → explorerOrder; day → order (same-date tiebreaker). */
  reorderEntries: (
    orgId: string,
    notebookId: string,
    body:
      | { mode: "explorer"; orderedIds: string[]; folderId?: string | null }
      | { mode: "day"; orderedIds: string[]; date?: string }
  ) =>
    coreFetch<{ ok: boolean; mode: string; orderedIds: string[] }>(
      `/orgs/${orgId}/notebooks/${notebookId}/entries/reorder`,
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
    coreFetch<{ id: string }>(`/orgs/${orgId}/notebooks/${notebookId}/entries`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  getEntryContent: (orgId: string, notebookId: string, entryId: string) =>
    coreFetch<unknown>(`/orgs/${orgId}/notebooks/${notebookId}/entries/${entryId}/content`),
  putEntryContent: (orgId: string, notebookId: string, entryId: string, content: unknown) =>
    coreFetch(`/orgs/${orgId}/notebooks/${notebookId}/entries/${entryId}/content`, {
      method: "PUT",
      body: JSON.stringify(content),
    }),
  patchEntry: (orgId: string, notebookId: string, entryId: string, body: unknown) =>
    coreFetch(`/orgs/${orgId}/notebooks/${notebookId}/entries/${entryId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteEntry: (orgId: string, notebookId: string, entryId: string) =>
    coreFetch<{ ok: boolean }>(`/orgs/${orgId}/notebooks/${notebookId}/entries/${entryId}`, {
      method: "DELETE",
    }),

  listAssets: (orgId: string, notebookId: string) =>
    coreFetch<AssetSummary[]>(`/orgs/${orgId}/notebooks/${notebookId}/assets`),
  createAsset: (
    orgId: string,
    notebookId: string,
    body: { contentType?: string; byteSize?: number; usedByEntryId?: string }
  ) =>
    coreFetch<{ asset: AssetSummary; uploadPath: string; uploadUrl: string }>(
      `/orgs/${orgId}/notebooks/${notebookId}/assets`,
      { method: "POST", body: JSON.stringify(body) }
    ),
  getAssetUrl: (orgId: string, notebookId: string, assetId: string) =>
    coreFetch<{ url: string; asset: AssetSummary }>(
      `/orgs/${orgId}/notebooks/${notebookId}/assets/${assetId}/url`
    ),
  deleteAsset: (orgId: string, notebookId: string, assetId: string) =>
    coreFetch<{ ok: boolean }>(`/orgs/${orgId}/notebooks/${notebookId}/assets/${assetId}`, {
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
      `${coreBase()}/orgs/${orgId}/notebooks/${notebookId}/assets/${assetId}/content`,
      { method: "PUT", headers, body }
    );
    if (!res.ok) throw new Error(`asset upload ${res.status} ${await res.text()}`);
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
      // /orgs/:orgId/notebooks/:notebookId/assets/:assetId/content
      return this.uploadAssetContent(parts[2], parts[4], parts[6], bytes, contentType);
    }
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
      Array<{ uid: string; email?: string; platformRole?: string; grants?: { platformAi?: boolean } }>
    >("/api/admin/users"),
  adminMetrics: () => coreFetch<Record<string, number>>("/api/admin/metrics"),
  patchAdminUser: (uid: string, body: unknown) =>
    coreFetch(`/api/admin/users/${uid}`, { method: "PATCH", body: JSON.stringify(body) }),
  async uploadExportPdf(
    orgId: string,
    notebookId: string,
    exportId: string,
    pdf: Uint8Array
  ) {
    const res = await fetch(
      `${coreBase()}/orgs/${orgId}/notebooks/${notebookId}/exports/${exportId}/content`,
      {
        method: "PUT",
        headers: {
          ...(await authHeaders(false)),
          "content-type": "application/pdf",
        },
        body: pdf.slice(),
      }
    );
    if (!res.ok) throw new Error(`export upload ${res.status} ${await res.text()}`);
    return res.json() as Promise<{
      ok: boolean;
      exportId: string;
      lastCompiled: string;
      byteSize: number;
    }>;
  },
  getExportPdfUrl: (orgId: string, notebookId: string, exportId = "latest") =>
    coreFetch<{ url: string; exportId: string }>(
      `/orgs/${orgId}/notebooks/${notebookId}/exports/${exportId}/url`
    ),

  async auditNotebook(
    orgId: string,
    notebookId: string,
    body: { provider?: "byok" | "vertex"; rubric?: string; byokApiKey?: string }
  ) {
    const res = await fetch(`${agentsBase()}/v1/orgs/${orgId}/notebooks/${notebookId}/audit`, {
      method: "POST",
      headers: await authHeaders(true),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async listAudits(orgId: string, notebookId: string) {
    const res = await fetch(`${agentsBase()}/v1/orgs/${orgId}/notebooks/${notebookId}/audits`, {
      headers: await authHeaders(false),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<
      Array<{
        id: string;
        rubric?: string;
        provider?: string;
        summary?: string;
        scores?: Record<string, number>;
        advice?: string[];
        createdAt?: string;
        createdBy?: string;
      }>
    >;
  },
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
