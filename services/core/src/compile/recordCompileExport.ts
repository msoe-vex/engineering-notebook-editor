import { randomUUID } from "node:crypto";
import {
  compileExportPath,
  gcsKeys,
  notebookPath,
  type CompileExport,
} from "@engineering-notebook/shared";
import { getMetadataStore } from "../db/metadataStore.js";
import { omitUndefined } from "../db/sanitize.js";
import type { StoragePort } from "../storage/storagePort.js";

function nowIso() {
  return new Date().toISOString();
}

/**
 * Persist a compiled PDF as a versioned export + keep `latest.pdf` for back-compat.
 * Returns the version id and notebook fields to broadcast.
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
  lastCompiled: string;
  byteSize: number;
  exportMeta: CompileExport;
}> {
  const { orgId, notebookId, storage, pdf, createdBy } = opts;
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
    lastCompiled: ts,
    latestExportId: exportId,
    updatedAt: ts,
  });

  return { exportId, lastCompiled: ts, byteSize, exportMeta };
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
  // Legacy: only `latest.pdf` on disk
  if (id !== "latest") {
    const legacy = gcsKeys.exportPdf(orgId, notebookId, "latest");
    const legacyObj = await storage.getObject(legacy);
    if (legacyObj) return { key: legacy, exportId: "latest" };
  }
  return null;
}
