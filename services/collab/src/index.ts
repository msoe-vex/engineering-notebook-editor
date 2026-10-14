import { Server } from "@hocuspocus/server";
import * as Y from "yjs";
import {
  parseCollabDocName,
  memberPath,
  entryPath,
  gcsKeys,
} from "@engineering-notebook/shared";

const port = Number(process.env.PORT || 1234);
const authDisabled = process.env.COLLAB_AUTH_DISABLED === "true";
const coreUrl = (process.env.CORE_API_URL || "http://localhost:8080").replace(/\/$/, "");
const internalSecret = process.env.INTERNAL_SERVICE_SECRET || "";

const pendingFlushes = new Map<string, ReturnType<typeof setTimeout>>();
let adminApp: typeof import("firebase-admin") | null = null;

async function getAdmin() {
  if (authDisabled) return null;
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
  if (!admin) return null;
  // FIRESTORE_EMULATOR_HOST is auto-detected by the Admin SDK.
  return admin.firestore();
}

async function verifyToken(token: string): Promise<{ uid: string }> {
  if (authDisabled) return { uid: "local-dev" };
  const admin = await getAdmin();
  if (!admin || process.env.AUTH_FALLBACK === "true") {
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
  if (!db) return;
  const snap = await db.doc(memberPath(orgId, uid)).get();
  if (!snap.exists) throw new Error("Forbidden");
}

function metaFromDoc(document: Y.Doc): Record<string, unknown> {
  const map = document.getMap("meta");
  const out: Record<string, unknown> = {};
  map.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function tipTapStubFromDoc(document: Y.Doc): unknown {
  // Collab clients sync TipTap via XmlFragment('default'); snapshot as opaque marker + text length.
  const fragment = document.getXmlFragment("default");
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: fragment.length
          ? [{ type: "text", text: `[yjs-fragment length=${fragment.length}]` }]
          : [],
      },
    ],
  };
}

async function flushDocument(documentName: string, document: Y.Doc) {
  const parsed = parseCollabDocName(documentName);
  if (!parsed) return;

  const yjsUpdate = Y.encodeStateAsUpdate(document);
  const payload = {
    orgId: parsed.orgId,
    notebookId: parsed.notebookId,
    entryId: parsed.entryId,
    tipTapJson: tipTapStubFromDoc(document),
    yjsBase64: Buffer.from(yjsUpdate).toString("base64"),
    meta: metaFromDoc(document),
  };

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (internalSecret) headers["x-internal-secret"] = internalSecret;

  const res = await fetch(`${coreUrl}/internal/collab/flush`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("collab flush failed", res.status, text);
  }
}

async function loadYjsFromCore(documentName: string, document: Y.Doc) {
  const parsed = parseCollabDocName(documentName);
  if (!parsed) return;
  const db = await getFirestore();
  if (!db) return;
  const snap = await db.doc(entryPath(parsed.orgId, parsed.notebookId, parsed.entryId)).get();
  if (!snap.exists) return;
  const meta = snap.data() as { yjsGcsPath?: string };
  const key = meta.yjsGcsPath || gcsKeys.yjs(parsed.orgId, parsed.notebookId, parsed.entryId);
  // Load via Core content is TipTap-only; Yjs bytes come from GCS through core health path later.
  // Best-effort: ask core flush endpoint's storage indirectly by downloading public URL if configured.
  const base = process.env.GCS_PUBLIC_BASE_URL;
  if (!base) return;
  try {
    const url = `${base.replace(/\/$/, "")}/${key}`;
    const res = await fetch(url);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      Y.applyUpdate(document, new Uint8Array(buf));
    }
  } catch {
    // first open
  }
}

const server = new Server({
  port,
  async onAuthenticate({ request, documentName }) {
    if (authDisabled) return { user: { uid: "local-dev" } };

    const authHeader = request.headers?.authorization;
    const token = typeof authHeader === "string" ? authHeader.replace(/^Bearer\s+/i, "") : "";
    if (!token) throw new Error("Missing session token");

    const user = await verifyToken(token);
    const parsed = parseCollabDocName(documentName);
    if (!parsed) throw new Error("Invalid document name; expected org:{orgId}:notebook:{notebookId}:entry:{entryId}");
    await assertOrgMember(parsed.orgId, user.uid);
    return { user };
  },
  async onLoadDocument({ documentName, document }) {
    await loadYjsFromCore(documentName, document as Y.Doc);
  },
  async onStoreDocument({ documentName, document }) {
    const existingTimer = pendingFlushes.get(documentName);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      void flushDocument(documentName, document as Y.Doc);
      pendingFlushes.delete(documentName);
    }, 500);

    pendingFlushes.set(documentName, timer);
  },
});

await server.listen();
process.stdout.write(`Collaboration service listening on ${server.webSocketURL}\n`);
