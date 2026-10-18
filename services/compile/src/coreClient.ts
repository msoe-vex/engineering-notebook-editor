export type CompileSnapshot = {
  orgId: string;
  notebookId: string;
  notebook: {
    id: string;
    name?: string;
    title?: string;
    subtitle?: string;
    logoAssetId?: string;
    phases?: Record<
      string,
      { name: string; description?: string; iconName?: string; color?: string; order: number }
    >;
    lastCompiled?: string;
  };
  members: Array<{
    id: string;
    name: string;
    role?: string;
    order?: number;
    imageAssetId?: string;
  }>;
  entries: Record<
    string,
    {
      title?: string;
      authors?: string[];
      phase?: string | null;
      createdAt?: string;
      updatedAt?: string;
      date?: string;
      order?: number;
      isTemplate?: boolean;
      assetIds?: string[];
      deletedAt?: string | null;
      tipTap: unknown;
    }
  >;
  assets: Record<string, { contentType: string; base64: string }>;
};

function coreBase(): string {
  return (process.env.CORE_API_URL || "http://core:8080").replace(/\/$/, "");
}

function internalHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra || {}) };
  const secret = process.env.INTERNAL_SERVICE_SECRET;
  if (secret) headers["x-internal-secret"] = secret;
  return headers;
}

export async function fetchCompileSnapshot(
  orgId: string,
  notebookId: string
): Promise<CompileSnapshot> {
  const url = `${coreBase()}/internal/compile/snapshot?orgId=${encodeURIComponent(orgId)}&notebookId=${encodeURIComponent(notebookId)}`;
  const res = await fetch(url, { headers: internalHeaders({ Accept: "application/json" }) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`snapshot ${res.status}: ${text}`);
  }
  return (await res.json()) as CompileSnapshot;
}

export async function uploadCompileExport(
  orgId: string,
  notebookId: string,
  pdf: Buffer,
  jobId?: string
): Promise<{ lastCompiled: string }> {
  const q = new URLSearchParams({ orgId, notebookId, exportId: "latest" });
  if (jobId) q.set("jobId", jobId);
  const url = `${coreBase()}/internal/compile/export?${q.toString()}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: internalHeaders({ "content-type": "application/pdf" }),
    body: new Uint8Array(pdf),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`export upload ${res.status}: ${text}`);
  }
  return (await res.json()) as { lastCompiled: string };
}

export async function reportCompileFailed(
  orgId: string,
  notebookId: string,
  error: string,
  jobId?: string
): Promise<void> {
  const url = `${coreBase()}/internal/compile/failed`;
  await fetch(url, {
    method: "POST",
    headers: internalHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ orgId, notebookId, error, jobId }),
  }).catch(() => undefined);
}

export async function reportCompileProgress(
  orgId: string,
  notebookId: string,
  jobId: string,
  status: string,
  progress: number
): Promise<void> {
  const url = `${coreBase()}/internal/compile/progress`;
  await fetch(url, {
    method: "POST",
    headers: internalHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ orgId, notebookId, jobId, status, progress }),
  }).catch(() => undefined);
}
