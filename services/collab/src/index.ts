import { Server } from "@hocuspocus/server";
import * as Y from "yjs";
import { parseCollabDocName, memberPath } from "@engineering-notebook/shared";

const port = Number(process.env.PORT || 1234);
const authDisabled = process.env.COLLAB_AUTH_DISABLED === "true";
const coreUrl = (process.env.CORE_API_URL || "http://localhost:8080").replace(/\/$/, "");
const internalSecret = process.env.INTERNAL_SERVICE_SECRET || "";

let adminApp: typeof import("firebase-admin") | null = null;

async function getAdmin() {
  if (!adminApp) {
    const admin = await import("firebase-admin");
    if (!admin.apps.length) {
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || "demo-engineering-notebook",
      });
    }
    adminApp = admin;
  }
  return adminApp;
}

async function getFirestore() {
  const admin = await getAdmin();
  // FIRESTORE_EMULATOR_HOST is auto-detected by the Admin SDK.
  return admin.firestore();
}

async function verifyToken(token: string): Promise<{ uid: string }> {
  if (authDisabled) return { uid: "local-dev" };
  const admin = await getAdmin();
  if (process.env.AUTH_FALLBACK === "true") {
    return { uid: token.split("|")[0] };
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.AUTH_FALLBACK !== "false") {
      return { uid: token.split("|")[0] };
    }
    throw new Error("Invalid session token");
  }
}

async function assertOrgMember(orgId: string, uid: string) {
  if (authDisabled) return;
  if (uid === process.env.SERVICE_ADMIN_UID || uid === "service-admin") return;
  const db = await getFirestore();
  const snap = await db.doc(memberPath(orgId, uid)).get();
  if (!snap.exists) throw new Error("Forbidden");
}

function internalHeaders(): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (internalSecret) headers["x-internal-secret"] = internalSecret;
  return headers;
}

function fragmentHasNodes(document: Y.Doc): boolean {
  return document.getXmlFragment("default").length > 0;
}

async function flushDocument(documentName: string, document: Y.Doc) {
  const parsed = parseCollabDocName(documentName);
  if (!parsed) return;

  // Persist Yjs only. Never flush TipTap stub JSON — that previously wiped entry bodies.
  // TipTap JSON is mirrored from the website via PUT …/content after sync.
  const yjsUpdate = Y.encodeStateAsUpdate(document);
  // Don't clobber GCS with an empty doc (failed load / brand-new unload race).
  if (!fragmentHasNodes(document) && yjsUpdate.byteLength < 64) {
    return;
  }
  // Yjs body only — entry title/authors/phase/date live on Core REST/Firestore.
  // Flushing Y.Map("meta") was overwriting header saves with stale collab meta.
  const payload = {
    orgId: parsed.orgId,
    notebookId: parsed.notebookId,
    entryId: parsed.entryId,
    yjsBase64: Buffer.from(yjsUpdate).toString("base64"),
  };

  const res = await fetch(`${coreUrl}/internal/collab/flush`, {
    method: "POST",
    headers: { ...internalHeaders(), "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error("collab flush failed", res.status, await res.text());
  }
}

async function loadYjsFromCore(documentName: string, document: Y.Doc) {
  const parsed = parseCollabDocName(documentName);
  if (!parsed) return;

  const url = new URL(`${coreUrl}/internal/collab/yjs`);
  url.searchParams.set("orgId", parsed.orgId);
  url.searchParams.set("notebookId", parsed.notebookId);
  url.searchParams.set("entryId", parsed.entryId);

  const res = await fetch(url, { headers: internalHeaders() });
  if (res.status === 404) return; // first open — no blob yet
  if (!res.ok) {
    const text = await res.text();
    console.error("collab yjs load failed", res.status, text);
    // Throw so Hocuspocus does not treat this as an empty new doc and flush-overwrite GCS.
    throw new Error(`collab yjs load failed: ${res.status}`);
  }
  const body = (await res.json()) as { yjsBase64?: string };
  if (!body.yjsBase64) return;
  Y.applyUpdate(document, new Uint8Array(Buffer.from(body.yjsBase64, "base64")));
}

const server = new Server({
  port,
  // Let Hocuspocus debounce onStoreDocument and flush-on-disconnect via its own timer.
  // A nested setTimeout previously returned before the write finished, so unload could
  // race a late empty flush.
  debounce: 500,
  maxDebounce: 2_000,
  async onAuthenticate(data) {
    if (authDisabled) return { user: { uid: "local-dev" } };
    const token = typeof data.token === "string" ? data.token : "";
    if (!token) throw new Error("Missing session token");
    const user = await verifyToken(token);
    const parsed = parseCollabDocName(data.documentName);
    if (!parsed) {
      throw new Error(
        "Invalid document name; expected org:{orgId}:notebook:{notebookId}:entry:{entryId}"
      );
    }
    await assertOrgMember(parsed.orgId, user.uid);
    return { user };
  },
  async onLoadDocument({ documentName, document }) {
    await loadYjsFromCore(documentName, document as Y.Doc);
  },
  async onStoreDocument({ documentName, document }) {
    await flushDocument(documentName, document as Y.Doc);
  },
});

await server.listen();
process.stdout.write(`Collaboration service listening on ${server.webSocketURL}\n`);
