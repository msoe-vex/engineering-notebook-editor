import type { FastifyInstance } from "fastify";
import {
  assetPath,
  entriesCollection,
  gcsKeys,
  notebookMembersCollection,
  notebookPath,
  type EntryMetadataV5,
  type NotebookSummaryV5,
} from "@engineering-notebook/shared";
import { getFirestore } from "../db/firestore.js";
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

/**
 * Internal compile-job APIs (x-internal-secret). Used by the one-shot compile container.
 */
export async function registerInternalCompileRoutes(
  app: FastifyInstance,
  storage: StoragePort
) {
  const db = () => getFirestore();

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
      const tipTapKey = meta.tipTapGcsPath || gcsKeys.tipTap(orgId, notebookId, doc.id);
      let tipTap: unknown = { type: "doc", content: [] };
      try {
        const buf = await storage.getObject(tipTapKey);
        if (buf) tipTap = JSON.parse(buf.toString("utf8"));
      } catch {
        /* empty doc */
      }
      collectAssetIds(tipTap, neededAssets);
      for (const aid of meta.assetIds || []) neededAssets.add(aid);
      entries[doc.id] = {
        ...meta,
        tipTap,
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

    const assets: Record<string, { contentType: string; base64: string }> = {};
    for (const assetId of neededAssets) {
      try {
        const assetRef = await db().doc(assetPath(orgId, notebookId, assetId)).get();
        const assetMeta = assetRef.exists
          ? (assetRef.data() as { gcsPath?: string; contentType?: string })
          : null;
        const key =
          assetMeta?.gcsPath || gcsKeys.asset(orgId, notebookId, assetId, "compressed");
        const buf = await storage.getObject(key);
        if (!buf) continue;
        assets[assetId] = {
          contentType: assetMeta?.contentType || "image/jpeg",
          base64: buf.toString("base64"),
        };
      } catch (err) {
        request.log.warn({ err, assetId }, "compile snapshot skipped asset");
      }
    }

    return { orgId, notebookId, notebook, members, entries, assets };
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
    publishNotebookEvent(orgId, notebookId, {
      type: "compile.done",
      jobId,
      lastCompiled: ts,
      at: ts,
    });

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
    publishNotebookEvent(body.orgId, body.notebookId, {
      type: "compile.failed",
      jobId: body.jobId || "unknown",
      error: body.error || "compile failed",
      at: nowIso(),
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
    publishNotebookEvent(body.orgId, body.notebookId, {
      type: "compile.progress",
      jobId: body.jobId || "unknown",
      status: body.status || "Working…",
      progress: Math.min(100, Math.max(0, Number(body.progress) || 0)),
      at: nowIso(),
    });
    return { ok: true };
  });
}

function collectAssetIds(node: unknown, out: Set<string>) {
  if (!node || typeof node !== "object") return;
  const n = node as {
    type?: string;
    attrs?: { filePath?: string; id?: string };
    content?: unknown[];
  };
  if (n.type === "image") {
    const fp = String(n.attrs?.filePath || "");
    const id = String(n.attrs?.id || "");
    if (fp.startsWith("cloud:")) out.add(fp.slice("cloud:".length));
    else if (/^[0-9a-f-]{36}$/i.test(id)) out.add(id);
    else if (fp.includes("/assets/")) {
      const bare = fp.split("/assets/").pop()?.replace(/\.(jpe?g|png|gif|webp|pdf)$/i, "");
      if (bare) out.add(bare);
    }
  }
  for (const child of n.content || []) collectAssetIds(child, out);
}
