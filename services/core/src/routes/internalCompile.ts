import type { FastifyInstance } from "fastify";
import {
  assetPath,
  assetsCollection,
  entriesCollection,
  gcsKeys,
  notebookMembersCollection,
  notebookPath,
  type EntryMetadataV5,
  type NotebookSummaryV5,
} from "@engineering-notebook/shared";
import { getFirestore } from "../db/firestore.js";
import { completeJob, failJob, updateJobProgress } from "../jobs/jobStore.js";
import { publishNotebookEvent } from "../realtime/notebookEvents.js";
import type { StoragePort } from "../storage/storagePort.js";

function assertInternalSecret(
  request: { headers: Record<string, unknown> },
  reply: { code: (n: number) => { send: (b: unknown) => unknown } }
) {
  const secret = process.env.INTERNAL_SERVICE_SECRET;
  if (secret && request.headers["x-internal-secret"] !== secret) {
    return reply.code(403).send({ error: "forbidden" });
  }
  return null;
}

function nowIso() {
  return new Date().toISOString();
}

function notebookKeyPrefix(orgId: string, notebookId: string) {
  return `organizations/${orgId}/notebooks/${notebookId}/`;
}

/**
 * Internal compile-job APIs (x-internal-secret). Used by the compile worker.
 * Snapshot is metadata-only; worker pulls TipTap/assets via /internal/storage/object.
 */
export async function registerInternalCompileRoutes(
  app: FastifyInstance,
  storage: StoragePort
) {
  const db = () => getFirestore();

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

    const nbSnap = await db().doc(notebookPath(orgId, notebookId)).get();
    if (!nbSnap.exists) return reply.code(404).send({ error: "notebook not found" });
    const notebook = { id: notebookId, ...(nbSnap.data() as NotebookSummaryV5) };

    const entrySnap = await db().collection(entriesCollection(orgId, notebookId)).get();
    const entries: Record<string, Record<string, unknown>> = {};
    const neededAssets = new Set<string>();
    if (notebook.logoAssetId) neededAssets.add(String(notebook.logoAssetId));

    for (const doc of entrySnap.docs) {
      const meta = doc.data() as EntryMetadataV5;
      const tipTapGcsPath = meta.tipTapGcsPath || gcsKeys.tipTap(orgId, notebookId, doc.id);
      for (const aid of meta.assetIds || []) neededAssets.add(aid);
      entries[doc.id] = {
        ...meta,
        tipTapGcsPath,
      };
    }

    const memberSnap = await db()
      .collection(notebookMembersCollection(orgId, notebookId))
      .get();
    const members = memberSnap.docs.map((d) => {
      const data = d.data() as {
        name?: string;
        role?: string;
        order?: number;
        imageAssetId?: string;
      };
      if (data.imageAssetId) neededAssets.add(data.imageAssetId);
      return { id: d.id, ...data };
    });

    // Prefer listing notebook assets (metadata only) so TipTap-discovered ids resolve.
    try {
      const assetSnap = await db().collection(assetsCollection(orgId, notebookId)).get();
      for (const doc of assetSnap.docs) neededAssets.add(doc.id);
    } catch (err) {
      request.log.warn({ err }, "compile snapshot assets collection list failed");
    }

    const assets: Record<string, { contentType: string; gcsPath: string }> = {};
    for (const assetId of neededAssets) {
      try {
        const assetRef = await db().doc(assetPath(orgId, notebookId, assetId)).get();
        const assetMeta = assetRef.exists
          ? (assetRef.data() as { gcsPath?: string; contentType?: string })
          : null;
        assets[assetId] = {
          contentType: assetMeta?.contentType || "image/jpeg",
          gcsPath:
            assetMeta?.gcsPath || gcsKeys.asset(orgId, notebookId, assetId, "compressed"),
        };
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
   * Stream a notebook-scoped GCS object to the worker (TipTap JSON, assets, …).
   * Key must be under organizations/{orgId}/notebooks/{notebookId}/.
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
    const prefix = notebookKeyPrefix(orgId, notebookId);
    if (!key.startsWith(prefix)) {
      return reply.code(403).send({ error: "key outside notebook scope" });
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
   * Resolve one asset to gcsPath + contentType (for TipTap refs not in the snapshot map).
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

    const assetRef = await db().doc(assetPath(orgId, notebookId, assetId)).get();
    const assetMeta = assetRef.exists
      ? (assetRef.data() as { gcsPath?: string; contentType?: string })
      : null;
    return {
      assetId,
      contentType: assetMeta?.contentType || "image/jpeg",
      gcsPath: assetMeta?.gcsPath || gcsKeys.asset(orgId, notebookId, assetId, "compressed"),
    };
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

    const nbRef = db().doc(notebookPath(orgId, notebookId));
    const nbSnap = await nbRef.get();
    if (!nbSnap.exists) return reply.code(404).send({ error: "notebook not found" });

    const key = gcsKeys.exportPdf(orgId, notebookId, exportId);
    const body = request.body as NodeJS.ReadableStream | Uint8Array | Buffer | undefined;
    let byteSize: number;
    if (body && typeof (body as NodeJS.ReadableStream).pipe === "function") {
      const result = await storage.putObjectStream(
        key,
        body as import("node:stream").Readable,
        "application/pdf"
      );
      byteSize = result.byteSize;
    } else if (body instanceof Uint8Array || Buffer.isBuffer(body)) {
      const data = Buffer.from(body);
      await storage.putObject(key, data, "application/pdf");
      byteSize = data.byteLength;
    } else {
      return reply.code(400).send({ error: "expected binary PDF body" });
    }

    const ts = nowIso();
    await nbRef.update({ lastCompiled: ts, updatedAt: ts });

    publishNotebookEvent(orgId, notebookId, {
      type: "notebook.updated",
      notebook: { id: notebookId, lastCompiled: ts, updatedAt: ts },
      at: ts,
    });

    const completed = await completeJob({
      orgId,
      notebookId,
      jobId,
      result: { lastCompiled: ts, exportId, gcsPath: key, byteSize },
    });
    if (!completed) {
      publishNotebookEvent(orgId, notebookId, {
        type: "job.done",
        jobId,
        jobType: "compile",
        result: { lastCompiled: ts, exportId, gcsPath: key, byteSize },
        at: ts,
      });
    }

    return { ok: true, exportId, gcsPath: key, lastCompiled: ts, byteSize, jobId };
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
    });
    return { ok: true };
  });
}
