"use client";

import { getIdToken } from "./firebase";

const coreBase = () =>
  (process.env.NEXT_PUBLIC_CORE_API_URL || "http://localhost:8080").replace(/\/$/, "");
const agentsBase = () =>
  (process.env.NEXT_PUBLIC_AGENTS_API_URL || "http://localhost:8000").replace(/\/$/, "");

async function authHeaders(): Promise<HeadersInit> {
  const token = await getIdToken();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

async function coreFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${coreBase()}${path}`, {
    ...init,
    headers: { ...(await authHeaders()), ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

export const cloudApi = {
  bootstrap: () => coreFetch("/users/me/bootstrap", { method: "POST", body: "{}" }),
  me: () => coreFetch("/users/me"),
  listOrgs: () => coreFetch<Array<{ id: string; name: string }>>("/orgs"),
  createOrg: (name: string) =>
    coreFetch<{ id: string; name: string }>("/orgs", {
      method: "POST",
      body: JSON.stringify({ name }),
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
          createdAt?: string;
          updatedAt?: string;
        }
      >;
    }>(`/orgs/${orgId}/notebooks/${notebookId}/entries`),
  createEntry: (
    orgId: string,
    notebookId: string,
    body?: { id?: string; title?: string; folderId?: string | null; order?: number; date?: string; phase?: string | null; authors?: string[] }
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
  listMembers: (orgId: string) =>
    coreFetch<Array<{ uid: string; role: string; email?: string }>>(`/orgs/${orgId}/members`),
  adminUsers: () =>
    coreFetch<Array<{ uid: string; email?: string; platformRole?: string; grants?: { platformAi?: boolean } }>>(
      "/api/admin/users"
    ),
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
      headers: await authHeaders(),
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
