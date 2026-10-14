import type { FastifyInstance, FastifyReply } from "fastify";
import { gcsKeys } from "@engineering-notebook/shared";
import type { StoragePort } from "../storage/storagePort.js";
import { MemoryStorage } from "../storage/storagePort.js";

export async function registerStaticAssetRoutes(app: FastifyInstance, storage: StoragePort) {
  const appVersion = process.env.ASSETS_APP_VERSION || "latest";

  app.get("/static/busytex/*", async (request, reply) => {
    const wildcard = (request.params as { "*": string })["*"] || "";
    const key = gcsKeys.busytex(appVersion, ...wildcard.split("/").filter(Boolean));
    return serveOrRedirect(storage, key, reply);
  });

  app.get("/static/latex/*", async (request, reply) => {
    const wildcard = (request.params as { "*": string })["*"] || "";
    const key = gcsKeys.latexTemplate(appVersion, ...wildcard.split("/").filter(Boolean));
    return serveOrRedirect(storage, key, reply);
  });
}

async function serveOrRedirect(storage: StoragePort, key: string, reply: FastifyReply) {
  if (process.env.STATIC_ASSETS_REDIRECT === "true") {
    const url = await storage.getSignedUrl(key, "read");
    return reply.redirect(url, 302);
  }

  if (storage instanceof MemoryStorage) {
    const raw = storage.getRaw(key);
    if (!raw) return reply.code(404).send({ error: "asset not found", key });
    return reply.type(raw.contentType).send(raw.data);
  }

  const buf = await storage.getObject(key);
  if (!buf) {
    const url = storage.publicUrl(key);
    return reply.redirect(url, 302);
  }
  const contentType = key.endsWith(".wasm")
    ? "application/wasm"
    : key.endsWith(".js")
      ? "application/javascript"
      : "application/octet-stream";
  return reply.type(contentType).send(buf);
}
