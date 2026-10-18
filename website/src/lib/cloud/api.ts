"use client";

import { assertUploadSize } from "@engineering-notebook/shared";
import { getIdToken } from "./firebase";

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
    body: Partial<Omit<NotebookMemberSummary, "linkedUid">> & { linkedUid?: string | null }
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
          deletedAt?: string | null;
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
  /** Soft-delete: move entry to Trash (content retained until permanent purge). */
  deleteEntry: (orgId: string, notebookId: string, entryId: string) =>
    coreFetch<{ ok: boolean; deletedAt?: string }>(
      `/orgs/${orgId}/notebooks/${notebookId}/entries/${entryId}`,
      { method: "DELETE" }
    ),
  restoreEntry: (orgId: string, notebookId: string, entryId: string) =>
    coreFetch(`/orgs/${orgId}/notebooks/${notebookId}/entries/${entryId}/restore`, {
      method: "POST",
    }),
  /** Hard-delete TipTap/Yjs + metadata (empty trash / delete forever). */
  purgeEntry: (orgId: string, notebookId: string, entryId: string) =>
    coreFetch<{ ok: boolean }>(
      `/orgs/${orgId}/notebooks/${notebookId}/entries/${entryId}/permanent`,
      { method: "DELETE" }
    ),

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
      `${coreBase()}/orgs/${orgId}/notebooks/${notebookId}/assets/${assetId}/content`,
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
    assertUploadSize(pdf.byteLength, "Compiled PDF");
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
      lastCompiled: string;
      byteSize: number;
    }>;
  },
  getExportPdfUrl: (orgId: string, notebookId: string, exportId = "latest") =>
    coreFetch<{ url: string; exportId: string }>(
      `/orgs/${orgId}/notebooks/${notebookId}/exports/${exportId}/url`
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
    const url = `${coreBase()}/orgs/${orgId}/notebooks/${notebookId}/compile`;
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
      `/orgs/${orgId}/notebooks/${notebookId}/jobs/${jobId}`
    ),

  startJob: (
    orgId: string,
    notebookId: string,
    body: { type: string; resourceKey?: string; payload?: Record<string, unknown> }
  ) =>
    coreFetch<{ ok: boolean; jobId: string; job?: Record<string, unknown> }>(
      `/orgs/${orgId}/notebooks/${notebookId}/jobs`,
      { method: "POST", body: JSON.stringify(body) }
    ),

  aiComplete: (body: { prompt: string; temperature?: number; model?: string }) =>
    coreFetch<{ provider: "vertex"; model: string; text: string }>("/ai/complete", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  startAudit: (
    orgId: string,
    notebookId: string,
    body: { rubric?: string; provider?: "byok" | "vertex" | "local"; status?: "running" }
  ) =>
    coreFetch<AuditRecord>(`/orgs/${orgId}/notebooks/${notebookId}/audits`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  patchAudit: (
    orgId: string,
    notebookId: string,
    auditId: string,
    body: Partial<{
      status: "running" | "completed" | "failed";
      scores: Record<string, number>;
      advice: Array<{ entryId: string | null; message: string }>;
      summary: string;
      steps: Array<{ at: string; message: string; entryId?: string | null }>;
      error: string | null;
    }>
  ) =>
    coreFetch<AuditRecord>(`/orgs/${orgId}/notebooks/${notebookId}/audits/${auditId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  getAudit: (orgId: string, notebookId: string, auditId: string) =>
    coreFetch<AuditRecord>(`/orgs/${orgId}/notebooks/${notebookId}/audits/${auditId}`),

  listAudits: (orgId: string, notebookId: string) =>
    coreFetch<AuditRecord[]>(`/orgs/${orgId}/notebooks/${notebookId}/audits`),
};

export type AuditRecord = {
  id: string;
  rubric?: string;
  provider?: string;
  status?: string;
  summary?: string;
  scores?: Record<string, number>;
  advice?: Array<{ entryId: string | null; message: string }>;
  steps?: Array<{ at: string; message: string; entryId?: string | null }>;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
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
