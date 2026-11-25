import type { FastifyInstance } from "fastify";
import { getMetadataStore } from "../db/metadataStore.js";
import type { MetadataBatchOp, MetadataQueryOpts } from "@engineering-notebook/shared";
import { assertInternalSecret } from "../http/internalAuth.js";

export async function registerInternalMetadataRoutes(app: FastifyInstance) {
  const store = getMetadataStore();

  // GET document
  app.get("/internal/metadata/doc/*", async (request, reply) => {
    const denied = assertInternalSecret(request, reply);
    if (denied) return denied;

    const path = (request.params as { "*": string })["*"];
    if (!path) return reply.code(400).send({ error: "missing path" });

    const doc = await store.get(path);
    if (!doc) return reply.code(404).send({ error: "not found" });
    return doc;
  });

  // SET document
  app.put("/internal/metadata/doc/*", async (request, reply) => {
    const denied = assertInternalSecret(request, reply);
    if (denied) return denied;

    const path = (request.params as { "*": string })["*"];
    if (!path) return reply.code(400).send({ error: "missing path" });

    const body = request.body as { data: Record<string, unknown>; merge?: boolean };
    await store.set(path, body?.data ?? {}, { merge: body?.merge ?? false });
    return { ok: true };
  });

  // UPDATE document
  app.patch("/internal/metadata/doc/*", async (request, reply) => {
    const denied = assertInternalSecret(request, reply);
    if (denied) return denied;

    const path = (request.params as { "*": string })["*"];
    if (!path) return reply.code(400).send({ error: "missing path" });

    const body = request.body as { data: Record<string, unknown> };
    await store.update(path, body?.data ?? {});
    return { ok: true };
  });

  // DELETE document
  app.delete("/internal/metadata/doc/*", async (request, reply) => {
    const denied = assertInternalSecret(request, reply);
    if (denied) return denied;

    const path = (request.params as { "*": string })["*"];
    if (!path) return reply.code(400).send({ error: "missing path" });

    await store.delete(path);
    return { ok: true };
  });

  // QUERY collection
  app.post("/internal/metadata/query/:collection", async (request, reply) => {
    const denied = assertInternalSecret(request, reply);
    if (denied) return denied;

    const { collection } = request.params as { collection: string };
    const opts = request.body as MetadataQueryOpts | undefined;

    const docs = await store.query(collection, opts);
    return { docs };
  });

  // COUNT collection
  app.get("/internal/metadata/count/:collection", async (request, reply) => {
    const denied = assertInternalSecret(request, reply);
    if (denied) return denied;

    const { collection } = request.params as { collection: string };
    const count = store.count ? await store.count(collection) : (await store.query(collection)).length;
    return { count };
  });

  // BATCH operations
  app.post("/internal/metadata/batch", async (request, reply) => {
    const denied = assertInternalSecret(request, reply);
    if (denied) return denied;

    const body = request.body as { ops: MetadataBatchOp[] };
    await store.batch(body.ops || []);
    return { ok: true };
  });
}
