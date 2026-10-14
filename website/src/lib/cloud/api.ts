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
  const res = await fetch(`${coreBase()}${path}`, {
    ...init,
    headers: { ...(await authHeaders(hasJsonBody)), ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${body}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export type OrgSummary = { id: string; name: string; createdAt?: string; updatedAt?: string };
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

export const cloudApi = {
  bootstrap: () => coreFetch("/users/me/bootstrap", { method: "POST", body: "{}" }),
  me: () => coreFetch("/users/me"),

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

  listNotebooks: (orgId: string) =>
    coreFetch<Array<{ id: string; name: string }>>(`/orgs/${orgId}/notebooks`),
  createNotebook: (orgId: string, name: string) =>
    coreFetch<{ id: string; name: string }>(`/orgs/${orgId}/notebooks`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  getNotebook: (orgId: string, notebookId: string) =>
    coreFetch<{
      id: string;
      name: string;
      folders?: Record<string, { name: string; parentId: string | null; order: number }>;
      team?: NotebookSummaryTeam;
      phases?: Record<string, unknown>;
      lastCompiled?: string;
      updatedAt?: string;
    }>(`/orgs/${orgId}/notebooks/${notebookId}`),
  patchNotebook: (orgId: string, notebookId: string, body: unknown) =>
    coreFetch(`/orgs/${orgId}/notebooks/${notebookId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteNotebook: (orgId: string, notebookId: string) =>
    coreFetch<{ ok: boolean }>(`/orgs/${orgId}/notebooks/${notebookId}`, { method: "DELETE" }),

  listEntries: (orgId: string, notebookId: string) =>
    coreFetch<{
      entries: Record<
        string,
        {
          title: string;
          folderId: string | null;
          order: number;
          date: string;
          phase: string | null;
          authors?: string[];
          isTemplate?: boolean;
          createdAt?: string;
          updatedAt?: string;
        }
      >;
    }>(`/orgs/${orgId}/notebooks/${notebookId}/entries`),
  createEntry: (
    orgId: string,
    notebookId: string,
    body?: {
      id?: string;
      title?: string;
      folderId?: string | null;
      order?: number;
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
  deleteAsset: (orgId: string, notebookId: string, assetId: string) =>
    coreFetch<{ ok: boolean }>(`/orgs/${orgId}/notebooks/${notebookId}/assets/${assetId}`, {
      method: "DELETE",
    }),

  adminUsers: () =>
    coreFetch<
      Array<{ uid: string; email?: string; platformRole?: string; grants?: { platformAi?: boolean } }>
    >("/api/admin/users"),
  adminMetrics: () => coreFetch<Record<string, number>>("/api/admin/metrics"),
  patchAdminUser: (uid: string, body: unknown) =>
    coreFetch(`/api/admin/users/${uid}`, { method: "PATCH", body: JSON.stringify(body) }),
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
};

type NotebookSummaryTeam = {
  teamName: string;
  teamNumber: string;
  organization: string;
  members: Record<string, unknown>;
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
