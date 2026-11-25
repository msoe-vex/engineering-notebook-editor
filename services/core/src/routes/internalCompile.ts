import type { FastifyInstance } from "fastify";
import {
  assetPath,
  assetsCollection,
  entriesCollection,
  gcsKeys,
  memberPath,
  notebookMembersCollection,
  notebookPath,
  orgAssetPath,
  type EntryMetadata,
  type NotebookSummary,
  type OrgMember,
} from "@engineering-notebook/shared";
import { recordCompileExport, recordCompilePreview } from "../compile/recordCompileExport.js";
import { getMetadataStore } from "../db/metadataStore.js";
import { completeJob, failJob, updateJobProgress } from "../jobs/jobStore.js";
import { publishNotebookEvent } from "../realtime/notebookEvents.js";
import { assertInternalSecret } from "../http/internalAuth.js";
import type { StoragePort } from "../storage/storagePort.js";

function nowIso() {
  return new Date().toISOString();
}

function notebookKeyPrefix(orgId: string, notebookId: string) {
  return `org/${orgId}/notebook/${notebookId}/`;
}

function orgAssetsKeyPrefix(orgId: string) {
  return `org/${orgId}/asset/`;
}

/** Workers may read notebook blobs or org-scoped assets (member photos, etc.). */
function isAllowedWorkerObjectKey(orgId: string, notebookId: string, key: string) {
  return (
    key.startsWith(notebookKeyPrefix(orgId, notebookId)) ||
    key.startsWith(orgAssetsKeyPrefix(orgId))
  );
}

async function resolveAssetObjectRef(
  orgId: string,
  notebookId: string,
  assetId: string
): Promise<{ contentType: string; gcsPath: string }> {
  const store = getMetadataStore();
  const notebookMeta = await store.get(assetPath(orgId, notebookId, assetId));
  if (notebookMeta) {
    return {
      contentType: (notebookMeta.contentType as string) || "image/jpeg",
      gcsPath:
        (notebookMeta.gcsPath as string) ||
        gcsKeys.asset(orgId, notebookId, assetId, "compressed"),
    };
  }
  const orgMeta = await store.get(orgAssetPath(orgId, assetId));
  if (orgMeta) {
    return {
      contentType: (orgMeta.contentType as string) || "image/jpeg",
      gcsPath:
        (orgMeta.gcsPath as string) || gcsKeys.orgAsset(orgId, assetId, "compressed"),
    };
  }
  // Fallback keeps prior compile behavior for missing meta (notebook key).
  return {
    contentType: "image/jpeg",
    gcsPath: gcsKeys.asset(orgId, notebookId, assetId, "compressed"),
  };
}

/**
 * Internal compile-job APIs (x-internal-secret). Used by the compile worker.
 * Snapshot is metadata-only; worker pulls TipTap/assets via /internal/storage/object.
 */
export async function registerInternalCompileRoutes(
  app: FastifyInstance,
  storage: StoragePort
) {
  const store = () => getMetadataStore();

  /**
   * Metadata snapshot — no TipTap bodies or asset bytes (scales to many assets).
   * Entries include tipTapGcsPath; assets map is contentType + gcsPath only.
   */
  app.get("/internal/compile/snapshot", async (request, reply) => {
    const denied = assertInternalSecret(
      request as { headers: Record<string, unknown> },
      reply
    );
    if (denied) return denied;

    const q = request.query as { orgId?: string; notebookId?: string };
    const orgId = q.orgId?.trim();
    const notebookId = q.notebookId?.trim();
    if (!orgId || !notebookId) {
      return reply.code(400).send({ error: "orgId and notebookId required" });
    }

    const nb = await store().get(notebookPath(orgId, notebookId));
    if (!nb) return reply.code(404).send({ error: "notebook not found" });
    const { id: _nbId, ...nbRest } = nb;
    const notebook = { id: notebookId, ...(nbRest as NotebookSummary) };

    const entryRows = await store().query(entriesCollection(orgId, notebookId));
    const entries: Record<string, Record<string, unknown>> = {};
    const neededAssets = new Set<string>();
    if (notebook.logoAssetId) neededAssets.add(String(notebook.logoAssetId));

    for (const row of entryRows) {
      const entryId = String(row.id);
      const { id: _id, ...rest } = row;
      const meta = rest as EntryMetadata;
      const tipTapGcsPath = meta.tipTapGcsPath || gcsKeys.tipTap(orgId, notebookId, entryId);
      for (const aid of meta.assetIds || []) neededAssets.add(aid);
      entries[entryId] = {
        ...meta,
        tipTapGcsPath,
      };
    }

    const uids = notebook.contributorUids || [];
    let members: Array<{
      id: string;
      name?: string;
      role?: string;
      order?: number;
      imageAssetId?: string;
    }>;
    if (uids.length) {
      members = (
        await Promise.all(
          uids.map(async (uid, order) => {
            const omSnap = await store().get(memberPath(orgId, uid));
            if (!omSnap) return null;
            const { id: _id, ...rest } = omSnap;
            const om = rest as OrgMember;
            if (om.imageAssetId) neededAssets.add(om.imageAssetId);
            return {
              id: uid,
              name: om.displayName || om.email || "Member",
              role: om.title || "Member",
              order,
              imageAssetId: om.imageAssetId,
            };
          })
        )
      ).filter(Boolean) as Array<{
        id: string;
        name?: string;
        role?: string;
        order?: number;
        imageAssetId?: string;
      }>;
    } else {
      // Legacy notebook members collection (pre–contributorUids).
      const memberRows = await store().query(notebookMembersCollection(orgId, notebookId));
      members = memberRows
        .map((row) => {
          const { id, ...data } = row as {
            id: string;
            name?: string;
            role?: string;
            order?: number;
            imageAssetId?: string;
            deletedAt?: string | null;
          };
          if (data.deletedAt) return null;
          if (data.imageAssetId) neededAssets.add(data.imageAssetId);
          return { id, ...data };
        })
        .filter(Boolean) as Array<{
        id: string;
        name?: string;
        role?: string;
        order?: number;
        imageAssetId?: string;
      }>;
    }

    try {
      const assetRows = await store().query(assetsCollection(orgId, notebookId));
      for (const row of assetRows) neededAssets.add(row.id as string);
    } catch (err) {
      request.log.warn({ err }, "compile snapshot assets collection list failed");
    }

    const assets: Record<string, { contentType: string; gcsPath: string }> = {};
    for (const assetId of neededAssets) {
      try {
        assets[assetId] = await resolveAssetObjectRef(orgId, notebookId, assetId);
      } catch (err) {
        request.log.warn({ err, assetId }, "compile snapshot skipped asset meta");
      }
    }

    return {
      orgId,
      notebookId,
      notebook,
      members,
      entries,
      assets,
      schema: "paths-v1",
    };
  });

  /**
   * Stream a storage object to the worker (TipTap JSON, assets, rubric sources, …).
   * Key must be under the notebook prefix or org-scoped assets for this org.
   */
  app.get("/internal/storage/object", async (request, reply) => {
    const denied = assertInternalSecret(
      request as { headers: Record<string, unknown> },
      reply
    );
    if (denied) return denied;

    const q = request.query as {
      orgId?: string;
      notebookId?: string;
      key?: string;
    };
    const orgId = q.orgId?.trim();
    const notebookId = q.notebookId?.trim();
    const key = q.key?.trim();
    if (!orgId || !notebookId || !key) {
      return reply.code(400).send({ error: "orgId, notebookId, and key required" });
    }
    if (!isAllowedWorkerObjectKey(orgId, notebookId, key)) {
      return reply.code(403).send({ error: "key outside notebook or org-asset scope" });
    }

    const buf = await storage.getObject(key);
    if (!buf) return reply.code(404).send({ error: "object not found" });

    const lower = key.toLowerCase();
    let contentType = "application/octet-stream";
    if (lower.endsWith(".json")) contentType = "application/json";
    else if (lower.endsWith(".pdf")) contentType = "application/pdf";
    else if (lower.endsWith(".png")) contentType = "image/png";
    else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) contentType = "image/jpeg";
    else if (lower.endsWith(".webp")) contentType = "image/webp";
    else if (lower.endsWith(".gif")) contentType = "image/gif";

    return reply.type(contentType).send(buf);
  });

  /**
   * Resolve one asset to object key + contentType (notebook asset, else org asset).
   */
  app.get("/internal/compile/asset-ref", async (request, reply) => {
    const denied = assertInternalSecret(
      request as { headers: Record<string, unknown> },
      reply
    );
    if (denied) return denied;

    const q = request.query as {
      orgId?: string;
      notebookId?: string;
      assetId?: string;
    };
    const orgId = q.orgId?.trim();
    const notebookId = q.notebookId?.trim();
    const assetId = q.assetId?.trim();
    if (!orgId || !notebookId || !assetId) {
      return reply.code(400).send({ error: "orgId, notebookId, and assetId required" });
    }

    const ref = await resolveAssetObjectRef(orgId, notebookId, assetId);
    return { assetId, ...ref };
  });

  app.put("/internal/compile/export", async (request, reply) => {
    const denied = assertInternalSecret(
      request as { headers: Record<string, unknown> },
      reply
    );
    if (denied) return denied;

    const q = request.query as {
      orgId?: string;
      notebookId?: string;
      exportId?: string;
      jobId?: string;
    };
    const orgId = q.orgId?.trim();
    const notebookId = q.notebookId?.trim();
    const exportId = (q.exportId || "latest").trim();
    const jobId = q.jobId || `job-${Date.now()}`;
    if (!orgId || !notebookId) {
      return reply.code(400).send({ error: "orgId and notebookId required" });
    }

    const nbPath = notebookPath(orgId, notebookId);
    const nb = await store().get(nbPath);
    if (!nb) return reply.code(404).send({ error: "notebook not found" });

    const body = request.body as NodeJS.ReadableStream | Uint8Array | Buffer | undefined;
    let pdf: Buffer;
    if (body && typeof (body as NodeJS.ReadableStream).pipe === "function") {
      const chunks: Buffer[] = [];
      for await (const chunk of body as AsyncIterable<Buffer | Uint8Array | string>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      pdf = Buffer.concat(chunks);
    } else if (body instanceof Uint8Array || Buffer.isBuffer(body)) {
      pdf = Buffer.from(body);
    } else {
      return reply.code(400).send({ error: "expected binary PDF body" });
    }

    let recorded: Awaited<ReturnType<typeof recordCompilePreview>>;
    try {
      recorded = await recordCompilePreview({
        orgId,
        notebookId,
        storage,
        pdf,
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(status).send({
        error: message,
        code: (err as { code?: string }).code,
      });
    }
    const key = gcsKeys.exportPdf(orgId, notebookId, recorded.exportId);

    publishNotebookEvent(orgId, notebookId, {
      type: "notebook.updated",
      notebook: {
        id: notebookId,
        updatedAt: recorded.createdAt,
      },
      at: recorded.createdAt,
    });

    const result = {
      createdAt: recorded.createdAt,
      exportId: recorded.exportId,
      gcsPath: key,
      byteSize: recorded.byteSize,
    };

    const completed = await completeJob({
      orgId,
      notebookId,
      jobId,
      result,
    });
    if (!completed) {
      publishNotebookEvent(orgId, notebookId, {
        type: "job.done",
        jobId,
        jobType: "compile",
        result,
        at: recorded.createdAt,
      });
    }

    return {
      ok: true,
      ...result,
      jobId,
    };
  });

  app.post("/internal/compile/failed", async (request, reply) => {
    const denied = assertInternalSecret(
      request as { headers: Record<string, unknown> },
      reply
    );
    if (denied) return denied;
    const body = request.body as {
      orgId?: string;
      notebookId?: string;
      error?: string;
      jobId?: string;
    };
    if (!body.orgId || !body.notebookId) {
      return reply.code(400).send({ error: "orgId and notebookId required" });
    }
    await failJob({
      orgId: body.orgId,
      notebookId: body.notebookId,
      jobId: body.jobId || "unknown",
      error: body.error || "compile failed",
    });
    return { ok: true };
  });

  app.post("/internal/compile/progress", async (request, reply) => {
    const denied = assertInternalSecret(
      request as { headers: Record<string, unknown> },
      reply
    );
    if (denied) return denied;
    const body = request.body as {
      orgId?: string;
      notebookId?: string;
      jobId?: string;
      status?: string;
      progress?: number;
      stage?: string;
      detail?: string;
    };
    if (!body.orgId || !body.notebookId) {
      return reply.code(400).send({ error: "orgId and notebookId required" });
    }
    await updateJobProgress({
      orgId: body.orgId,
      notebookId: body.notebookId,
      jobId: body.jobId || "unknown",
      statusMessage: body.status || "Working…",
      progress: Math.min(100, Math.max(0, Number(body.progress) || 0)),
      stage: body.stage,
      detail: body.detail,
    });
    return { ok: true };
  });
}
