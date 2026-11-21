import { randomUUID } from "node:crypto";
import {
  MAX_COMPILE_EXPORTS,
  compileExportPath,
  compileExportsCollection,
  gcsKeys,
  notebookPath,
  type CompileExport,
  type NotebookSummary,
} from "@engineering-notebook/shared";
import { getMetadataStore } from "../db/metadataStore.js";
import { omitUndefined } from "../db/sanitize.js";
import type { StoragePort } from "../storage/storagePort.js";

function nowIso() {
  return new Date().toISOString();
}

/** Delete PDF bytes + metadata for one compile export id (not the `latest` alias key alone). */
export async function deleteCompileExportFiles(
  orgId: string,
  notebookId: string,
  exportId: string,
  storage: StoragePort
): Promise<void> {
  if (!exportId || exportId === "latest") return;
  const store = getMetadataStore();
  try {
    await storage.deleteObject(gcsKeys.exportPdf(orgId, notebookId, exportId));
  } catch {
    /* missing object ok */
  }
  try {
    await store.delete(compileExportPath(orgId, notebookId, exportId));
  } catch {
    /* missing doc ok */
  }
}

export async function countCompileExports(orgId: string, notebookId: string): Promise<number> {
  const store = getMetadataStore();
  const rows = await store.query(compileExportsCollection(orgId, notebookId));
  return rows.length;
}

/**
 * Persist a compiled PDF as a new versioned export + keep `latest.pdf` for serving.
 * Refuses when the notebook already has {@link MAX_COMPILE_EXPORTS} versions.
 */
export async function recordCompileExport(opts: {
  orgId: string;
  notebookId: string;
  storage: StoragePort;
  pdf: Buffer;
  createdBy?: string;
  /** When provided (and not "latest"), use as version id; otherwise mint one. */
  exportId?: string;
}): Promise<{
  exportId: string;
  createdAt: string;
  byteSize: number;
  exportMeta: CompileExport;
}> {
  const { orgId, notebookId, storage, pdf, createdBy } = opts;
  const existingCount = await countCompileExports(orgId, notebookId);
  if (existingCount >= MAX_COMPILE_EXPORTS) {
    throw Object.assign(
      new Error(
        `Version limit reached (${MAX_COMPILE_EXPORTS}). Delete an older PDF before compiling again.`
      ),
      { statusCode: 409, code: "compile_export_limit" }
    );
  }

  const exportId =
    opts.exportId && opts.exportId !== "latest" ? opts.exportId : randomUUID();
  const ts = nowIso();
  const byteSize = pdf.byteLength;
  const versionKey = gcsKeys.exportPdf(orgId, notebookId, exportId);
  const latestKey = gcsKeys.exportPdf(orgId, notebookId, "latest");

  await storage.putObject(versionKey, pdf, "application/pdf");
  await storage.putObject(latestKey, pdf, "application/pdf");

  const exportMeta: CompileExport = omitUndefined({
    id: exportId,
    createdAt: ts,
    createdBy,
    byteSize,
  }) as CompileExport;

  const store = getMetadataStore();
  await store.set(
    compileExportPath(orgId, notebookId, exportId),
    omitUndefined({ ...exportMeta }) as Record<string, unknown>
  );
  await store.update(notebookPath(orgId, notebookId), {
    latestExportId: exportId,
    updatedAt: ts,
    lastCompiled: null,
  });

  return { exportId, createdAt: ts, byteSize, exportMeta };
}

/**
 * Delete a saved version. Clears the share link if the shared PDF is removed.
 */
export async function deleteCompileExport(opts: {
  orgId: string;
  notebookId: string;
  exportId: string;
  storage: StoragePort;
}): Promise<{
  ok: true;
  latestExportId: string | null;
  publicExportId: string | null;
  publicAccess: "off" | "unlisted" | "public";
}> {
  const { orgId, notebookId, storage } = opts;
  const exportId = opts.exportId.trim();
  if (!exportId || exportId === "latest") {
    throw Object.assign(new Error("cannot_delete_latest_alias"), { statusCode: 400 });
  }

  const store = getMetadataStore();
  const nbPath = notebookPath(orgId, notebookId);
  const nbSnap = await store.get(nbPath);
  if (!nbSnap) {
    throw Object.assign(new Error("notebook not found"), { statusCode: 404 });
  }
  const nb = nbSnap as NotebookSummary;
  const meta = await store.get(compileExportPath(orgId, notebookId, exportId));
  const isLatest = nb.latestExportId === exportId;
  const isPublic = nb.publicExportId === exportId;
  if (!meta && !isLatest && !isPublic) {
    throw Object.assign(new Error("export not found"), { statusCode: 404 });
  }

  await deleteCompileExportFiles(orgId, notebookId, exportId, storage);

  const patch: Record<string, unknown> = { updatedAt: nowIso() };
  let latestExportId: string | null = nb.latestExportId || null;
  let publicExportId: string | null = nb.publicExportId || null;
  let publicAccess = (nb.publicAccess || "off") as "off" | "unlisted" | "public";

  if (isPublic) {
    publicExportId = null;
    publicAccess = "off";
    patch.publicExportId = null;
    patch.publicAccess = "off";
    patch.publishedAt = null;
    patch.publishedBy = null;
  }

  if (isLatest) {
    const rows = await store.query(compileExportsCollection(orgId, notebookId));
    const remaining = rows
      .map((r) => ({
        id: String(r.id),
        createdAt: String((r as { createdAt?: string }).createdAt || ""),
      }))
      .filter((r) => r.id !== exportId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const nextLatest = remaining[0]?.id || null;
    latestExportId = nextLatest;
    patch.latestExportId = nextLatest;
    if (nextLatest) {
      const remainingPdf = await storage.getObject(gcsKeys.exportPdf(orgId, notebookId, nextLatest));
      if (remainingPdf) {
        await storage.putObject(
          gcsKeys.exportPdf(orgId, notebookId, "latest"),
          remainingPdf,
          "application/pdf"
        );
      }
    } else {
      try {
        await storage.deleteObject(gcsKeys.exportPdf(orgId, notebookId, "latest"));
      } catch {
        /* ok */
      }
    }
  }

  patch.lastCompiled = null;
  await store.update(nbPath, omitUndefined(patch));
  return { ok: true, latestExportId, publicExportId, publicAccess };
}

/** Resolve which export id to serve for "latest" or an explicit id. */
export async function resolveExportPdfKey(
  orgId: string,
  notebookId: string,
  exportId: string,
  storage: StoragePort
): Promise<{ key: string; exportId: string } | null> {
  const store = getMetadataStore();
  let id = exportId;
  if (id === "latest") {
    const nb = await store.get(notebookPath(orgId, notebookId));
    const latest = nb?.latestExportId as string | undefined;
    if (latest) id = latest;
  }
  const key = gcsKeys.exportPdf(orgId, notebookId, id);
  const exists = await storage.getObject(key);
  if (exists) return { key, exportId: id };
  if (id !== "latest") {
    const legacy = gcsKeys.exportPdf(orgId, notebookId, "latest");
    const legacyObj = await storage.getObject(legacy);
    if (legacyObj) return { key: legacy, exportId: "latest" };
  }
  return null;
}
