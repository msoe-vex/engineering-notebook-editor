import { Server } from "@hocuspocus/server";
import * as Y from "yjs";

const port = Number(process.env.PORT || 1234);
const authDisabled = process.env.COLLAB_AUTH_DISABLED === "true";

const docs = new Map<string, Uint8Array>();
const pendingFlushes = new Map<string, ReturnType<typeof setTimeout>>();

const server = new Server({
  port,
  async onAuthenticate({ request }) {
    if (authDisabled) return;

    const authHeader = request.headers?.authorization;
    const token = typeof authHeader === "string" ? authHeader.replace(/^Bearer\s+/i, "") : "";

    if (!token) throw new Error("Missing session token");
  },
  async onLoadDocument({ documentName, document }) {
    const existing = docs.get(documentName);
    if (existing) Y.applyUpdate(document as Y.Doc, existing);
  },
  async onStoreDocument({ documentName, document }) {
    const existingTimer = pendingFlushes.get(documentName);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      docs.set(documentName, Y.encodeStateAsUpdate(document as Y.Doc));
      pendingFlushes.delete(documentName);
    }, 500);

    pendingFlushes.set(documentName, timer);
  },
});

await server.listen();
process.stdout.write(`Collaboration service listening on ${server.webSocketURL}\n`);
