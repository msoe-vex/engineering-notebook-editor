import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import {
  NOTEBOOK_SCHEMA_VERSION,
  defaultNotebookAccess,
  memberPath,
  membersCollection,
  notebooksCollection,
  notebookPath,
  notebookMemberPath,
  notebookMembersCollection,
  orgPath,
  invitePath,
  entriesCollection,
  entryPath,
  assetsCollection,
  assetPath,
  auditsCollection,
  teamPath,
  teamsCollection,
  teamMemberPath,
  teamMembersCollection,
  gcsKeys,
  mergeMetadataValidationErrors,
  validateEntryMetadataFields,
  type Organization,
  type OrgMember,
  type OrgRole,
  type NotebookSummaryV5,
  type NotebookAccess,
  type NotebookMember,
  type Team,
  type TeamMembership,
  type EntryMetadataV5,
  type AssetMetadata,
  type Invite,
  type NotebookFolder,
} from "@engineering-notebook/shared";
import { getFirestore } from "../db/firestore.js";
import { omitUndefined } from "../db/sanitize.js";
import {
  requireOrgMember,
  requireNotebookAccess,
  canAccessNotebook,
  isServiceAdmin,
} from "../rbac.js";
import { getUser } from "../http/authPlugin.js";
import type { StoragePort } from "../storage/storagePort.js";
import { publishNotebookEvent, subscribeNotebookEvents } from "../realtime/notebookEvents.js";

function nowIso() {
  return new Date().toISOString();
}

/** Recompute title/authors/date/phase validity for all entries (keeps resource/ref errors). */
async function revalidateNotebookEntryMetadata(
  orgId: string,
  notebookId: string,
  phases: NotebookSummaryV5["phases"] | undefined
) {
  const snap = await dbRoot().collection(entriesCollection(orgId, notebookId)).get();
  if (snap.empty) return;
  const phaseMap = (phases || {}) as Record<string, unknown>;
  const ts = nowIso();
  let batch = dbRoot().batch();
  let ops = 0;
  const flush = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = dbRoot().batch();
    ops = 0;
  };
  const changed: Array<{ id: string; entry: EntryMetadataV5 }> = [];
  for (const doc of snap.docs) {
    const entry = doc.data() as EntryMetadataV5;
    const metaErrors = validateEntryMetadataFields(entry, phaseMap);
    const { validationErrors, isValid } = mergeMetadataValidationErrors(
      entry.validationErrors,
      metaErrors
    );
    const prev = entry.validationErrors || [];
    const same =
      entry.isValid === isValid &&
      prev.length === validationErrors.length &&
      prev.every((e, i) => e === validationErrors[i]);
    if (same) continue;
    const next = { ...entry, validationErrors, isValid, updatedAt: ts };
    batch.update(doc.ref, { validationErrors, isValid, updatedAt: ts });
    changed.push({ id: doc.id, entry: next });
    ops += 1;
    if (ops >= 400) await flush();
  }
  await flush();
  for (const row of changed) {
    publishNotebookEvent(orgId, notebookId, {
      type: "entry.upserted",
      entryId: row.id,
      entry: { id: row.id, ...row.entry } as Record<string, unknown>,
      at: ts,
    });
  }
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

async function safeDeleteObject(storage: StoragePort, key: string | undefined | null) {
  if (!key) return;
  try {
    await storage.deleteObject(key);
  } catch (err) {
    console.warn("[storage] deleteObject failed", key, err);
  }
}

/** Delete Firestore children + GCS blobs for one notebook. */
async function purgeNotebookStorage(
  storage: StoragePort,
  orgId: string,
  notebookId: string
) {
  const db = dbRoot();
  const entries = await db.collection(entriesCollection(orgId, notebookId)).get();
  for (const doc of entries.docs) {
    const meta = doc.data() as EntryMetadataV5;
    await safeDeleteObject(storage, meta.tipTapGcsPath || gcsKeys.tipTap(orgId, notebookId, doc.id));
    await safeDeleteObject(storage, meta.yjsGcsPath || gcsKeys.yjs(orgId, notebookId, doc.id));
  }
  const assets = await db.collection(assetsCollection(orgId, notebookId)).get();
  for (const doc of assets.docs) {
    const asset = doc.data() as AssetMetadata;
    await safeDeleteObject(storage, asset.gcsPath);
    await safeDeleteObject(storage, asset.gcsPathOriginal);
  }
  await deleteCollectionDocs(auditsCollection(orgId, notebookId));
  await deleteCollectionDocs(entriesCollection(orgId, notebookId));
  await deleteCollectionDocs(assetsCollection(orgId, notebookId));
  await deleteCollectionDocs(notebookMembersCollection(orgId, notebookId));
}

async function syncAssetUsedBy(
  orgId: string,
  notebookId: string,
  entryId: string,
  oldIds: string[],
  newIds: string[]
) {
  const db = dbRoot();
  const oldSet = new Set(oldIds);
  const newSet = new Set(newIds);
  for (const id of newSet) {
    if (oldSet.has(id)) continue;
    const ref = db.doc(assetPath(orgId, notebookId, id));
    const snap = await ref.get();
    if (!snap.exists) continue;
    const usedBy = [...((snap.data() as AssetMetadata).usedBy || [])];
    if (!usedBy.includes(entryId)) {
      usedBy.push(entryId);
      await ref.update({ usedBy });
    }
  }
  for (const id of oldSet) {
    if (newSet.has(id)) continue;
    const ref = db.doc(assetPath(orgId, notebookId, id));
    const snap = await ref.get();
    if (!snap.exists) continue;
    const usedBy = ((snap.data() as AssetMetadata).usedBy || []).filter((e) => e !== entryId);
    await ref.update({ usedBy });
  }
}

async function assertNotebookAccess(
  user: ReturnType<typeof getUser>,
  orgId: string,
  notebookId: string
) {
  const snap = await getFirestore().doc(notebookPath(orgId, notebookId)).get();
  if (!snap.exists) {
    const err = new Error("not found");
    (err as Error & { statusCode: number }).statusCode = 404;
    throw err;
  }
  await requireNotebookAccess(user, orgId, snap.data() as NotebookSummaryV5);
  return snap;
}

export async function registerOrgRoutes(app: FastifyInstance, storage: StoragePort) {
  const db = () => getFirestore();

  app.get("/orgs", async (request) => {
    const user = getUser(request);
    if (isServiceAdmin(user)) {
      const snap = await db().collection("organizations").get();
      const out = [];
      for (const d of snap.docs) {
        const member = await db().doc(memberPath(d.id, user.uid)).get();
        out.push({
          id: d.id,
          ...d.data(),
          role: (member.data() as OrgMember | undefined)?.role ?? null,
        });
      }
      return out;
    }
    const orgs: Array<Organization & { role?: OrgRole }> = [];
    const all = await db().collection("organizations").get();
    for (const doc of all.docs) {
      const member = await db().doc(memberPath(doc.id, user.uid)).get();
      if (member.exists) {
        orgs.push({
          id: doc.id,
          ...(doc.data() as Omit<Organization, "id">),
          role: (member.data() as OrgMember).role,
        });
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
    const member = await db().doc(memberPath(orgId, user.uid)).get();
    return {
      id: snap.id,
      ...snap.data(),
      role: (member.data() as OrgMember | undefined)?.role ?? null,
    };
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
      await purgeNotebookStorage(storage, orgId, nb.id);
      await nb.ref.delete();
    }
    const teams = await db().collection(teamsCollection(orgId)).get();
    for (const t of teams.docs) {
      await deleteCollectionDocs(teamMembersCollection(orgId, t.id));
      await t.ref.delete();
    }
    await deleteCollectionDocs(membersCollection(orgId));
    const invites = await db().collection("invites").where("orgId", "==", orgId).get();
    const inviteBatch = db().batch();
    for (const inv of invites.docs) inviteBatch.delete(inv.ref);
    if (!invites.empty) await inviteBatch.commit();
    await ref.delete();
    return { ok: true };
  });

  // ── Teams ──────────────────────────────────────────────────────────────

  app.get("/orgs/:orgId/teams", async (request) => {
    const user = getUser(request);
    const { orgId } = request.params as { orgId: string };
    await requireOrgMember(user, orgId);
    const snap = await db().collection(teamsCollection(orgId)).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });

  app.post("/orgs/:orgId/teams", async (request, reply) => {
    const user = getUser(request);
    const { orgId } = request.params as { orgId: string };
    await requireOrgMember(user, orgId, "admin");
    const body = request.body as { name?: string };
    const name = body.name?.trim();
    if (!name) return reply.code(400).send({ error: "name required" });
    const id = randomUUID();
    const ts = nowIso();
    const team: Team = {
      id,
      orgId,
      name,
      createdBy: user.uid,
      createdAt: ts,
      updatedAt: ts,
    };
    await db().doc(teamPath(orgId, id)).set(omitUndefined({ ...team }));
    return team;
  });

  app.get("/orgs/:orgId/teams/:teamId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, teamId } = request.params as { orgId: string; teamId: string };
    await requireOrgMember(user, orgId);
    const snap = await db().doc(teamPath(orgId, teamId)).get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    return { id: snap.id, ...snap.data() };
  });

  app.patch("/orgs/:orgId/teams/:teamId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, teamId } = request.params as { orgId: string; teamId: string };
    await requireOrgMember(user, orgId, "admin");
    const body = request.body as { name?: string };
    const name = body.name?.trim();
    if (!name) return reply.code(400).send({ error: "name required" });
    const ref = db().doc(teamPath(orgId, teamId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    const patch = { name, updatedAt: nowIso() };
    await ref.update(patch);
    return { id: teamId, ...snap.data(), ...patch };
  });

  app.delete("/orgs/:orgId/teams/:teamId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, teamId } = request.params as { orgId: string; teamId: string };
    await requireOrgMember(user, orgId, "admin");
    const ref = db().doc(teamPath(orgId, teamId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    await deleteCollectionDocs(teamMembersCollection(orgId, teamId));
    await ref.delete();
    return { ok: true };
  });

  app.get("/orgs/:orgId/teams/:teamId/members", async (request) => {
    const user = getUser(request);
    const { orgId, teamId } = request.params as { orgId: string; teamId: string };
    await requireOrgMember(user, orgId);
    const snap = await db().collection(teamMembersCollection(orgId, teamId)).get();
    return snap.docs.map((d) => d.data());
  });

  app.put("/orgs/:orgId/teams/:teamId/members/:uid", async (request, reply) => {
    const user = getUser(request);
    const { orgId, teamId, uid } = request.params as {
      orgId: string;
      teamId: string;
      uid: string;
    };
    await requireOrgMember(user, orgId, "admin");
    const teamSnap = await db().doc(teamPath(orgId, teamId)).get();
    if (!teamSnap.exists) return reply.code(404).send({ error: "team not found" });
    const orgMember = await db().doc(memberPath(orgId, uid)).get();
    if (!orgMember.exists) {
      return reply.code(400).send({ error: "user must be an org member first" });
    }
    const membership: TeamMembership = { uid, joinedAt: nowIso() };
    await db().doc(teamMemberPath(orgId, teamId, uid)).set(membership);
    return membership;
  });

  app.delete("/orgs/:orgId/teams/:teamId/members/:uid", async (request, reply) => {
    const user = getUser(request);
    const { orgId, teamId, uid } = request.params as {
      orgId: string;
      teamId: string;
      uid: string;
    };
    await requireOrgMember(user, orgId, "admin");
    const ref = db().doc(teamMemberPath(orgId, teamId, uid));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
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
    const body = request.body as { email?: string; role?: OrgRole; expiresInDays?: number };
    if (!body.email) return reply.code(400).send({ error: "email required" });
    const id = randomUUID();
    const ttlDays = Math.min(
      90,
      Math.max(1, Number(body.expiresInDays) || Number(process.env.INVITE_TTL_DAYS) || 14)
    );
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
    const invite: Invite = {
      id,
      orgId,
      email: body.email.toLowerCase(),
      role: body.role === "admin" ? "admin" : "member",
      createdBy: user.uid,
      createdAt: nowIso(),
      expiresAt,
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
    if (invite.expiresAt && Date.parse(invite.expiresAt) < Date.now()) {
      return reply.code(400).send({ error: "invite expired" });
    }
    const inviteEmail = (invite.email || "").trim().toLowerCase();
    const userEmail = (user.email || "").trim().toLowerCase();
    if (inviteEmail && userEmail && inviteEmail !== userEmail) {
      return reply.code(403).send({ error: "invite email does not match signed-in user" });
    }
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
    const role = await requireOrgMember(user, orgId);
    const snap = await db().collection(notebooksCollection(orgId)).get();
    const out = [];
    for (const d of snap.docs) {
      const data = d.data() as NotebookSummaryV5;
      if (await canAccessNotebook(user, orgId, data, role)) {
        out.push({ id: d.id, ...data });
      }
    }
    return out;
  });

  app.post("/orgs/:orgId/notebooks", async (request, reply) => {
    const user = getUser(request);
    const { orgId } = request.params as { orgId: string };
    await requireOrgMember(user, orgId);
    const body = request.body as {
      name?: string;
      title?: string;
      subtitle?: string;
      logoAssetId?: string;
      access?: NotebookAccess;
    };
    const name = body.name?.trim() || "Untitled Notebook";
    const id = randomUUID();
    const ts = nowIso();
    const summary: NotebookSummaryV5 & { id: string } = {
      id,
      schemaVersion: NOTEBOOK_SCHEMA_VERSION,
      orgId,
      name,
      title: body.title?.trim() || name,
      subtitle: body.subtitle?.trim() || undefined,
      logoAssetId: body.logoAssetId,
      folders: {},
      access: body.access ?? defaultNotebookAccess(),
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
    const snap = await db().doc(notebookPath(orgId, notebookId)).get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    const data = snap.data() as NotebookSummaryV5;
    await requireNotebookAccess(user, orgId, data);
    return { id: snap.id, ...data };
  });

  /** SSE: notebook metadata fanout (website uses fetch + Authorization; not EventSource). */
  app.get("/orgs/:orgId/notebooks/:notebookId/events", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookAccess(user, orgId, notebookId);

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const unsub = subscribeNotebookEvents(orgId, notebookId, reply.raw);
    const onClose = () => {
      unsub();
      if (!reply.raw.writableEnded) reply.raw.end();
    };
    request.raw.on("close", onClose);
    request.raw.on("error", onClose);
  });

  app.patch("/orgs/:orgId/notebooks/:notebookId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    const ref = db().doc(notebookPath(orgId, notebookId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    const existing = snap.data() as NotebookSummaryV5;
    await requireNotebookAccess(user, orgId, existing);
    const body = request.body as Partial<NotebookSummaryV5>;
    const patch: Record<string, unknown> = { updatedAt: nowIso() };
    for (const key of [
      "name",
      "title",
      "subtitle",
      "logoAssetId",
      "folders",
      "access",
      "phases",
      "lastCompiled",
    ] as const) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    await ref.update(omitUndefined(patch));
    const merged = { id: notebookId, ...existing, ...patch };
    publishNotebookEvent(orgId, notebookId, {
      type: "notebook.updated",
      notebook: merged as Record<string, unknown>,
      at: String(patch.updatedAt),
    });
    if (body.phases !== undefined) {
      void revalidateNotebookEntryMetadata(orgId, notebookId, body.phases).catch((err) => {
        console.warn("[revalidate] notebook phases", orgId, notebookId, err);
      });
    }
    return merged;
  });

  app.delete("/orgs/:orgId/notebooks/:notebookId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await requireOrgMember(user, orgId, "admin");
    const ref = db().doc(notebookPath(orgId, notebookId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    await purgeNotebookStorage(storage, orgId, notebookId);
    await ref.delete();
    return { ok: true };
  });

  // ── Folders (mutate notebook.folders map without full replace) ──────────

  app.post("/orgs/:orgId/notebooks/:notebookId/folders", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    const body = request.body as { name?: string; parentId?: string | null; order?: number };
    const name = body.name?.trim();
    if (!name) return reply.code(400).send({ error: "name required" });
    const ref = db().doc(notebookPath(orgId, notebookId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    const nb = snap.data() as NotebookSummaryV5;
    await requireNotebookAccess(user, orgId, nb);
    const id = randomUUID();
    const folder: NotebookFolder = {
      name,
      parentId: body.parentId ?? null,
      order: body.order ?? Object.keys(nb.folders ?? {}).length,
    };
    const folders = { ...(nb.folders ?? {}), [id]: folder };
    const ts = nowIso();
    await ref.update({ folders, updatedAt: ts });
    publishNotebookEvent(orgId, notebookId, {
      type: "notebook.updated",
      notebook: { id: notebookId, folders, updatedAt: ts },
      at: ts,
    });
    return { id, folder, folders };
  });

  app.patch("/orgs/:orgId/notebooks/:notebookId/folders/:folderId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, folderId } = request.params as {
      orgId: string;
      notebookId: string;
      folderId: string;
    };
    const body = request.body as Partial<NotebookFolder>;
    const ref = db().doc(notebookPath(orgId, notebookId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    const nb = snap.data() as NotebookSummaryV5;
    await requireNotebookAccess(user, orgId, nb);
    const existing = nb.folders?.[folderId];
    if (!existing) return reply.code(404).send({ error: "folder not found" });
    const folder: NotebookFolder = {
      name: body.name?.trim() || existing.name,
      parentId: body.parentId !== undefined ? body.parentId : existing.parentId,
      order: body.order !== undefined ? body.order : existing.order,
    };
    const folders = { ...(nb.folders ?? {}), [folderId]: folder };
    const ts = nowIso();
    await ref.update({ folders, updatedAt: ts });
    publishNotebookEvent(orgId, notebookId, {
      type: "notebook.updated",
      notebook: { id: notebookId, folders, updatedAt: ts },
      at: ts,
    });
    return { id: folderId, folder, folders };
  });

  app.delete("/orgs/:orgId/notebooks/:notebookId/folders/:folderId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, folderId } = request.params as {
      orgId: string;
      notebookId: string;
      folderId: string;
    };
    const ref = db().doc(notebookPath(orgId, notebookId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    const nb = snap.data() as NotebookSummaryV5;
    await requireNotebookAccess(user, orgId, nb);
    if (!nb.folders?.[folderId]) return reply.code(404).send({ error: "folder not found" });
    const entries = await db().collection(entriesCollection(orgId, notebookId)).get();
    const batch = db().batch();
    const ts = nowIso();
    for (const doc of entries.docs) {
      const meta = doc.data() as EntryMetadataV5;
      if (meta.folderId === folderId) {
        batch.update(doc.ref, { folderId: null, updatedAt: ts });
      }
    }
    const folders = { ...(nb.folders ?? {}) };
    delete folders[folderId];
    batch.update(ref, { folders, updatedAt: ts });
    await batch.commit();
    publishNotebookEvent(orgId, notebookId, {
      type: "notebook.updated",
      notebook: { id: notebookId, folders, updatedAt: ts },
      at: ts,
    });
    publishNotebookEvent(orgId, notebookId, { type: "entries.changed", at: ts });
    return { ok: true, folders };
  });

  // ── Notebook Members (contributor roster) ──────────────────────────────

  app.get("/orgs/:orgId/notebooks/:notebookId/members", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    const nb = await db().doc(notebookPath(orgId, notebookId)).get();
    if (!nb.exists) return reply.code(404).send({ error: "not found" });
    await requireNotebookAccess(user, orgId, nb.data() as NotebookSummaryV5);
    const snap = await db().collection(notebookMembersCollection(orgId, notebookId)).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });

  app.post("/orgs/:orgId/notebooks/:notebookId/members", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    const nb = await db().doc(notebookPath(orgId, notebookId)).get();
    if (!nb.exists) return reply.code(404).send({ error: "not found" });
    await requireNotebookAccess(user, orgId, nb.data() as NotebookSummaryV5);
    const body = request.body as Partial<NotebookMember> & { id?: string };
    const name = body.name?.trim();
    if (!name) return reply.code(400).send({ error: "name required" });
    const id = body.id || randomUUID();
    const member: NotebookMember = omitUndefined({
      id,
      name,
      role: body.role?.trim() || "Member",
      order: body.order ?? 0,
      imageAssetId: body.imageAssetId,
      linkedUid: body.linkedUid,
    }) as NotebookMember;
    await db().doc(notebookMemberPath(orgId, notebookId, id)).set(member);
    return member;
  });

  app.patch("/orgs/:orgId/notebooks/:notebookId/members/:memberId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, memberId } = request.params as {
      orgId: string;
      notebookId: string;
      memberId: string;
    };
    const nb = await db().doc(notebookPath(orgId, notebookId)).get();
    if (!nb.exists) return reply.code(404).send({ error: "not found" });
    await requireNotebookAccess(user, orgId, nb.data() as NotebookSummaryV5);
    const ref = db().doc(notebookMemberPath(orgId, notebookId, memberId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    const body = request.body as Partial<NotebookMember>;
    const patch: Record<string, unknown> = {};
    for (const key of ["name", "role", "order", "imageAssetId", "linkedUid"] as const) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    await ref.update(omitUndefined(patch));
    return { id: memberId, ...snap.data(), ...patch };
  });

  app.delete("/orgs/:orgId/notebooks/:notebookId/members/:memberId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, memberId } = request.params as {
      orgId: string;
      notebookId: string;
      memberId: string;
    };
    const nb = await db().doc(notebookPath(orgId, notebookId)).get();
    if (!nb.exists) return reply.code(404).send({ error: "not found" });
    await requireNotebookAccess(user, orgId, nb.data() as NotebookSummaryV5);
    const ref = db().doc(notebookMemberPath(orgId, notebookId, memberId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    await ref.delete();
    return { ok: true };
  });

  app.get("/orgs/:orgId/notebooks/:notebookId/entries", async (request) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookAccess(user, orgId, notebookId);
    const snap = await db().collection(entriesCollection(orgId, notebookId)).get();
    const entries: Record<string, EntryMetadataV5> = {};
    for (const doc of snap.docs) entries[doc.id] = doc.data() as EntryMetadataV5;
    return { entries };
  });

  /**
   * Reassign sibling indices without touching the other axis:
   * - explorer: `explorerOrder` (+ optional `folderId`) within a folder
   * - day: `order` (+ optional `date`) within a calendar day
   */
  app.post("/orgs/:orgId/notebooks/:notebookId/entries/reorder", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookAccess(user, orgId, notebookId);
    const body = request.body as {
      mode?: "explorer" | "day";
      orderedIds?: string[];
      folderId?: string | null;
      date?: string;
    };
    const mode = body.mode;
    const orderedIds = body.orderedIds ?? [];
    if (mode !== "explorer" && mode !== "day") {
      return reply.code(400).send({ error: "mode must be explorer or day" });
    }
    if (!orderedIds.length) return reply.code(400).send({ error: "orderedIds required" });

    const db = dbRoot();
    const ts = nowIso();
    // Firestore batch limit 500; notebooks stay well under that.
    const batch = db.batch();
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      const ref = db.doc(entryPath(orgId, notebookId, id));
      if (mode === "explorer") {
        const patch: Record<string, unknown> = { explorerOrder: i, updatedAt: ts };
        if (body.folderId !== undefined) patch.folderId = body.folderId;
        batch.update(ref, omitUndefined(patch));
      } else {
        const patch: Record<string, unknown> = { order: i, updatedAt: ts };
        if (body.date !== undefined) patch.date = body.date;
        batch.update(ref, omitUndefined(patch));
      }
    }
    try {
      await batch.commit();
    } catch (err) {
      return reply.code(400).send({
        error: "reorder failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    publishNotebookEvent(orgId, notebookId, { type: "entries.changed", at: ts });
    return { ok: true, mode, orderedIds };
  });

  app.post("/orgs/:orgId/notebooks/:notebookId/entries", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookAccess(user, orgId, notebookId);
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
      explorerOrder: body.explorerOrder ?? body.order ?? 0,
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
    const result = { id, ...entry };
    publishNotebookEvent(orgId, notebookId, {
      type: "entry.upserted",
      entryId: id,
      entry: result as Record<string, unknown>,
      at: ts,
    });
    return result;
  });

  app.get("/orgs/:orgId/notebooks/:notebookId/entries/:entryId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, entryId } = request.params as {
      orgId: string;
      notebookId: string;
      entryId: string;
    };
    await assertNotebookAccess(user, orgId, notebookId);
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
    await assertNotebookAccess(user, orgId, notebookId);
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
      "explorerOrder",
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
    const existing = snap.data() as EntryMetadataV5;
    const patch: Record<string, unknown> = { updatedAt: nowIso() };
    for (const key of allowed) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    await ref.update(omitUndefined(patch));
    if (body.assetIds !== undefined) {
      await syncAssetUsedBy(
        orgId,
        notebookId,
        entryId,
        existing.assetIds ?? [],
        body.assetIds ?? []
      );
    }
    const result = { id: entryId, ...existing, ...patch };
    publishNotebookEvent(orgId, notebookId, {
      type: "entry.upserted",
      entryId,
      entry: result as Record<string, unknown>,
      at: String(patch.updatedAt),
    });
    return result;
  });

  app.delete("/orgs/:orgId/notebooks/:notebookId/entries/:entryId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, entryId } = request.params as {
      orgId: string;
      notebookId: string;
      entryId: string;
    };
    await assertNotebookAccess(user, orgId, notebookId);
    const ref = db().doc(entryPath(orgId, notebookId, entryId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    const meta = snap.data() as EntryMetadataV5;
    await safeDeleteObject(storage, meta.tipTapGcsPath || gcsKeys.tipTap(orgId, notebookId, entryId));
    await safeDeleteObject(storage, meta.yjsGcsPath || gcsKeys.yjs(orgId, notebookId, entryId));
    if (meta.assetIds?.length) {
      await syncAssetUsedBy(orgId, notebookId, entryId, meta.assetIds, []);
    }
    await ref.delete();
    const ts = nowIso();
    publishNotebookEvent(orgId, notebookId, {
      type: "entry.deleted",
      entryId,
      at: ts,
    });
    return { ok: true };
  });

  app.get("/orgs/:orgId/notebooks/:notebookId/entries/:entryId/content", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, entryId } = request.params as {
      orgId: string;
      notebookId: string;
      entryId: string;
    };
    await assertNotebookAccess(user, orgId, notebookId);
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
    await assertNotebookAccess(user, orgId, notebookId);
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

  // Browser uploads go through Core (auth + CORS). Pass the raw stream — do not buffer.
  const binaryTypes = [
    "application/octet-stream",
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/gif",
    "image/webp",
    "image/svg+xml",
  ];
  for (const type of binaryTypes) {
    app.addContentTypeParser(type, (_req, payload, done) => {
      done(null, payload);
    });
  }

  app.post("/orgs/:orgId/notebooks/:notebookId/assets", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookAccess(user, orgId, notebookId);
    const body = request.body as {
      contentType?: string;
      byteSize?: number;
      usedByEntryId?: string;
    };
    const id = randomUUID();
    const gcsPath = gcsKeys.asset(orgId, notebookId, id, "compressed");
    const usedBy = body.usedByEntryId ? [body.usedByEntryId] : [];
    const asset: AssetMetadata = {
      id,
      contentType: body.contentType || "application/octet-stream",
      byteSize: body.byteSize ?? 0,
      gcsPath,
      createdBy: user.uid,
      createdAt: nowIso(),
      usedBy,
    };
    await db().doc(assetPath(orgId, notebookId, id)).set(omitUndefined({ ...asset }));
    // Relative path the website uploads to with Bearer auth (not a GCS signed URL).
    const uploadPath = `/orgs/${orgId}/notebooks/${notebookId}/assets/${id}/content`;
    return { asset, uploadPath, uploadUrl: uploadPath };
  });

  app.put("/orgs/:orgId/notebooks/:notebookId/assets/:assetId/content", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, assetId } = request.params as {
      orgId: string;
      notebookId: string;
      assetId: string;
    };
    await assertNotebookAccess(user, orgId, notebookId);
    const ref = db().doc(assetPath(orgId, notebookId, assetId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    const asset = snap.data() as AssetMetadata;
    const contentType =
      (typeof request.headers["content-type"] === "string"
        ? request.headers["content-type"].split(";")[0].trim()
        : null) || asset.contentType;
    const body = request.body as NodeJS.ReadableStream | Uint8Array | Buffer | undefined;
    let byteSize: number;
    if (body && typeof (body as NodeJS.ReadableStream).pipe === "function") {
      const result = await storage.putObjectStream(
        asset.gcsPath,
        body as import("node:stream").Readable,
        contentType
      );
      byteSize = result.byteSize;
    } else if (body instanceof Uint8Array || Buffer.isBuffer(body)) {
      const data = Buffer.from(body);
      await storage.putObject(asset.gcsPath, data, contentType);
      byteSize = data.byteLength;
    } else {
      return reply.code(400).send({ error: "expected binary body stream" });
    }
    await ref.update({ byteSize, contentType });
    return { ok: true, byteSize };
  });

  app.get("/orgs/:orgId/notebooks/:notebookId/assets", async (request) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookAccess(user, orgId, notebookId);
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
    await assertNotebookAccess(user, orgId, notebookId);
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
    await assertNotebookAccess(user, orgId, notebookId);
    const ref = db().doc(assetPath(orgId, notebookId, assetId));
    const snap = await ref.get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    const asset = snap.data() as AssetMetadata;
    await safeDeleteObject(storage, asset.gcsPath);
    await safeDeleteObject(storage, asset.gcsPathOriginal);
    await ref.delete();
    return { ok: true };
  });

  // ── Compiled PDF exports ─────────────────────────────────────────────────

  app.put("/orgs/:orgId/notebooks/:notebookId/exports/:exportId/content", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, exportId } = request.params as {
      orgId: string;
      notebookId: string;
      exportId: string;
    };
    await assertNotebookAccess(user, orgId, notebookId);
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
      return reply.code(400).send({ error: "expected binary body stream" });
    }
    const ts = nowIso();
    await db().doc(notebookPath(orgId, notebookId)).update({
      lastCompiled: ts,
      updatedAt: ts,
    });
    return { ok: true, exportId, gcsPath: key, lastCompiled: ts, byteSize };
  });

  app.get("/orgs/:orgId/notebooks/:notebookId/exports/:exportId/url", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, exportId } = request.params as {
      orgId: string;
      notebookId: string;
      exportId: string;
    };
    await assertNotebookAccess(user, orgId, notebookId);
    const key = gcsKeys.exportPdf(orgId, notebookId, exportId);
    const exists = await storage.getObject(key);
    if (!exists) return reply.code(404).send({ error: "export not found" });
    const url = await storage.getSignedUrl(key, "read");
    return { url, exportId, gcsPath: key };
  });
}
