import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import {
  NOTEBOOK_SCHEMA_VERSION,
  memberPath,
  membersCollection,
  notebooksCollection,
  notebookPath,
  orgPath,
  invitePath,
  entriesCollection,
  entryPath,
  assetsCollection,
  assetPath,
  gcsKeys,
  type Organization,
  type OrgMember,
  type OrgRole,
  type NotebookSummaryV5,
  type EntryMetadataV5,
  type AssetMetadata,
  type Invite,
} from "@engineering-notebook/shared";
import { getFirestore } from "../db/firestore.js";
import { omitUndefined } from "../db/sanitize.js";
import { requireOrgMember, isServiceAdmin } from "../rbac.js";
import { getUser } from "../http/authPlugin.js";
import type { StoragePort } from "../storage/storagePort.js";

function nowIso() {
  return new Date().toISOString();
}

async function deleteCollectionDocs(collectionPath: string) {
  const snap = await dbRoot().collection(collectionPath).get();
  const batch = dbRoot().batch();
  for (const doc of snap.docs) batch.delete(doc.ref);
  if (!snap.empty) await batch.commit();
}

function dbRoot() {
  return getFirestore();
}

export async function registerOrgRoutes(app: FastifyInstance, storage: StoragePort) {
  const db = () => getFirestore();

  app.get("/orgs", async (request) => {
    const user = getUser(request);
    if (isServiceAdmin(user)) {
      const snap = await db().collection("organizations").get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    const orgs: Organization[] = [];
    const all = await db().collection("organizations").get();
    for (const doc of all.docs) {
      const member = await db().doc(memberPath(doc.id, user.uid)).get();
      if (member.exists) {
        orgs.push({ id: doc.id, ...(doc.data() as Omit<Organization, "id">) });
      }
    }
    return orgs;
  });

  app.post("/orgs", async (request, reply) => {
    const user = getUser(request);
    const body = request.body as { name?: string };
    const name = body.name?.trim();
    if (!name) return reply.code(400).send({ error: "name required" });

    const id = randomUUID();
    const ts = nowIso();
    const org: Organization = {
      id,
      name,
      createdBy: user.uid,
      createdAt: ts,
      updatedAt: ts,
    };
    const member = omitUndefined({
      uid: user.uid,
      role: "owner" as const,
      email: user.email,
      joinedAt: ts,
    }) as OrgMember;
    await db().doc(orgPath(id)).set(org);
    await db().doc(memberPath(id, user.uid)).set(member);
    return org;
  });

  app.get("/orgs/:orgId", async (request, reply) => {
    const user = getUser(request);
    const { orgId } = request.params as { orgId: string };
    await requireOrgMember(user, orgId);
    const snap = await db().doc(orgPath(orgId)).get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    return { id: snap.id, ...snap.data() };
  });

  app.patch("/orgs/:orgId", async (request, reply) => {
    const user = getUser(request);
    const { orgId } = request.params as { orgId: string };
    await requireOrgMember(user, orgId, "admin");
    const body = request.body as { name?: string };
    const name = body.name?.trim();
    if (!name) return reply.code(400).send({ error: "name required" });
    const ref = db().doc(orgPath(orgId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    const patch = { name, updatedAt: nowIso() };
    await ref.update(patch);
    return { id: orgId, ...snap.data(), ...patch };
  });

  app.delete("/orgs/:orgId", async (request, reply) => {
    const user = getUser(request);
    const { orgId } = request.params as { orgId: string };
    await requireOrgMember(user, orgId, "owner");
    const ref = db().doc(orgPath(orgId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });

    const notebooks = await db().collection(notebooksCollection(orgId)).get();
    for (const nb of notebooks.docs) {
      await deleteCollectionDocs(entriesCollection(orgId, nb.id));
      await deleteCollectionDocs(assetsCollection(orgId, nb.id));
      await nb.ref.delete();
    }
    await deleteCollectionDocs(membersCollection(orgId));
    const invites = await db().collection("invites").where("orgId", "==", orgId).get();
    const inviteBatch = db().batch();
    for (const inv of invites.docs) inviteBatch.delete(inv.ref);
    if (!invites.empty) await inviteBatch.commit();
    await ref.delete();
    return { ok: true };
  });

  app.get("/orgs/:orgId/members", async (request) => {
    const user = getUser(request);
    const { orgId } = request.params as { orgId: string };
    await requireOrgMember(user, orgId);
    const snap = await db().collection(membersCollection(orgId)).get();
    return snap.docs.map((d) => d.data());
  });

  app.post("/orgs/:orgId/members", async (request, reply) => {
    const user = getUser(request);
    const { orgId } = request.params as { orgId: string };
    await requireOrgMember(user, orgId, "admin");
    const body = request.body as { uid?: string; email?: string; role?: OrgRole };
    if (!body.uid) return reply.code(400).send({ error: "uid required" });
    const role: OrgRole = body.role ?? "member";
    if (role === "owner") return reply.code(400).send({ error: "cannot assign owner via this route" });
    const member = omitUndefined({
      uid: body.uid,
      role,
      email: body.email,
      joinedAt: nowIso(),
    }) as OrgMember;
    await db().doc(memberPath(orgId, body.uid)).set(member);
    return member;
  });

  app.patch("/orgs/:orgId/members/:uid", async (request, reply) => {
    const user = getUser(request);
    const { orgId, uid } = request.params as { orgId: string; uid: string };
    await requireOrgMember(user, orgId, "admin");
    const body = request.body as { role?: OrgRole };
    if (!body.role || body.role === "owner") {
      return reply.code(400).send({ error: "invalid role" });
    }
    const ref = db().doc(memberPath(orgId, uid));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    if (snap.data()?.role === "owner") {
      return reply.code(400).send({ error: "cannot demote owner" });
    }
    await ref.update({ role: body.role });
    return { ...(snap.data() as OrgMember), role: body.role };
  });

  app.delete("/orgs/:orgId/members/:uid", async (request, reply) => {
    const user = getUser(request);
    const { orgId, uid } = request.params as { orgId: string; uid: string };
    await requireOrgMember(user, orgId, "admin");
    const snap = await db().doc(memberPath(orgId, uid)).get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    if (snap.data()?.role === "owner") {
      return reply.code(400).send({ error: "cannot remove owner" });
    }
    await db().doc(memberPath(orgId, uid)).delete();
    return { ok: true };
  });

  app.post("/orgs/:orgId/invites", async (request, reply) => {
    const user = getUser(request);
    const { orgId } = request.params as { orgId: string };
    await requireOrgMember(user, orgId, "admin");
    const body = request.body as { email?: string; role?: OrgRole };
    if (!body.email) return reply.code(400).send({ error: "email required" });
    const id = randomUUID();
    const invite: Invite = {
      id,
      orgId,
      email: body.email.toLowerCase(),
      role: body.role === "admin" ? "admin" : "member",
      createdBy: user.uid,
      createdAt: nowIso(),
    };
    await db().doc(invitePath(id)).set(omitUndefined({ ...invite }));
    // Resend wiring is env-gated; return invite token for local testing
    return { ...invite, acceptPath: `/invites/${id}/accept` };
  });

  app.get("/orgs/:orgId/invites", async (request) => {
    const user = getUser(request);
    const { orgId } = request.params as { orgId: string };
    await requireOrgMember(user, orgId, "admin");
    const snap = await db().collection("invites").where("orgId", "==", orgId).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });

  app.delete("/orgs/:orgId/invites/:inviteId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, inviteId } = request.params as { orgId: string; inviteId: string };
    await requireOrgMember(user, orgId, "admin");
    const ref = db().doc(invitePath(inviteId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    const invite = snap.data() as Invite;
    if (invite.orgId !== orgId) return reply.code(404).send({ error: "not found" });
    await ref.delete();
    return { ok: true };
  });

  app.post("/invites/:inviteId/accept", async (request, reply) => {
    const user = getUser(request);
    const { inviteId } = request.params as { inviteId: string };
    const snap = await db().doc(invitePath(inviteId)).get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    const invite = snap.data() as Invite;
    if (invite.acceptedAt) return reply.code(400).send({ error: "already accepted" });
    const member = omitUndefined({
      uid: user.uid,
      role: invite.role,
      email: user.email ?? invite.email,
      joinedAt: nowIso(),
    }) as OrgMember;
    await db().doc(memberPath(invite.orgId, user.uid)).set(member);
    await db().doc(invitePath(inviteId)).update({ acceptedAt: nowIso() });
    return { orgId: invite.orgId, member };
  });

  app.get("/orgs/:orgId/notebooks", async (request) => {
    const user = getUser(request);
    const { orgId } = request.params as { orgId: string };
    await requireOrgMember(user, orgId);
    const snap = await db().collection(notebooksCollection(orgId)).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });

  app.post("/orgs/:orgId/notebooks", async (request, reply) => {
    const user = getUser(request);
    const { orgId } = request.params as { orgId: string };
    await requireOrgMember(user, orgId);
    const body = request.body as { name?: string };
    const name = body.name?.trim() || "Untitled Notebook";
    const id = randomUUID();
    const ts = nowIso();
    const summary: NotebookSummaryV5 & { id: string } = {
      id,
      schemaVersion: NOTEBOOK_SCHEMA_VERSION,
      orgId,
      name,
      folders: {},
      phases: {},
      createdAt: ts,
      updatedAt: ts,
      createdBy: user.uid,
    };
    await db().doc(notebookPath(orgId, id)).set(omitUndefined({ ...summary }));
    return summary;
  });

  app.get("/orgs/:orgId/notebooks/:notebookId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await requireOrgMember(user, orgId);
    const snap = await db().doc(notebookPath(orgId, notebookId)).get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    return { id: snap.id, ...snap.data() };
  });

  app.patch("/orgs/:orgId/notebooks/:notebookId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await requireOrgMember(user, orgId);
    const body = request.body as Partial<NotebookSummaryV5>;
    const ref = db().doc(notebookPath(orgId, notebookId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    const patch: Record<string, unknown> = { updatedAt: nowIso() };
    for (const key of ["name", "folders", "team", "phases", "lastCompiled"] as const) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    await ref.update(omitUndefined(patch));
    return { id: notebookId, ...snap.data(), ...patch };
  });

  app.delete("/orgs/:orgId/notebooks/:notebookId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await requireOrgMember(user, orgId, "admin");
    const ref = db().doc(notebookPath(orgId, notebookId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    await deleteCollectionDocs(entriesCollection(orgId, notebookId));
    await deleteCollectionDocs(assetsCollection(orgId, notebookId));
    await ref.delete();
    return { ok: true };
  });

  app.get("/orgs/:orgId/notebooks/:notebookId/entries", async (request) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await requireOrgMember(user, orgId);
    const snap = await db().collection(entriesCollection(orgId, notebookId)).get();
    const entries: Record<string, EntryMetadataV5> = {};
    for (const doc of snap.docs) entries[doc.id] = doc.data() as EntryMetadataV5;
    return { entries };
  });

  app.post("/orgs/:orgId/notebooks/:notebookId/entries", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await requireOrgMember(user, orgId);
    const body = (request.body ?? {}) as Partial<EntryMetadataV5> & { id?: string };
    const id = body.id || randomUUID();
    const ts = nowIso();
    const tipTapGcsPath = gcsKeys.tipTap(orgId, notebookId, id);
    const yjsGcsPath = gcsKeys.yjs(orgId, notebookId, id);
    const entry = omitUndefined({
      title: body.title ?? "Untitled Entry",
      authors: body.authors ?? (user.displayName || user.email ? [user.displayName || user.email!] : []),
      phase: body.phase ?? null,
      createdAt: ts,
      updatedAt: ts,
      date: body.date ?? ts.slice(0, 10),
      folderId: body.folderId ?? null,
      order: body.order ?? 0,
      isTemplate: body.isTemplate === true ? true : body.isTemplate === false ? false : undefined,
      tipTapGcsPath,
      tipTapRev: 0,
      yjsGcsPath,
      yjsRev: 0,
    }) as EntryMetadataV5;
    await db().doc(entryPath(orgId, notebookId, id)).set(entry);
    await storage.putObject(
      tipTapGcsPath,
      JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }),
      "application/json"
    );
    return { id, ...entry };
  });

  app.get("/orgs/:orgId/notebooks/:notebookId/entries/:entryId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, entryId } = request.params as {
      orgId: string;
      notebookId: string;
      entryId: string;
    };
    await requireOrgMember(user, orgId);
    const snap = await db().doc(entryPath(orgId, notebookId, entryId)).get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    return { id: snap.id, ...snap.data() };
  });

  app.patch("/orgs/:orgId/notebooks/:notebookId/entries/:entryId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, entryId } = request.params as {
      orgId: string;
      notebookId: string;
      entryId: string;
    };
    await requireOrgMember(user, orgId);
    const body = request.body as Partial<EntryMetadataV5>;
    const ref = db().doc(entryPath(orgId, notebookId, entryId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    const allowed = [
      "title",
      "authors",
      "phase",
      "date",
      "folderId",
      "order",
      "isTemplate",
      "resources",
      "references",
      "assetIds",
      "isValid",
      "validationErrors",
      "tipTapGcsPath",
      "tipTapRev",
      "yjsGcsPath",
      "yjsRev",
    ] as const;
    const patch: Record<string, unknown> = { updatedAt: nowIso() };
    for (const key of allowed) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    await ref.update(omitUndefined(patch));
    return { id: entryId, ...snap.data(), ...patch };
  });

  app.delete("/orgs/:orgId/notebooks/:notebookId/entries/:entryId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, entryId } = request.params as {
      orgId: string;
      notebookId: string;
      entryId: string;
    };
    await requireOrgMember(user, orgId);
    const ref = db().doc(entryPath(orgId, notebookId, entryId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    await ref.delete();
    return { ok: true };
  });

  app.get("/orgs/:orgId/notebooks/:notebookId/entries/:entryId/content", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, entryId } = request.params as {
      orgId: string;
      notebookId: string;
      entryId: string;
    };
    await requireOrgMember(user, orgId);
    const snap = await db().doc(entryPath(orgId, notebookId, entryId)).get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    const meta = snap.data() as EntryMetadataV5;
    const key = meta.tipTapGcsPath || gcsKeys.tipTap(orgId, notebookId, entryId);
    const buf = await storage.getObject(key);
    if (!buf) return reply.code(404).send({ error: "content not found" });
    return JSON.parse(buf.toString("utf8"));
  });

  app.put("/orgs/:orgId/notebooks/:notebookId/entries/:entryId/content", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, entryId } = request.params as {
      orgId: string;
      notebookId: string;
      entryId: string;
    };
    await requireOrgMember(user, orgId);
    const ref = db().doc(entryPath(orgId, notebookId, entryId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    const meta = snap.data() as EntryMetadataV5;
    const key = meta.tipTapGcsPath || gcsKeys.tipTap(orgId, notebookId, entryId);
    const tipTapRev = (meta.tipTapRev ?? 0) + 1;
    await storage.putObject(key, JSON.stringify(request.body), "application/json");
    await ref.update({ tipTapGcsPath: key, tipTapRev, updatedAt: nowIso() });
    return { ok: true, tipTapRev, tipTapGcsPath: key };
  });

  app.post("/orgs/:orgId/notebooks/:notebookId/assets", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await requireOrgMember(user, orgId);
    const body = request.body as { contentType?: string; byteSize?: number };
    const id = randomUUID();
    const gcsPath = gcsKeys.asset(orgId, notebookId, id, "compressed");
    const asset: AssetMetadata = {
      id,
      contentType: body.contentType || "application/octet-stream",
      byteSize: body.byteSize ?? 0,
      gcsPath,
      createdBy: user.uid,
      createdAt: nowIso(),
      usedBy: [],
    };
    await db().doc(assetPath(orgId, notebookId, id)).set(omitUndefined({ ...asset }));
    const uploadUrl = await storage.getSignedUrl(gcsPath, "write");
    return { asset, uploadUrl };
  });

  app.get("/orgs/:orgId/notebooks/:notebookId/assets", async (request) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await requireOrgMember(user, orgId);
    const snap = await db().collection(assetsCollection(orgId, notebookId)).get();
    return snap.docs.map((d) => d.data());
  });

  app.get("/orgs/:orgId/notebooks/:notebookId/assets/:assetId/url", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, assetId } = request.params as {
      orgId: string;
      notebookId: string;
      assetId: string;
    };
    await requireOrgMember(user, orgId);
    const snap = await db().doc(assetPath(orgId, notebookId, assetId)).get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    const asset = snap.data() as AssetMetadata;
    const url = await storage.getSignedUrl(asset.gcsPath, "read");
    return { url, asset };
  });

  app.delete("/orgs/:orgId/notebooks/:notebookId/assets/:assetId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, assetId } = request.params as {
      orgId: string;
      notebookId: string;
      assetId: string;
    };
    await requireOrgMember(user, orgId);
    const ref = db().doc(assetPath(orgId, notebookId, assetId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    await ref.delete();
    return { ok: true };
  });
}
