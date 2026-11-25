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
  orgSlugPath,
  publicNotebookKeyPath,
  publicNotebookKeysCollection,
  userPath,
  invitePath,
  donorsCollection,
  projectsCollection,
  eventsCollection,
  socialLinksCollection,
  publicMembersCollection,
  entriesCollection,
  entryPath,
  entryCommentPath,
  entryCommentsCollection,
  assetsCollection,
  assetPath,
  orgAssetsCollection,
  orgAssetPath,
  judgmentsCollection,
  rubricsCollection,
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
  type NotebookSummary,
  type NotebookAccess,
  type NotebookMember,
  type Team,
  type TeamMembership,
  type EntryMetadata,
  type EntryComment,
  type AssetMetadata,
  type Invite,
  type InviteStatus,
  type NotebookFolder,
  compileExportPath,
  compileExportsCollection,
} from "@engineering-notebook/shared";
import { getMetadataStore, type MetadataBatchOp } from "../db/metadataStore.js";
import {
  deleteCompileExport,
  recordCompileExport,
  recordCompilePreview,
  saveCurrentPreviewAsVersion,
  resolveExportPdfKey,
} from "../compile/recordCompileExport.js";
import {
  createShareLink,
  listShareLinks,
  revokeShareLink,
  updateShareLink,
} from "../compile/shareLinks.js";
import { omitUndefined } from "../db/sanitize.js";
import {
  requireOrgMember,
  requireOrgReader,
  requireNotebookAccess,
  canAccessNotebook,
  isServiceAdmin,
  assertNotebookNotArchived,
} from "../rbac.js";
import { getUser } from "../http/authPlugin.js";
import type { StoragePort } from "../storage/storagePort.js";
import { publishNotebookEvent, subscribeNotebookEvents } from "../realtime/notebookEvents.js";
import { createJobDispatch } from "../jobs/createJobDispatch.js";
import { enqueueNotebookJob } from "../jobs/enqueueJob.js";
import { getJob } from "../jobs/jobStore.js";
import {
  limitInviteSend,
  rateLimitReply,
} from "../http/rateLimit.js";
import {
  entryCreateSchema,
  entryPatchSchema,
  inviteCreateSchema,
  parseBody,
} from "../http/validate.js";
import type { NotificationPort } from "../notifications/notificationPort.js";

const jobDispatch = createJobDispatch();

const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "o",
  "orgs",
  "n",
  "help",
  "about",
  "account",
  "login",
  "public",
]);

function normalizeOrgSlug(raw: string): string | null {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (!slug || slug.length < 2) return null;
  return slug;
}

/** Generate a unique slug from an organization name with automatic collision resolution. */
async function generateUniqueOrgSlug(
  name: string,
  store: ReturnType<typeof getMetadataStore>
): Promise<string> {
  let base = normalizeOrgSlug(name);
  if (!base || RESERVED_SLUGS.has(base)) {
    base = base ? `org-${base}` : "org";
  }
  // Try base first
  let candidate = base.slice(0, 64);
  const existing = await store.get(orgSlugPath(candidate));
  if (!existing && !RESERVED_SLUGS.has(candidate)) {
    return candidate;
  }
  // Collision loop with increasing -2, -3 suffix
  let suffix = 2;
  while (suffix < 10000) {
    const suffixStr = `-${suffix}`;
    const truncatedBase = base.slice(0, 64 - suffixStr.length).replace(/-+$/, "");
    candidate = `${truncatedBase}${suffixStr}`;
    const taken = await store.get(orgSlugPath(candidate));
    if (!taken && !RESERVED_SLUGS.has(candidate)) {
      return candidate;
    }
    suffix++;
  }
  return `${base.slice(0, 50)}-${randomUUID().slice(0, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function resolveInviteStatus(invite: Invite): InviteStatus {
  if (invite.status === "accepted" || invite.status === "revoked" || invite.status === "pending") {
    return invite.status;
  }
  if (invite.acceptedAt) return "accepted";
  return "pending";
}

/** Strip MetadataStore `id` so the remaining fields match prior `.data()` shapes. */
function withoutId<T extends Record<string, unknown>>(doc: T): Omit<T, "id"> {
  const { id: _id, ...rest } = doc;
  return rest;
}

async function safeDeletePath(path: string) {
  try {
    await getMetadataStore().delete(path);
  } catch {
    // ignore missing / race
  }
}

/** Recompute title/authors/date/phase validity for all entries (keeps resource/ref errors). */
async function revalidateNotebookEntryMetadata(
  orgId: string,
  notebookId: string,
  phases: NotebookSummary["phases"] | undefined
) {
  const store = getMetadataStore();
  const docs = await store.query(entriesCollection(orgId, notebookId));
  if (docs.length === 0) return;
  const phaseMap = (phases || {}) as Record<string, unknown>;
  const ts = nowIso();
  let ops: MetadataBatchOp[] = [];
  const flush = async () => {
    if (ops.length === 0) return;
    await store.batch(ops);
    ops = [];
  };
  const changed: Array<{ id: string; entry: EntryMetadata }> = [];
  for (const doc of docs) {
    const id = String(doc.id);
    const entry = withoutId(doc) as unknown as EntryMetadata;
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
    ops.push({
      op: "update",
      path: entryPath(orgId, notebookId, id),
      data: { validationErrors, isValid, updatedAt: ts },
    });
    changed.push({ id, entry: next });
    if (ops.length >= 400) await flush();
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
  const store = getMetadataStore();
  const docs = await store.query(collectionPath);
  if (docs.length === 0) return;
  await store.batch(
    docs.map((d) => ({ op: "delete" as const, path: `${collectionPath}/${d.id}` }))
  );
}

async function safeDeleteObject(storage: StoragePort, key: string | undefined | null) {
  if (!key) return;
  try {
    await storage.deleteObject(key);
  } catch (err) {
    console.warn("[storage] deleteObject failed", key, err);
  }
}

/** Delete metadata children + GCS blobs for one notebook. */
async function purgeNotebookStorage(
  storage: StoragePort,
  orgId: string,
  notebookId: string
) {
  const store = getMetadataStore();
  const entries = await store.query(entriesCollection(orgId, notebookId));
  for (const doc of entries) {
    const id = String(doc.id);
    const meta = withoutId(doc) as unknown as EntryMetadata;
    await safeDeleteObject(storage, meta.tipTapGcsPath || gcsKeys.tipTap(orgId, notebookId, id));
    await safeDeleteObject(storage, meta.yjsGcsPath || gcsKeys.yjs(orgId, notebookId, id));
  }
  const assets = await store.query(assetsCollection(orgId, notebookId));
  for (const doc of assets) {
    const asset = withoutId(doc) as unknown as AssetMetadata;
    await safeDeleteObject(storage, asset.gcsPath);
    await safeDeleteObject(storage, asset.gcsPathOriginal);
  }
  await deleteCollectionDocs(judgmentsCollection(orgId, notebookId));
  await deleteCollectionDocs(rubricsCollection(orgId, notebookId));
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
  const store = getMetadataStore();
  const oldSet = new Set(oldIds);
  const newSet = new Set(newIds);
  for (const id of newSet) {
    if (oldSet.has(id)) continue;
    const path = assetPath(orgId, notebookId, id);
    const snap = await store.get(path);
    if (!snap) continue;
    const usedBy = [...(((snap as unknown as AssetMetadata).usedBy || []) as string[])];
    if (!usedBy.includes(entryId)) {
      usedBy.push(entryId);
      await store.update(path, { usedBy });
    }
  }
  for (const id of oldSet) {
    if (newSet.has(id)) continue;
    const path = assetPath(orgId, notebookId, id);
    const snap = await store.get(path);
    if (!snap) continue;
    const usedBy = (((snap as unknown as AssetMetadata).usedBy || []) as string[]).filter(
      (e) => e !== entryId
    );
    await store.update(path, { usedBy });
  }
}

async function assertNotebookAccess(
  user: ReturnType<typeof getUser>,
  orgId: string,
  notebookId: string,
  opts?: { write?: boolean }
) {
  const data = await getMetadataStore().get(notebookPath(orgId, notebookId));
  if (!data) {
    const err = new Error("not found");
    (err as Error & { statusCode: number }).statusCode = 404;
    throw err;
  }
  const notebook = data as unknown as NotebookSummary;
  await requireNotebookAccess(user, orgId, notebook, {
    write: opts?.write === true,
  });
  return notebook;
}

async function assertNotebookWritable(
  user: ReturnType<typeof getUser>,
  orgId: string,
  notebookId: string
) {
  const data = await assertNotebookAccess(user, orgId, notebookId, { write: true });
  assertNotebookNotArchived(data);
  return data;
}

export async function registerOrgRoutes(
  app: FastifyInstance,
  storage: StoragePort,
  notifications: NotificationPort
) {
  const store = () => getMetadataStore();

  app.get("/org", async (request) => {
    const user = getUser(request);
    if (isServiceAdmin(user)) {
      const rows = await store().query("org");
      const out = [];
      for (const d of rows) {
        const id = String(d.id);
        const member = await store().get(memberPath(id, user.uid));
        out.push({
          id,
          ...withoutId(d),
          role: (member as OrgMember | null)?.role ?? null,
        });
      }
      return out;
    }
    const orgs: Array<Organization & { role?: OrgRole }> = [];
    const all = await store().query("org");
    for (const doc of all) {
      const id = String(doc.id);
      const member = await store().get(memberPath(id, user.uid));
      if (member) {
        orgs.push({
          id,
          ...(withoutId(doc) as unknown as Omit<Organization, "id">),
          role: (member as unknown as OrgMember).role,
        });
      }
    }
    return orgs;
  });

  app.post("/org", async (request, reply) => {
    const user = getUser(request);
    const body = request.body as { name?: string };
    const name = body.name?.trim();
    if (!name) return reply.code(400).send({ error: "name required" });

    const id = randomUUID();
    const ts = nowIso();
    const slug = await generateUniqueOrgSlug(name, store());
    const org: Organization = {
      id,
      name,
      slug,
      createdBy: user.uid,
      createdAt: ts,
      updatedAt: ts,
    };
    const member = omitUndefined({
      uid: user.uid,
      role: "owner" as const,
      email: user.email,
      displayName: user.displayName,
      joinedAt: ts,
    }) as OrgMember;
    await store().set(orgPath(id), org as unknown as Record<string, unknown>);
    await store().set(orgSlugPath(slug), { orgId: id, updatedAt: ts });
    await store().set(memberPath(id, user.uid), member as unknown as Record<string, unknown>);
    return org;
  });

  app.get("/org/:orgId", async (request, reply) => {
    const user = getUser(request);
    const { orgId } = request.params as { orgId: string };
    await requireOrgReader(user, orgId);
    const snap = await store().get(orgPath(orgId));
    if (!snap) return reply.code(404).send({ error: "not found" });
    const member = await store().get(memberPath(orgId, user.uid));
    const m = member as OrgMember | null;
    const effectiveRole = isServiceAdmin(user) ? "owner" : (m?.role ?? null);
    return {
      id: orgId,
      ...withoutId(snap),
      role: effectiveRole,
      memberStatus: m?.status === "alumni" ? "alumni" : "active",
    };
  });

  app.patch("/org/:orgId", async (request, reply) => {
    const user = getUser(request);
    const { orgId } = request.params as { orgId: string };
    await requireOrgMember(user, orgId, "admin");
    const body = request.body as {
      name?: string;
      slug?: string;
      publicPage?: Organization["publicPage"];
    };
    const path = orgPath(orgId);
    const snap = await store().get(path);
    if (!snap) return reply.code(404).send({ error: "not found" });
    const existing = withoutId(snap) as unknown as Organization;
    const patch: Record<string, unknown> = { updatedAt: nowIso() };
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) return reply.code(400).send({ error: "name required" });
      patch.name = name;
    }
    if (body.publicPage !== undefined) patch.publicPage = body.publicPage;
    if (body.slug !== undefined) {
      const slug = normalizeOrgSlug(body.slug);
      if (!slug) return reply.code(400).send({ error: "invalid slug" });
      if (RESERVED_SLUGS.has(slug)) return reply.code(400).send({ error: "slug reserved" });
      if (slug !== existing.slug) {
        const taken = await store().get(orgSlugPath(slug));
        if (taken && (taken as { orgId?: string }).orgId !== orgId) {
          return reply.code(409).send({ error: "slug_taken" });
        }
        if (existing.slug) {
          await safeDeletePath(orgSlugPath(existing.slug));
        }
        await store().set(orgSlugPath(slug), { orgId, updatedAt: nowIso() });
        patch.slug = slug;
      }
    }
    if (Object.keys(patch).length <= 1 && body.name === undefined && body.slug === undefined && body.publicPage === undefined) {
      return reply.code(400).send({ error: "no fields to update" });
    }
    await store().update(path, omitUndefined(patch));
    const { id: _ignoreId, ...existingRest } = existing as Organization & { id?: string };
    return { id: orgId, ...existingRest, ...patch };
  });

  app.delete("/org/:orgId", async (request, reply) => {
    const user = getUser(request);
    const { orgId } = request.params as { orgId: string };
    await requireOrgMember(user, orgId, "owner");
    const path = orgPath(orgId);
    const snap = await store().get(path);
    if (!snap) return reply.code(404).send({ error: "not found" });

    const notebooks = await store().query(notebooksCollection(orgId));
    for (const nb of notebooks) {
      const nbId = String(nb.id);
      await purgeNotebookStorage(storage, orgId, nbId);
      await store().delete(notebookPath(orgId, nbId));
    }
    const teams = await store().query(teamsCollection(orgId));
    for (const t of teams) {
      const teamId = String(t.id);
      await deleteCollectionDocs(teamMembersCollection(orgId, teamId));
      await store().delete(teamPath(orgId, teamId));
    }
    await deleteCollectionDocs(membersCollection(orgId));

    // Org catalogs + legacy publicMembers + notebook public keys
    for (const coll of [
      donorsCollection(orgId),
      projectsCollection(orgId),
      eventsCollection(orgId),
      socialLinksCollection(orgId),
      publicMembersCollection(orgId),
      publicNotebookKeysCollection(orgId),
    ]) {
      await deleteCollectionDocs(coll);
    }

    // Org-scoped assets (avatars / CMS media)
    const orgAssets = await store().query(orgAssetsCollection(orgId));
    for (const a of orgAssets) {
      const asset = withoutId(a) as unknown as AssetMetadata;
      await safeDeleteObject(storage, asset.gcsPath);
      await safeDeleteObject(storage, asset.gcsPathOriginal);
      await store().delete(orgAssetPath(orgId, String(a.id)));
    }

    const orgData = withoutId(snap) as unknown as Organization;
    if (orgData.slug) {
      await safeDeletePath(orgSlugPath(orgData.slug));
    }
    const invites = await store().query("invite", {
      where: [{ field: "orgId", op: "==", value: orgId }],
    });
    if (invites.length > 0) {
      await store().batch(
        invites.map((inv) => ({ op: "delete" as const, path: invitePath(String(inv.id)) }))
      );
    }
    await store().delete(path);
    return { ok: true };
  });

  // ── Teams ──────────────────────────────────────────────────────────────

  app.get("/org/:orgId/teams", async (request) => {
    const user = getUser(request);
    const { orgId } = request.params as { orgId: string };
    await requireOrgMember(user, orgId);
    return store().query(teamsCollection(orgId));
  });

  app.post("/org/:orgId/teams", async (request, reply) => {
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
    await store().set(teamPath(orgId, id), omitUndefined({ ...team }));
    return team;
  });

  app.get("/org/:orgId/teams/:teamId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, teamId } = request.params as { orgId: string; teamId: string };
    await requireOrgMember(user, orgId);
    const snap = await store().get(teamPath(orgId, teamId));
    if (!snap) return reply.code(404).send({ error: "not found" });
    return { id: teamId, ...withoutId(snap) };
  });

  app.patch("/org/:orgId/teams/:teamId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, teamId } = request.params as { orgId: string; teamId: string };
    await requireOrgMember(user, orgId, "admin");
    const body = request.body as { name?: string };
    const name = body.name?.trim();
    if (!name) return reply.code(400).send({ error: "name required" });
    const path = teamPath(orgId, teamId);
    const snap = await store().get(path);
    if (!snap) return reply.code(404).send({ error: "not found" });
    const patch = { name, updatedAt: nowIso() };
    await store().update(path, patch);
    return { id: teamId, ...withoutId(snap), ...patch };
  });

  app.delete("/org/:orgId/teams/:teamId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, teamId } = request.params as { orgId: string; teamId: string };
    await requireOrgMember(user, orgId, "admin");
    const path = teamPath(orgId, teamId);
    const snap = await store().get(path);
    if (!snap) return reply.code(404).send({ error: "not found" });
    await deleteCollectionDocs(teamMembersCollection(orgId, teamId));
    await store().delete(path);
    return { ok: true };
  });

  app.get("/org/:orgId/teams/:teamId/members", async (request) => {
    const user = getUser(request);
    const { orgId, teamId } = request.params as { orgId: string; teamId: string };
    await requireOrgMember(user, orgId);
    const rows = await store().query(teamMembersCollection(orgId, teamId));
    return rows.map((d) => withoutId(d));
  });

  app.put("/org/:orgId/teams/:teamId/members/:uid", async (request, reply) => {
    const user = getUser(request);
    const { orgId, teamId, uid } = request.params as {
      orgId: string;
      teamId: string;
      uid: string;
    };
    await requireOrgMember(user, orgId, "admin");
    const teamSnap = await store().get(teamPath(orgId, teamId));
    if (!teamSnap) return reply.code(404).send({ error: "team not found" });
    const orgMember = await store().get(memberPath(orgId, uid));
    if (!orgMember) {
      return reply.code(400).send({ error: "user must be an org member first" });
    }
    const membership: TeamMembership = { uid, joinedAt: nowIso() };
    await store().set(
      teamMemberPath(orgId, teamId, uid),
      membership as unknown as Record<string, unknown>
    );
    return membership;
  });

  app.delete("/org/:orgId/teams/:teamId/members/:uid", async (request, reply) => {
    const user = getUser(request);
    const { orgId, teamId, uid } = request.params as {
      orgId: string;
      teamId: string;
      uid: string;
    };
    await requireOrgMember(user, orgId, "admin");
    const path = teamMemberPath(orgId, teamId, uid);
    const snap = await store().get(path);
    if (!snap) return reply.code(404).send({ error: "not found" });
    await store().delete(path);
    return { ok: true };
  });

  app.get("/org/:orgId/members", async (request) => {
    const user = getUser(request);
    const { orgId } = request.params as { orgId: string };
    await requireOrgReader(user, orgId);
    const rows = await store().query(membersCollection(orgId));
    const members = rows.map((d) => withoutId(d) as unknown as OrgMember);
    const missingNames = members.filter((m) => !m.displayName);
    if (missingNames.length > 0) {
      await Promise.all(
        missingNames.map(async (m) => {
          try {
            const uSnap = await store().get(userPath(m.uid));
            if (uSnap?.displayName) {
              m.displayName = uSnap.displayName as string;
            }
          } catch {
            // ignore
          }
        })
      );
    }
    return members;
  });

  async function countOrgOwners(orgId: string): Promise<number> {
    const rows = await store().query(membersCollection(orgId), {
      where: [{ field: "role", op: "==", value: "owner" }],
    });
    return rows.length;
  }

  app.post("/org/:orgId/members", async (request, reply) => {
    const user = getUser(request);
    const { orgId } = request.params as { orgId: string };
    const callerRole = await requireOrgMember(user, orgId, "admin");
    const body = request.body as { uid?: string; email?: string; role?: OrgRole };
    if (!body.uid) return reply.code(400).send({ error: "uid required" });
    const role: OrgRole = body.role ?? "member";
    if (role === "owner" && callerRole !== "owner" && !isServiceAdmin(user)) {
      return reply.code(403).send({ error: "only owners can assign owner role" });
    }
    const member = omitUndefined({
      uid: body.uid,
      role,
      email: body.email,
      joinedAt: nowIso(),
    }) as OrgMember;
    await store().set(
      memberPath(orgId, body.uid),
      member as unknown as Record<string, unknown>
    );
    return member;
  });

  app.patch("/org/:orgId/members/:uid", async (request, reply) => {
    const user = getUser(request);
    const { orgId, uid } = request.params as { orgId: string; uid: string };
    const callerRole = await requireOrgMember(user, orgId, "admin");
    const body = request.body as {
      role?: OrgRole;
      status?: "active" | "alumni";
      imageAssetId?: string | null;
      displayName?: string;
      title?: string | null;
      public?: boolean | null;
    };
    const path = memberPath(orgId, uid);
    const snap = await store().get(path);
    if (!snap) return reply.code(404).send({ error: "not found" });
    const targetMember = withoutId(snap) as unknown as OrgMember;
    const patch: Record<string, unknown> = {};

    if (body.role !== undefined) {
      if (!["owner", "admin", "member"].includes(body.role)) {
        return reply.code(400).send({ error: "invalid role" });
      }
      if (body.role === "owner" && callerRole !== "owner" && !isServiceAdmin(user)) {
        return reply.code(403).send({ error: "only owners can promote members to owner" });
      }
      if (targetMember.role === "owner" && body.role !== "owner") {
        if (callerRole !== "owner" && !isServiceAdmin(user)) {
          return reply.code(403).send({ error: "only owners can demote an owner" });
        }
        const numOwners = await countOrgOwners(orgId);
        if (numOwners <= 1) {
          return reply.code(400).send({ error: "cannot demote the last owner of an organization" });
        }
      }
      patch.role = body.role;
    }

    if (body.status !== undefined) {
      if (body.status !== "active" && body.status !== "alumni") {
        return reply.code(400).send({ error: "invalid status" });
      }
      patch.status = body.status;
      patch.alumniAt = body.status === "alumni" ? nowIso() : null;
    }
    if (body.imageAssetId !== undefined) {
      patch.imageAssetId = body.imageAssetId || null;
    }
    if (body.displayName !== undefined) {
      patch.displayName = body.displayName.trim() || null;
    }
    if (body.title !== undefined) {
      patch.title = body.title?.trim() || null;
    }
    if (body.public !== undefined) {
      patch.public = body.public === false ? false : true;
    }
    if (Object.keys(patch).length === 0) {
      return reply.code(400).send({ error: "no fields to update" });
    }

    await store().update(path, omitUndefined(patch));
    return { ...targetMember, ...patch };
  });

  app.delete("/org/:orgId/members/:uid", async (request, reply) => {
    const user = getUser(request);
    const { orgId, uid } = request.params as { orgId: string; uid: string };
    const callerRole = await requireOrgMember(user, orgId, "admin");
    const snap = await store().get(memberPath(orgId, uid));
    if (!snap) return reply.code(404).send({ error: "not found" });
    const targetMember = withoutId(snap) as unknown as OrgMember;

    if (targetMember.role === "owner") {
      if (callerRole !== "owner" && !isServiceAdmin(user)) {
        return reply.code(403).send({ error: "only owners can remove an owner" });
      }
      const numOwners = await countOrgOwners(orgId);
      if (numOwners <= 1) {
        return reply.code(400).send({ error: "cannot remove the last owner of an organization" });
      }
    }

    await store().delete(memberPath(orgId, uid));
    return { ok: true };
  });

  app.post("/org/:orgId/invites", async (request, reply) => {
    const user = getUser(request);
    const limited = limitInviteSend(user.uid);
    if (!limited.ok) return rateLimitReply(reply, limited);
    const { orgId } = request.params as { orgId: string };
    const callerRole = await requireOrgMember(user, orgId, "admin");
    const body = parseBody(inviteCreateSchema, request.body, reply);
    if (!body) return;
    const role: OrgRole = body.role === "owner" || body.role === "admin" ? body.role : "member";
    if (role === "owner" && callerRole !== "owner" && !isServiceAdmin(user)) {
      return reply.code(403).send({ error: "only owners can create owner invites" });
    }
    const id = randomUUID();
    const ttlDays = Math.min(
      90,
      Math.max(1, Number(body.expiresInDays) || Number(process.env.INVITE_TTL_DAYS) || 14)
    );
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
    const invite: Invite = {
      id,
      orgId,
      email: body.email ? body.email.trim().toLowerCase() : undefined,
      role,
      status: "pending",
      createdBy: user.uid,
      createdAt: nowIso(),
      expiresAt,
    };
    await store().set(invitePath(id), omitUndefined({ ...invite }) as Record<string, unknown>);
    const acceptPath = `/invites/${id}/accept`;
    if (invite.email) {
      const site = (process.env.PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
      try {
        await notifications.send({
          to: invite.email,
          template: "org_invite",
          data: { orgId, role: invite.role, acceptPath, siteUrl: site },
        });
      } catch (err) {
        request.log.warn({ err }, "invite email send failed");
      }
    }
    return { ...invite, acceptPath };
  });

  app.get("/org/:orgId/invites", async (request) => {
    const user = getUser(request);
    const { orgId } = request.params as { orgId: string };
    await requireOrgMember(user, orgId, "admin");
    const snap = await store().query("invite", { where: [{ field: "orgId", op: "==", value: orgId }] });
    return snap.map((d) => {
      const invite = { id: String(d.id), ...withoutId(d) } as Invite;
      return { ...invite, status: resolveInviteStatus(invite) };
    });
  });

  app.delete("/org/:orgId/invites/:inviteId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, inviteId } = request.params as { orgId: string; inviteId: string };
    await requireOrgMember(user, orgId, "admin");
    const refPath = invitePath(inviteId);
    const snap = await store().get(refPath);
    if (!snap) return reply.code(404).send({ error: "not found" });
    const invite = withoutId(snap) as Invite;
    if (invite.orgId !== orgId) return reply.code(404).send({ error: "not found" });
    const status = resolveInviteStatus(invite);
    if (status === "accepted") {
      return reply.code(400).send({ error: "cannot_revoke_accepted" });
    }
    if (status === "revoked") return { ok: true, status: "revoked" as const };
    const ts = nowIso();
    await store().update(refPath, {
      status: "revoked",
      revokedAt: ts,
    } as Record<string, unknown>);
    return { ok: true, status: "revoked" as const };
  });

  app.post("/invites/:inviteId/accept", async (request, reply) => {
    const user = getUser(request);
    const { inviteId } = request.params as { inviteId: string };
    const snap = await store().get(invitePath(inviteId));
    if (!snap) return reply.code(404).send({ error: "not found" });
    const invite = withoutId(snap) as Invite;
    const status = resolveInviteStatus(invite);
    if (status === "accepted" || invite.acceptedAt) {
      return reply.code(400).send({ error: "already accepted" });
    }
    if (status === "revoked") {
      return reply.code(400).send({ error: "invite revoked" });
    }
    if (invite.expiresAt && Date.parse(invite.expiresAt) < Date.now()) {
      return reply.code(400).send({ error: "invite expired" });
    }
    const inviteEmail = (invite.email || "").trim().toLowerCase();
    const userEmail = (user.email || "").trim().toLowerCase();
    // Only check email if the invite was specifically restricted to an email
    if (inviteEmail) {
      const profile = (await store().get(userPath(user.uid))) as
        | { secondaryEmails?: Array<{ email?: string; verified?: boolean }> }
        | undefined;
      const verifiedSecondaries = new Set(
        (profile?.secondaryEmails || [])
          .filter((e) => e.verified && e.email)
          .map((e) => String(e.email).trim().toLowerCase())
      );
      const matchesPrimary = Boolean(userEmail && inviteEmail === userEmail);
      const matchesSecondary = verifiedSecondaries.has(inviteEmail);
      if (!matchesPrimary && !matchesSecondary) {
        return reply.code(403).send({ error: "invite email does not match signed-in user" });
      }
      if (matchesPrimary && user.emailVerified === false && !isServiceAdmin(user)) {
        return reply.code(403).send({
          error: "email_not_verified",
          message: "You must verify your email address before accepting this invite.",
        });
      }
    }
    const existingSnap = await store().get(memberPath(invite.orgId, user.uid));
    let finalRole: OrgRole = invite.role;
    let joinedAt = nowIso();
    if (existingSnap) {
      const existing = withoutId(existingSnap) as unknown as OrgMember;
      const roleRank: Record<OrgRole, number> = { owner: 3, admin: 2, member: 1 };
      const currentRank = roleRank[existing.role] || 0;
      const inviteRank = roleRank[invite.role] || 0;
      // Never downgrade an existing member's role upon accepting an invite
      if (currentRank >= inviteRank) {
        finalRole = existing.role;
      }
      if (existing.joinedAt) {
        joinedAt = existing.joinedAt;
      }
    }
    const member = omitUndefined({
      uid: user.uid,
      role: finalRole,
      email: user.email ?? invite.email,
      displayName: user.displayName,
      joinedAt,
    }) as OrgMember;
    await store().set(memberPath(invite.orgId, user.uid), member as Record<string, unknown>);
    const acceptedAt = nowIso();
    await store().update(invitePath(inviteId), {
      status: "accepted",
      acceptedAt,
    } as Record<string, unknown>);
    return { orgId: invite.orgId, member };
  });

  app.get("/org/:orgId/notebooks", async (request) => {
    const user = getUser(request);
    const { orgId } = request.params as { orgId: string };
    const role = await requireOrgReader(user, orgId);
    const rows = await store().query(notebooksCollection(orgId));
    const out = [];
    for (const d of rows) {
      const data = withoutId(d) as unknown as NotebookSummary;
      if (await canAccessNotebook(user, orgId, data, role)) {
        out.push({ id: String(d.id), ...data });
      }
    }
    return out;
  });

  app.post("/org/:orgId/notebooks", async (request, reply) => {
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
    const summary: NotebookSummary & { id: string } = {
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
    await store().set(notebookPath(orgId, id), omitUndefined({ ...summary }) as Record<string, unknown>);
    return summary;
  });

  app.get("/org/:orgId/notebook/:notebookId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    const snap = await store().get(notebookPath(orgId, notebookId));
    if (!snap) return reply.code(404).send({ error: "not found" });
    const data = withoutId(snap) as NotebookSummary;
    await requireNotebookAccess(user, orgId, data);
    return { id: snap.id, ...data };
  });

  /** SSE: notebook metadata fanout (website uses fetch + Authorization; not EventSource). */
  app.get("/org/:orgId/notebook/:notebookId/events", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookAccess(user, orgId, notebookId);

    // hijack() skips @fastify/cors onSend — set CORS on the raw stream or the browser
    // cannot read cross-origin SSE from the website (:3000 → :8080).
    const originHeader = request.headers.origin;
    const corsOriginEnv = process.env.CORS_ORIGIN;
    const allowedOrigins = corsOriginEnv
      ? corsOriginEnv.split(",").map((s) => s.trim()).filter(Boolean)
      : null;
    const allowOrigin =
      !allowedOrigins || allowedOrigins.includes("*")
        ? originHeader || "*"
        : originHeader && allowedOrigins.includes(originHeader)
          ? originHeader
          : allowedOrigins[0] || "*";

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      Vary: "Origin",
    });
    const unsub = subscribeNotebookEvents(orgId, notebookId, reply.raw);
    const onClose = () => {
      unsub();
      if (!reply.raw.writableEnded) reply.raw.end();
    };
    request.raw.on("close", onClose);
    request.raw.on("error", onClose);
  });

  app.patch("/org/:orgId/notebook/:notebookId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    const refPath = notebookPath(orgId, notebookId);
    const snap = await store().get(refPath);
    if (!snap) return reply.code(404).send({ error: "not found" });
    const existing = withoutId(snap) as NotebookSummary;
    const callerRole = await requireNotebookAccess(user, orgId, existing);
    const body = request.body as Partial<NotebookSummary>;
    if (body.access !== undefined && callerRole !== "owner" && callerRole !== "admin" && !isServiceAdmin(user)) {
      return reply.code(403).send({ error: "Only admins and owners can modify notebook access" });
    }
    if (body.archivedAt !== undefined && callerRole !== "owner" && callerRole !== "admin" && !isServiceAdmin(user)) {
      return reply.code(403).send({ error: "Only admins and owners can archive or unarchive notebooks" });
    }
    const patch: Record<string, unknown> = { updatedAt: nowIso() };
    for (const key of [
      "name",
      "title",
      "subtitle",
      "logoAssetId",
      "folders",
      "access",
      "phases",
      "latestExportId",
      "publicExportId",
      "archivedAt",
    ] as const) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    if (body.contributorUids !== undefined) {
      if (!Array.isArray(body.contributorUids)) {
        return reply.code(400).send({ error: "contributorUids must be an array" });
      }
      const uids = body.contributorUids.map(String);
      for (const uid of uids) {
        const om = await store().get(memberPath(orgId, uid));
        if (!om) return reply.code(400).send({ error: `unknown org member: ${uid}` });
      }
      patch.contributorUids = uids;
    }

    // Public share link (admin+)
    if (
      body.publicAccess !== undefined ||
      body.publicKey !== undefined ||
      (body as { revokePublic?: boolean }).revokePublic
    ) {
      if (callerRole !== "owner" && callerRole !== "admin" && !isServiceAdmin(user)) {
        return reply.code(403).send({ error: "Only admins and owners can publish notebooks" });
      }
      // Link-share only: "public" is accepted as an alias of "unlisted".
      const rawAccess = body.publicAccess ?? existing.publicAccess ?? "off";
      if (rawAccess !== "off" && rawAccess !== "unlisted" && rawAccess !== "public") {
        return reply.code(400).send({ error: "invalid publicAccess" });
      }
      const access = rawAccess === "public" ? "unlisted" : rawAccess;
      const normalizePublicKey = (raw: string) =>
        raw
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, "-")
          .replace(/^-+|-+$/g, "");
      /** Full UUID (with hyphens) or 32-hex; legacy notebookId prefixes were ~12 chars. */
      const isStrongPublicKey = (k: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k) ||
        /^[0-9a-f]{32}$/i.test(k);
      let key = "";
      if (body.publicKey !== undefined) {
        key = normalizePublicKey(String(body.publicKey));
      } else if (existing.publicKey && isStrongPublicKey(existing.publicKey)) {
        key = normalizePublicKey(existing.publicKey);
      }
      if ((body as { revokePublic?: boolean }).revokePublic || access === "off") {
        if (existing.publicKey) {
          await safeDeletePath(publicNotebookKeyPath(orgId, existing.publicKey));
        }
        patch.publicAccess = "off";
        patch.publicKey = null;
        patch.publicExportId = null;
        patch.publishedAt = null;
        patch.publishedBy = null;
      } else {
        // Unguessable share token (full UUID). Legacy short prefixes are reminted.
        if (!key) key = randomUUID();
        if (key !== existing.publicKey) {
          const taken = await store().get(publicNotebookKeyPath(orgId, key));
          if (taken && (withoutId(taken) as { notebookId?: string }).notebookId !== notebookId) {
            return reply.code(409).send({ error: "public_key_taken" });
          }
          if (existing.publicKey) {
            await safeDeletePath(publicNotebookKeyPath(orgId, existing.publicKey));
          }
          await store().set(publicNotebookKeyPath(orgId, key), {
            notebookId,
            updatedAt: nowIso(),
          } as Record<string, unknown>);
        } else if (!existing.publicKey) {
          await store().set(publicNotebookKeyPath(orgId, key), {
            notebookId,
            updatedAt: nowIso(),
          } as Record<string, unknown>);
        }
        patch.publicAccess = "unlisted";
        patch.publicKey = key;
        patch.publishedAt = existing.publishedAt || nowIso();
        patch.publishedBy = existing.publishedBy || user.uid;
        // Bind public PDF to an explicit export, else latest compile.
        if (body.publicExportId !== undefined) {
          patch.publicExportId = body.publicExportId || null;
        } else if (!existing.publicExportId && existing.latestExportId) {
          patch.publicExportId = existing.latestExportId;
        }
      }
    }

    await store().update(refPath, omitUndefined(patch));
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

  app.post("/org/:orgId/notebook/:notebookId/archive", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    const refPath = notebookPath(orgId, notebookId);
    const snap = await store().get(refPath);
    if (!snap) return reply.code(404).send({ error: "not found" });
    const existing = withoutId(snap) as NotebookSummary;
    const callerRole = await requireNotebookAccess(user, orgId, existing);
    if (callerRole !== "owner" && callerRole !== "admin" && !isServiceAdmin(user)) {
      return reply.code(403).send({ error: "Only admins and owners can archive notebooks" });
    }
    const ts = nowIso();
    const patch = { archivedAt: ts, updatedAt: ts };
    await store().update(refPath, patch);
    const merged = { id: notebookId, ...existing, ...patch };
    publishNotebookEvent(orgId, notebookId, {
      type: "notebook.updated",
      notebook: merged as Record<string, unknown>,
      at: ts,
    });
    return merged;
  });

  app.post("/org/:orgId/notebook/:notebookId/unarchive", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    const refPath = notebookPath(orgId, notebookId);
    const snap = await store().get(refPath);
    if (!snap) return reply.code(404).send({ error: "not found" });
    const existing = withoutId(snap) as NotebookSummary;
    const callerRole = await requireNotebookAccess(user, orgId, existing);
    if (callerRole !== "owner" && callerRole !== "admin" && !isServiceAdmin(user)) {
      return reply.code(403).send({ error: "Only admins and owners can unarchive notebooks" });
    }
    const ts = nowIso();
    const patch = { archivedAt: null, updatedAt: ts };
    await store().update(refPath, patch);
    const merged = { id: notebookId, ...existing, ...patch };
    publishNotebookEvent(orgId, notebookId, {
      type: "notebook.updated",
      notebook: merged as Record<string, unknown>,
      at: ts,
    });
    return merged;
  });

  app.delete("/org/:orgId/notebook/:notebookId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await requireOrgMember(user, orgId, "admin");
    const refPath = notebookPath(orgId, notebookId);
    const snap = await store().get(refPath);
    if (!snap) return reply.code(404).send({ error: "not found" });
    await purgeNotebookStorage(storage, orgId, notebookId);
    await store().delete(refPath);
    return { ok: true };
  });

  // ── Folders (mutate notebook.folders map without full replace) ──────────

  app.post("/org/:orgId/notebook/:notebookId/folders", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    const body = request.body as { name?: string; parentId?: string | null; order?: number };
    const name = body.name?.trim();
    if (!name) return reply.code(400).send({ error: "name required" });
    const refPath = notebookPath(orgId, notebookId);
    const snap = await store().get(refPath);
    if (!snap) return reply.code(404).send({ error: "not found" });
    const nb = withoutId(snap) as NotebookSummary;
    await requireNotebookAccess(user, orgId, nb);
    assertNotebookNotArchived(nb);
    const id = randomUUID();
    const folder: NotebookFolder = {
      name,
      parentId: body.parentId ?? null,
      order: body.order ?? Object.keys(nb.folders ?? {}).length,
    };
    const folders = { ...(nb.folders ?? {}), [id]: folder };
    const ts = nowIso();
    await store().update(refPath, { folders, updatedAt: ts });
    publishNotebookEvent(orgId, notebookId, {
      type: "notebook.updated",
      notebook: { id: notebookId, folders, updatedAt: ts },
      at: ts,
    });
    return { id, folder, folders };
  });

  app.patch("/org/:orgId/notebook/:notebookId/folders/:folderId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, folderId } = request.params as {
      orgId: string;
      notebookId: string;
      folderId: string;
    };
    const body = request.body as Partial<NotebookFolder>;
    const refPath = notebookPath(orgId, notebookId);
    const snap = await store().get(refPath);
    if (!snap) return reply.code(404).send({ error: "not found" });
    const nb = withoutId(snap) as NotebookSummary;
    await requireNotebookAccess(user, orgId, nb);
    assertNotebookNotArchived(nb);
    const existing = nb.folders?.[folderId];
    if (!existing) return reply.code(404).send({ error: "folder not found" });
    const folder: NotebookFolder = {
      name: body.name?.trim() || existing.name,
      parentId: body.parentId !== undefined ? body.parentId : existing.parentId,
      order: body.order !== undefined ? body.order : existing.order,
    };
    const folders = { ...(nb.folders ?? {}), [folderId]: folder };
    const ts = nowIso();
    await store().update(refPath, { folders, updatedAt: ts });
    publishNotebookEvent(orgId, notebookId, {
      type: "notebook.updated",
      notebook: { id: notebookId, folders, updatedAt: ts },
      at: ts,
    });
    return { id: folderId, folder, folders };
  });

  app.delete("/org/:orgId/notebook/:notebookId/folders/:folderId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, folderId } = request.params as {
      orgId: string;
      notebookId: string;
      folderId: string;
    };
    const refPath = notebookPath(orgId, notebookId);
    const snap = await store().get(refPath);
    if (!snap) return reply.code(404).send({ error: "not found" });
    const nb = withoutId(snap) as NotebookSummary;
    await requireNotebookAccess(user, orgId, nb);
    assertNotebookNotArchived(nb);
    const existingFolder = nb.folders?.[folderId];
    if (!existingFolder) return reply.code(404).send({ error: "folder not found" });
    // Promote children one level up (to this folder's parent), do not delete them.
    const promoteTo =
      existingFolder.parentId && nb.folders?.[existingFolder.parentId]
        ? existingFolder.parentId
        : null;
    const entries = await store().query(entriesCollection(orgId, notebookId));
    const batchOps: MetadataBatchOp[] = [];
    const ts = nowIso();
    let entriesMoved = false;
    for (const doc of entries) {
      const id = String(doc.id);
      const meta = withoutId(doc) as unknown as EntryMetadata;
      if (meta.folderId === folderId) {
        batchOps.push({
          op: "update",
          path: entryPath(orgId, notebookId, id),
          data: { folderId: promoteTo, updatedAt: ts },
        });
        entriesMoved = true;
      }
    }
    const folders = { ...(nb.folders ?? {}) };
    for (const [fid, folder] of Object.entries(folders)) {
      if (fid === folderId) continue;
      if (folder.parentId === folderId) {
        folders[fid] = { ...folder, parentId: promoteTo };
      }
    }
    delete folders[folderId];
    batchOps.push({
      op: "update",
      path: refPath,
      data: { folders, updatedAt: ts },
    });
    await store().batch(batchOps);
    publishNotebookEvent(orgId, notebookId, {
      type: "notebook.updated",
      notebook: { id: notebookId, folders, updatedAt: ts },
      at: ts,
    });
    if (entriesMoved) {
      publishNotebookEvent(orgId, notebookId, { type: "entries.changed", at: ts });
    }
    return { ok: true, folders };
  });

  // ── Notebook contributors (org member uids on notebook.contributorUids) ─

  async function ensureNotebookContributor(orgId: string, notebookId: string, uid: string) {
    if (!uid) return;
    try {
      const nbRef = notebookPath(orgId, notebookId);
      const nb = (await store().get(nbRef)) as NotebookSummary | null;
      if (!nb) return;
      const existingUids = Array.isArray(nb.contributorUids) ? [...nb.contributorUids] : [];
      if (!existingUids.includes(uid)) {
        existingUids.push(uid);
        const ts = nowIso();
        await store().update(nbRef, { contributorUids: existingUids, updatedAt: ts });
        publishNotebookEvent(orgId, notebookId, {
          type: "notebook.updated",
          notebook: { id: notebookId, contributorUids: existingUids, updatedAt: ts },
          at: ts,
        });
      }
    } catch (err) {
      app.log.warn({ err, orgId, notebookId, uid }, "failed to auto-add notebook contributor");
    }
  }

  app.get("/org/:orgId/notebook/:notebookId/members", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    const trashed = String((request.query as { trashed?: string }).trashed || "") === "1";
    const nb = await store().get(notebookPath(orgId, notebookId));
    if (!nb) return reply.code(404).send({ error: "not found" });
    const nbData = withoutId(nb) as NotebookSummary;
    await requireNotebookAccess(user, orgId, nbData);

    // Soft-trashed legacy roster docs only (new model has no trash).
    if (trashed) {
      const snap = await store().query(notebookMembersCollection(orgId, notebookId));
      return snap
        .map((d) => ({ id: d.id, ...withoutId(d) }) as NotebookMember & { id: string })
        .filter((m) => Boolean(m.deletedAt));
    }

    const uids = nbData.contributorUids || [];
    if (uids.length) {
      const rows = await Promise.all(
        uids.map(async (uid, order) => {
          const omSnap = await store().get(memberPath(orgId, uid));
          if (!omSnap) return null;
          const om = withoutId(omSnap) as OrgMember;
          return {
            id: uid,
            name: om.displayName || om.email || "Member",
            role: om.title || "Member",
            order,
            imageAssetId: om.imageAssetId,
            orgMemberUid: uid,
          };
        })
      );
      return rows.filter(Boolean);
    }

    // Legacy notebook members collection (pre–contributorUids).
    const snap = await store().query(notebookMembersCollection(orgId, notebookId));
    return snap
      .map((d) => ({ id: d.id, ...withoutId(d) }) as NotebookMember & { id: string })
      .filter((m) => !m.deletedAt);
  });

  app.post("/org/:orgId/notebook/:notebookId/members", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    const nb = await store().get(notebookPath(orgId, notebookId));
    if (!nb) return reply.code(404).send({ error: "not found" });
    const nbData = withoutId(nb) as NotebookSummary;
    await requireNotebookAccess(user, orgId, nbData);
    assertNotebookNotArchived(nbData);
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
      orgMemberUid: body.orgMemberUid,
    }) as NotebookMember;
    await store().set(notebookMemberPath(orgId, notebookId, id), member as Record<string, unknown>);
    return member;
  });

  app.patch("/org/:orgId/notebook/:notebookId/members/:memberId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, memberId } = request.params as {
      orgId: string;
      notebookId: string;
      memberId: string;
    };
    const nb = await store().get(notebookPath(orgId, notebookId));
    if (!nb) return reply.code(404).send({ error: "not found" });
    const nbData = withoutId(nb) as NotebookSummary;
    await requireNotebookAccess(user, orgId, nbData);
    assertNotebookNotArchived(nbData);
    const refPath = notebookMemberPath(orgId, notebookId, memberId);
    const snap = await store().get(refPath);
    if (!snap) return reply.code(404).send({ error: "not found" });
    const body = request.body as Partial<NotebookMember> & { orgMemberUid?: string | null };
    const patch: Record<string, unknown> = {};
    for (const key of ["name", "role", "order", "imageAssetId"] as const) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    if (body.orgMemberUid !== undefined) {
      patch.orgMemberUid = body.orgMemberUid || null;
      if (body.orgMemberUid) {
        const orgMem = await store().get(memberPath(orgId, body.orgMemberUid));
        if (!orgMem) return reply.code(400).send({ error: "org member not found" });
        const om = withoutId(orgMem) as unknown as OrgMember;
        if (body.name === undefined && om.displayName) patch.name = om.displayName;
        if (body.imageAssetId === undefined && om.imageAssetId) patch.imageAssetId = om.imageAssetId;
      }
    }
    await store().update(refPath, omitUndefined(patch));
    const next = { ...withoutId(snap), ...patch } as Record<string, unknown>;
    return { id: memberId, ...next };
  });

  app.delete("/org/:orgId/notebook/:notebookId/members/:memberId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, memberId } = request.params as {
      orgId: string;
      notebookId: string;
      memberId: string;
    };
    const nb = await store().get(notebookPath(orgId, notebookId));
    if (!nb) return reply.code(404).send({ error: "not found" });
    const nbData = withoutId(nb) as NotebookSummary;
    await requireNotebookAccess(user, orgId, nbData);
    assertNotebookNotArchived(nbData);
    const refPath = notebookMemberPath(orgId, notebookId, memberId);
    const snap = await store().get(refPath);
    if (!snap) return reply.code(404).send({ error: "not found" });
    const existing = withoutId(snap) as NotebookMember;
    if (existing.deletedAt) {
      return { ok: true, id: memberId, deletedAt: existing.deletedAt, alreadyTrashed: true };
    }
    const ts = nowIso();
    await store().update(refPath, { deletedAt: ts });
    return { ok: true, id: memberId, deletedAt: ts };
  });

  app.post(
    "/org/:orgId/notebook/:notebookId/members/:memberId/restore",
    async (request, reply) => {
      const user = getUser(request);
      const { orgId, notebookId, memberId } = request.params as {
        orgId: string;
        notebookId: string;
        memberId: string;
      };
      const nb = await store().get(notebookPath(orgId, notebookId));
      if (!nb) return reply.code(404).send({ error: "not found" });
      const nbData = withoutId(nb) as NotebookSummary;
      await requireNotebookAccess(user, orgId, nbData);
      assertNotebookNotArchived(nbData);
      const refPath = notebookMemberPath(orgId, notebookId, memberId);
      const snap = await store().get(refPath);
      if (!snap) return reply.code(404).send({ error: "not found" });
      await store().update(refPath, { deletedAt: null });
      return { id: memberId, ...withoutId(snap), deletedAt: null };
    }
  );

  app.delete(
    "/org/:orgId/notebook/:notebookId/members/:memberId/permanent",
    async (request, reply) => {
      const user = getUser(request);
      const { orgId, notebookId, memberId } = request.params as {
        orgId: string;
        notebookId: string;
        memberId: string;
      };
      const nb = await store().get(notebookPath(orgId, notebookId));
      if (!nb) return reply.code(404).send({ error: "not found" });
      const nbData = withoutId(nb) as NotebookSummary;
      await requireNotebookAccess(user, orgId, nbData);
      assertNotebookNotArchived(nbData);
      const refPath = notebookMemberPath(orgId, notebookId, memberId);
      const snap = await store().get(refPath);
      if (!snap) return reply.code(404).send({ error: "not found" });
      await store().delete(refPath);
      return { ok: true };
    }
  );

  app.get("/org/:orgId/notebook/:notebookId/entries", async (request) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookAccess(user, orgId, notebookId);
    const snap = await store().query(entriesCollection(orgId, notebookId));
    const entries: Record<string, EntryMetadata> = {};
    for (const doc of snap) {
      entries[String(doc.id)] = withoutId(doc) as unknown as EntryMetadata;
    }
    return { entries };
  });

  /**
   * Search entries by metadata (title/authors/phase/date) and optionally TipTap body text.
   * Query: `q` (required, min 2 chars), `includeBody=1` to scan TipTap JSON (capped).
   */
  app.get("/org/:orgId/notebook/:notebookId/entry/search", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookAccess(user, orgId, notebookId);
    const qRaw = String((request.query as { q?: string }).q || "").trim();
    if (qRaw.length < 2) {
      return reply.code(400).send({ error: "q must be at least 2 characters" });
    }
    const includeBody = String((request.query as { includeBody?: string }).includeBody || "") === "1";
    const needle = qRaw.toLowerCase();
    const snap = await store().query(entriesCollection(orgId, notebookId));
    const hits: Array<{
      id: string;
      title?: string;
      authors?: string[];
      phase?: string;
      date?: string;
      match: "meta" | "body" | "both";
      excerpt?: string;
    }> = [];

    const extractText = (node: unknown, out: string[], depth = 0) => {
      if (!node || depth > 40 || out.join(" ").length > 8000) return;
      if (typeof node === "string") {
        out.push(node);
        return;
      }
      if (Array.isArray(node)) {
        for (const child of node) extractText(child, out, depth + 1);
        return;
      }
      if (typeof node === "object") {
        const obj = node as { text?: string; content?: unknown };
        if (typeof obj.text === "string") out.push(obj.text);
        if (obj.content) extractText(obj.content, out, depth + 1);
      }
    };

    let bodyScans = 0;
    const BODY_SCAN_LIMIT = 80;
    for (const doc of snap) {
      const id = String(doc.id);
      const meta = withoutId(doc) as unknown as EntryMetadata;
      if (meta.deletedAt) continue;
      const metaBlob = [
        meta.title || "",
        ...(meta.authors || []),
        meta.phase || "",
        meta.date || "",
      ]
        .join(" ")
        .toLowerCase();
      const metaHit = metaBlob.includes(needle);
      let bodyHit = false;
      let excerpt: string | undefined;
      if (includeBody && bodyScans < BODY_SCAN_LIMIT) {
        bodyScans += 1;
        const key = meta.tipTapGcsPath || gcsKeys.tipTap(orgId, notebookId, id);
        try {
          const buf = await storage.getObject(key);
          if (buf) {
            const json = JSON.parse(buf.toString("utf8")) as unknown;
            const parts: string[] = [];
            extractText(json, parts);
            const text = parts.join(" ");
            const lower = text.toLowerCase();
            const idx = lower.indexOf(needle);
            if (idx >= 0) {
              bodyHit = true;
              const start = Math.max(0, idx - 40);
              const end = Math.min(text.length, idx + needle.length + 60);
              excerpt = `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
            }
          }
        } catch {
          // skip unreadable bodies
        }
      }
      if (!metaHit && !bodyHit) continue;
      hits.push({
        id,
        title: meta.title,
        authors: meta.authors,
        phase: meta.phase ?? undefined,
        date: meta.date,
        match: metaHit && bodyHit ? "both" : metaHit ? "meta" : "body",
        excerpt,
      });
    }

    hits.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
    return { q: qRaw, includeBody, hits };
  });

  /**
   * Reassign sibling indices without touching the other axis:
   * - explorer: `explorerOrder` (+ optional `folderId`) within a folder
   * - day: `order` (+ optional `date`) within a calendar day
   */
  app.post("/org/:orgId/notebook/:notebookId/entry/reorder", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookWritable(user, orgId, notebookId);
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

    const ts = nowIso();
    const batchOps: MetadataBatchOp[] = [];
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      if (mode === "explorer") {
        const patch: Record<string, unknown> = { explorerOrder: i, updatedAt: ts };
        if (body.folderId !== undefined) patch.folderId = body.folderId;
        batchOps.push({
          op: "update",
          path: entryPath(orgId, notebookId, id),
          data: omitUndefined(patch),
        });
      } else {
        const patch: Record<string, unknown> = { order: i, updatedAt: ts };
        if (body.date !== undefined) patch.date = body.date;
        batchOps.push({
          op: "update",
          path: entryPath(orgId, notebookId, id),
          data: omitUndefined(patch),
        });
      }
    }
    try {
      await store().batch(batchOps);
    } catch (err) {
      return reply.code(400).send({
        error: "reorder failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    publishNotebookEvent(orgId, notebookId, { type: "entries.changed", at: ts });
    return { ok: true, mode, orderedIds };
  });

  app.post("/org/:orgId/notebook/:notebookId/entries", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookWritable(user, orgId, notebookId);
    const parsed = parseBody(entryCreateSchema, request.body, reply);
    if (!parsed) return;
    const body = parsed as Partial<EntryMetadata> & { id?: string };
    const id = (request.body as { id?: string } | undefined)?.id || randomUUID();
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
    }) as EntryMetadata;
    await store().set(entryPath(orgId, notebookId, id), entry as Record<string, unknown>);
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
    void ensureNotebookContributor(orgId, notebookId, user.uid);
    return result;
  });

  app.get("/org/:orgId/notebook/:notebookId/entry/:entryId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, entryId } = request.params as {
      orgId: string;
      notebookId: string;
      entryId: string;
    };
    await assertNotebookAccess(user, orgId, notebookId);
    const snap = await store().get(entryPath(orgId, notebookId, entryId));
    if (!snap) return reply.code(404).send({ error: "not found" });
    return snap;
  });

  app.patch("/org/:orgId/notebook/:notebookId/entry/:entryId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, entryId } = request.params as {
      orgId: string;
      notebookId: string;
      entryId: string;
    };
    await assertNotebookWritable(user, orgId, notebookId);
    const parsedBody = parseBody(entryPatchSchema, request.body, reply);
    if (!parsedBody) return;
    const body = parsedBody as Partial<EntryMetadata>;
    const refPath = entryPath(orgId, notebookId, entryId);
    const snap = await store().get(refPath);
    if (!snap) return reply.code(404).send({ error: "not found" });
    const allowed = [
      "title",
      "authors",
      "phase",
      "date",
      "folderId",
      "order",
      "explorerOrder",
      "isTemplate",
      "hidden",
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
    const existing = withoutId(snap) as EntryMetadata;
    const patch: Record<string, unknown> = { updatedAt: nowIso() };
    for (const key of allowed) {
      if (body[key] !== undefined) patch[key] = body[key];
    }

    const metaTouched =
      body.title !== undefined ||
      body.authors !== undefined ||
      body.date !== undefined ||
      body.phase !== undefined ||
      body.isTemplate !== undefined;
    if (metaTouched) {
      const nbSnap = await store().get(notebookPath(orgId, notebookId));
      const phases = nbSnap
        ? (withoutId(nbSnap) as unknown as NotebookSummary).phases
        : undefined;
      const merged = { ...existing, ...patch } as EntryMetadata;
      const metaErrors = validateEntryMetadataFields(merged, (phases || {}) as Record<string, unknown>);
      const { validationErrors, isValid } = mergeMetadataValidationErrors(
        // Prefer incoming content validation if this patch also sets it; else existing.
        (body.validationErrors as string[] | undefined) ?? existing.validationErrors,
        metaErrors
      );
      patch.validationErrors = validationErrors;
      patch.isValid = isValid;
    }

    await store().update(refPath, omitUndefined(patch));
    if (body.assetIds !== undefined) {
      await syncAssetUsedBy(
        orgId,
        notebookId,
        entryId,
        existing.assetIds ?? [],
        body.assetIds ?? []
      );
    }
    // Re-read so SSE/clients never get a stale snapshot from a concurrent patch race.
    const fresh = await store().get(refPath);
    const result = {
      id: entryId,
      ...(withoutId(fresh || {}) as unknown as EntryMetadata),
    };
    publishNotebookEvent(orgId, notebookId, {
      type: "entry.upserted",
      entryId,
      entry: result as Record<string, unknown>,
      at: String(result.updatedAt || patch.updatedAt),
    });
    void ensureNotebookContributor(orgId, notebookId, user.uid);
    return result;
  });

  async function permanentlyDeleteEntry(
    orgId: string,
    notebookId: string,
    entryId: string,
    meta: EntryMetadata
  ) {
    const refPath = entryPath(orgId, notebookId, entryId);
    await safeDeleteObject(storage, meta.tipTapGcsPath || gcsKeys.tipTap(orgId, notebookId, entryId));
    await safeDeleteObject(storage, meta.yjsGcsPath || gcsKeys.yjs(orgId, notebookId, entryId));
    if (meta.assetIds?.length) {
      await syncAssetUsedBy(orgId, notebookId, entryId, meta.assetIds, []);
    }
    await deleteCollectionDocs(entryCommentsCollection(orgId, notebookId, entryId));
    await store().delete(refPath);
    const ts = nowIso();
    publishNotebookEvent(orgId, notebookId, {
      type: "entry.deleted",
      entryId,
      at: ts,
    });
    return ts;
  }

  /** Soft-delete: move entry to Trash (keeps TipTap/Yjs until permanent purge). */
  app.delete("/org/:orgId/notebook/:notebookId/entry/:entryId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, entryId } = request.params as {
      orgId: string;
      notebookId: string;
      entryId: string;
    };
    await assertNotebookWritable(user, orgId, notebookId);
    const refPath = entryPath(orgId, notebookId, entryId);
    const snap = await store().get(refPath);
    if (!snap) return reply.code(404).send({ error: "not found" });
    const meta = withoutId(snap) as EntryMetadata;
    if (meta.deletedAt) {
      return { ok: true, id: entryId, deletedAt: meta.deletedAt, alreadyTrashed: true };
    }
    const ts = nowIso();
    await store().update(refPath, { deletedAt: ts, updatedAt: ts });
    const result = { id: entryId, ...meta, deletedAt: ts, updatedAt: ts };
    publishNotebookEvent(orgId, notebookId, {
      type: "entry.upserted",
      entryId,
      entry: result as Record<string, unknown>,
      at: ts,
    });
    return { ok: true, id: entryId, deletedAt: ts };
  });

  app.post("/org/:orgId/notebook/:notebookId/entry/:entryId/restore", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, entryId } = request.params as {
      orgId: string;
      notebookId: string;
      entryId: string;
    };
    await assertNotebookWritable(user, orgId, notebookId);
    const refPath = entryPath(orgId, notebookId, entryId);
    const snap = await store().get(refPath);
    if (!snap) return reply.code(404).send({ error: "not found" });
    const meta = withoutId(snap) as EntryMetadata;
    if (!meta.deletedAt) {
      return { ok: true, id: entryId, ...(meta as object), alreadyRestored: true };
    }
    const ts = nowIso();
    await store().update(refPath, { deletedAt: null, updatedAt: ts });
    const result = { id: entryId, ...meta, deletedAt: null, updatedAt: ts };
    publishNotebookEvent(orgId, notebookId, {
      type: "entry.upserted",
      entryId,
      entry: result as Record<string, unknown>,
      at: ts,
    });
    return result;
  });

  /** Hard-delete TipTap/Yjs + metadata (empty trash / delete forever). */
  app.delete(
    "/org/:orgId/notebook/:notebookId/entry/:entryId/permanent",
    async (request, reply) => {
      const user = getUser(request);
      const { orgId, notebookId, entryId } = request.params as {
        orgId: string;
        notebookId: string;
        entryId: string;
      };
      await assertNotebookWritable(user, orgId, notebookId);
      const refPath = entryPath(orgId, notebookId, entryId);
      const snap = await store().get(refPath);
      if (!snap) return reply.code(404).send({ error: "not found" });
      const meta = withoutId(snap) as EntryMetadata;
      await permanentlyDeleteEntry(orgId, notebookId, entryId, meta);
      return { ok: true };
    }
  );

  async function recountEntryComments(orgId: string, notebookId: string, entryId: string) {
    const rows = await store().query(entryCommentsCollection(orgId, notebookId, entryId));
    let openCommentCount = 0;
    for (const row of rows) {
      const c = withoutId(row) as EntryComment;
      if (!c.resolvedAt) openCommentCount += 1;
    }
    const commentCount = rows.length;
    const refPath = entryPath(orgId, notebookId, entryId);
    const snap = await store().get(refPath);
    if (!snap) return;
    const ts = nowIso();
    await store().update(refPath, { openCommentCount, commentCount, updatedAt: ts });
    const result = {
      id: entryId,
      ...(withoutId(snap) as EntryMetadata),
      openCommentCount,
      commentCount,
      updatedAt: ts,
    };
    publishNotebookEvent(orgId, notebookId, {
      type: "entry.upserted",
      entryId,
      entry: result as Record<string, unknown>,
      at: ts,
    });
  }

  app.get(
    "/org/:orgId/notebook/:notebookId/entry/:entryId/comments",
    async (request, reply) => {
      const user = getUser(request);
      const { orgId, notebookId, entryId } = request.params as {
        orgId: string;
        notebookId: string;
        entryId: string;
      };
      await assertNotebookAccess(user, orgId, notebookId);
      const entrySnap = await store().get(entryPath(orgId, notebookId, entryId));
      if (!entrySnap) return reply.code(404).send({ error: "not found" });
      const rows = await store().query(entryCommentsCollection(orgId, notebookId, entryId));
      return rows
        .map((d) => {
          const { id, ...rest } = d as EntryComment & { id: string };
          return { id, ...rest };
        })
        .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    }
  );

  app.post(
    "/org/:orgId/notebook/:notebookId/entry/:entryId/comments",
    async (request, reply) => {
      const user = getUser(request);
      const { orgId, notebookId, entryId } = request.params as {
        orgId: string;
        notebookId: string;
        entryId: string;
      };
      await assertNotebookWritable(user, orgId, notebookId);
      const entrySnap = await store().get(entryPath(orgId, notebookId, entryId));
      if (!entrySnap) return reply.code(404).send({ error: "not found" });
      const body = request.body as {
        body?: string;
        anchorQuote?: string;
        id?: string;
        mentionedUids?: string[];
      };
      const text = (body.body || "").trim();
      if (!text) return reply.code(400).send({ error: "body required" });
      const id = (body.id || "").trim() || randomUUID();
      const ts = nowIso();
      const mentionedUids = Array.from(
        new Set((body.mentionedUids || []).map(String).filter((uid) => uid && uid !== user.uid))
      );
      for (const uid of mentionedUids) {
        const om = await store().get(memberPath(orgId, uid));
        if (!om) return reply.code(400).send({ error: `unknown mention: ${uid}` });
      }
      const comment: EntryComment = omitUndefined({
        id,
        entryId,
        body: text,
        createdBy: user.uid,
        createdAt: ts,
        updatedAt: ts,
        anchorQuote: body.anchorQuote?.trim() || undefined,
        mentionedUids: mentionedUids.length ? mentionedUids : undefined,
      }) as EntryComment;
      await store().set(entryCommentPath(orgId, notebookId, entryId, id), comment as unknown as Record<string, unknown>);
      publishNotebookEvent(orgId, notebookId, {
        type: "comment.upserted",
        entryId,
        comment: comment as unknown as Record<string, unknown>,
        at: ts,
      });
      await recountEntryComments(orgId, notebookId, entryId);

      if (mentionedUids.length) {
        const site = (process.env.PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
        const entryPathUrl = `${site}/org/${orgId}/notebook/${notebookId}/entry/${entryId}`;
        const authorName =
          (await store().get(userPath(user.uid)))?.displayName ||
          user.email ||
          "Someone";
        for (const uid of mentionedUids) {
          const om = withoutId((await store().get(memberPath(orgId, uid)))!) as OrgMember;
          const profile = (await store().get(userPath(uid))) as
            | { email?: string; displayName?: string }
            | null;
          const to = om.email || profile?.email;
          if (!to) continue;
          try {
            await notifications.send({
              to,
              template: "comment_mention",
              data: {
                orgId,
                notebookId,
                entryId,
                commentId: id,
                authorName,
                entryPathUrl,
                snippet: text.slice(0, 500),
                siteUrl: site,
              },
            });
          } catch (err) {
            request.log.warn({ err, uid }, "comment mention notify failed");
          }
        }
      }
      return comment;
    }
  );

  app.patch(
    "/org/:orgId/notebook/:notebookId/entry/:entryId/comments/:commentId",
    async (request, reply) => {
      const user = getUser(request);
      const { orgId, notebookId, entryId, commentId } = request.params as {
        orgId: string;
        notebookId: string;
        entryId: string;
        commentId: string;
      };
      await assertNotebookWritable(user, orgId, notebookId);
      const path = entryCommentPath(orgId, notebookId, entryId, commentId);
      const snap = await store().get(path);
      if (!snap) return reply.code(404).send({ error: "not found" });
      const existing = withoutId(snap) as EntryComment;
      const body = request.body as {
        body?: string;
        resolved?: boolean;
      };
      const ts = nowIso();
      const patch: Record<string, unknown> = { updatedAt: ts };
      if (body.body !== undefined) {
        const text = body.body.trim();
        if (!text) return reply.code(400).send({ error: "body required" });
        patch.body = text;
      }
      if (body.resolved === true) {
        patch.resolvedAt = ts;
        patch.resolvedBy = user.uid;
      } else if (body.resolved === false) {
        patch.resolvedAt = null;
        patch.resolvedBy = null;
      }
      await store().update(path, omitUndefined(patch));
      const comment = { ...existing, ...patch, id: commentId } as EntryComment;
      publishNotebookEvent(orgId, notebookId, {
        type: "comment.upserted",
        entryId,
        comment: comment as unknown as Record<string, unknown>,
        at: ts,
      });
      await recountEntryComments(orgId, notebookId, entryId);
      return comment;
    }
  );

  app.delete(
    "/org/:orgId/notebook/:notebookId/entry/:entryId/comments/:commentId",
    async (request, reply) => {
      const user = getUser(request);
      const { orgId, notebookId, entryId, commentId } = request.params as {
        orgId: string;
        notebookId: string;
        entryId: string;
        commentId: string;
      };
      await assertNotebookWritable(user, orgId, notebookId);
      const path = entryCommentPath(orgId, notebookId, entryId, commentId);
      const snap = await store().get(path);
      if (!snap) return reply.code(404).send({ error: "not found" });
      await store().delete(path);
      const ts = nowIso();
      publishNotebookEvent(orgId, notebookId, {
        type: "comment.deleted",
        entryId,
        commentId,
        at: ts,
      });
      await recountEntryComments(orgId, notebookId, entryId);
      return { ok: true };
    }
  );

  app.get("/org/:orgId/notebook/:notebookId/entry/:entryId/content", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, entryId } = request.params as {
      orgId: string;
      notebookId: string;
      entryId: string;
    };
    await assertNotebookAccess(user, orgId, notebookId);
    const snap = await store().get(entryPath(orgId, notebookId, entryId));
    if (!snap) return reply.code(404).send({ error: "not found" });
    const meta = withoutId(snap) as EntryMetadata;
    const key = meta.tipTapGcsPath || gcsKeys.tipTap(orgId, notebookId, entryId);
    const buf = await storage.getObject(key);
    if (!buf) return reply.code(404).send({ error: "content not found" });
    return JSON.parse(buf.toString("utf8"));
  });

  app.put("/org/:orgId/notebook/:notebookId/entry/:entryId/content", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, entryId } = request.params as {
      orgId: string;
      notebookId: string;
      entryId: string;
    };
    await assertNotebookWritable(user, orgId, notebookId);
    const refPath = entryPath(orgId, notebookId, entryId);
    const snap = await store().get(refPath);
    if (!snap) return reply.code(404).send({ error: "not found" });
    const meta = withoutId(snap) as EntryMetadata;
    const key = meta.tipTapGcsPath || gcsKeys.tipTap(orgId, notebookId, entryId);
    const tipTapRev = (meta.tipTapRev ?? 0) + 1;
    await storage.putObject(key, JSON.stringify(request.body), "application/json");
    await store().update(refPath, { tipTapGcsPath: key, tipTapRev, updatedAt: nowIso() });
    void ensureNotebookContributor(orgId, notebookId, user.uid);
    return { ok: true, tipTapRev, tipTapGcsPath: key };
  });

  // Binary content-type parsers are registered once on the root Fastify app (index.ts).

  // ── Org-scoped assets (People avatars / public CMS media) ───────────────

  app.post("/org/:orgId/assets", async (request, reply) => {
    const user = getUser(request);
    const { orgId } = request.params as { orgId: string };
    await requireOrgMember(user, orgId, "admin");
    const body = request.body as { contentType?: string; byteSize?: number };
    const id = randomUUID();
    const gcsPath = gcsKeys.orgAsset(orgId, id, "compressed");
    const asset: AssetMetadata = {
      id,
      contentType: body.contentType || "application/octet-stream",
      byteSize: body.byteSize ?? 0,
      gcsPath,
      createdBy: user.uid,
      createdAt: nowIso(),
      usedBy: [],
    };
    await store().set(orgAssetPath(orgId, id), omitUndefined({ ...asset }) as Record<string, unknown>);
    const uploadPath = `/org/${orgId}/assets/${id}/content`;
    return { asset, uploadPath, uploadUrl: uploadPath };
  });

  app.put("/org/:orgId/assets/:assetId/content", async (request, reply) => {
    const user = getUser(request);
    const { orgId, assetId } = request.params as { orgId: string; assetId: string };
    await requireOrgMember(user, orgId, "admin");
    const refPath = orgAssetPath(orgId, assetId);
    const snap = await store().get(refPath);
    if (!snap) return reply.code(404).send({ error: "not found" });
    const asset = withoutId(snap) as AssetMetadata;
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
    await store().update(refPath, { byteSize, contentType });
    return { ok: true, byteSize };
  });

  app.get("/org/:orgId/assets", async (request) => {
    const user = getUser(request);
    const { orgId } = request.params as { orgId: string };
    await requireOrgMember(user, orgId);
    const snap = await store().query(orgAssetsCollection(orgId));
    return snap.map((d) => withoutId(d));
  });

  app.get("/org/:orgId/assets/:assetId/url", async (request, reply) => {
    const user = getUser(request);
    const { orgId, assetId } = request.params as { orgId: string; assetId: string };
    await requireOrgMember(user, orgId);
    const snap = await store().get(orgAssetPath(orgId, assetId));
    if (!snap) return reply.code(404).send({ error: "not found" });
    const asset = withoutId(snap) as AssetMetadata;
    const url = await storage.getSignedUrl(asset.gcsPath, "read");
    return { url, asset };
  });

  app.delete("/org/:orgId/assets/:assetId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, assetId } = request.params as { orgId: string; assetId: string };
    await requireOrgMember(user, orgId, "admin");
    const refPath = orgAssetPath(orgId, assetId);
    const snap = await store().get(refPath);
    if (!snap) return reply.code(404).send({ error: "not found" });
    const asset = withoutId(snap) as AssetMetadata;
    await safeDeleteObject(storage, asset.gcsPath);
    await safeDeleteObject(storage, asset.gcsPathOriginal);
    await store().delete(refPath);
    return { ok: true };
  });

  app.post("/org/:orgId/notebook/:notebookId/assets", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookWritable(user, orgId, notebookId);
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
    await store().set(assetPath(orgId, notebookId, id), omitUndefined({ ...asset }) as Record<string, unknown>);
    // Relative path the website uploads to with Bearer auth (not a GCS signed URL).
    const uploadPath = `/org/${orgId}/notebook/${notebookId}/assets/${id}/content`;
    return { asset, uploadPath, uploadUrl: uploadPath };
  });

  app.put("/org/:orgId/notebook/:notebookId/assets/:assetId/content", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, assetId } = request.params as {
      orgId: string;
      notebookId: string;
      assetId: string;
    };
    await assertNotebookWritable(user, orgId, notebookId);
    const refPath = assetPath(orgId, notebookId, assetId);
    const snap = await store().get(refPath);
    if (!snap) return reply.code(404).send({ error: "not found" });
    const asset = withoutId(snap) as AssetMetadata;
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
    await store().update(refPath, { byteSize, contentType });
    return { ok: true, byteSize };
  });

  app.get("/org/:orgId/notebook/:notebookId/assets", async (request) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookAccess(user, orgId, notebookId);
    const snap = await store().query(assetsCollection(orgId, notebookId));
    return snap.map((d) => withoutId(d));
  });

  app.get("/org/:orgId/notebook/:notebookId/assets/:assetId/url", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, assetId } = request.params as {
      orgId: string;
      notebookId: string;
      assetId: string;
    };
    await assertNotebookAccess(user, orgId, notebookId);
    const snap = await store().get(assetPath(orgId, notebookId, assetId));
    if (!snap) return reply.code(404).send({ error: "not found" });
    const asset = withoutId(snap) as AssetMetadata;
    const url = await storage.getSignedUrl(asset.gcsPath, "read");
    return { url, asset };
  });

  app.delete("/org/:orgId/notebook/:notebookId/assets/:assetId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, assetId } = request.params as {
      orgId: string;
      notebookId: string;
      assetId: string;
    };
    await assertNotebookWritable(user, orgId, notebookId);
    const refPath = assetPath(orgId, notebookId, assetId);
    const snap = await store().get(refPath);
    if (!snap) return reply.code(404).send({ error: "not found" });
    const asset = withoutId(snap) as AssetMetadata;
    await safeDeleteObject(storage, asset.gcsPath);
    await safeDeleteObject(storage, asset.gcsPathOriginal);
    await store().delete(refPath);
    return { ok: true };
  });

  // ── Compiled PDF exports (versioned) ─────────────────────────────────────

  app.get("/org/:orgId/notebook/:notebookId/exports", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookAccess(user, orgId, notebookId);
    const rows = await store().query(compileExportsCollection(orgId, notebookId));
    const exports = rows
      .map((d) => {
        const { id, ...rest } = d;
        return { id: String(id), ...(rest as Record<string, unknown>) } as {
          id: string;
          createdAt?: string;
          createdBy?: string;
          byteSize?: number;
          label?: string;
        };
      })
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    const nb = await store().get(notebookPath(orgId, notebookId));
    return {
      exports,
      latestExportId: nb?.latestExportId ?? null,
      publicExportId: nb?.publicExportId ?? null,
      publicAccess: nb?.publicAccess ?? "off",
      publicKey: nb?.publicKey ?? null,
    };
  });

  app.put("/org/:orgId/notebook/:notebookId/exports/:exportId/content", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, exportId } = request.params as {
      orgId: string;
      notebookId: string;
      exportId: string;
    };
    await assertNotebookAccess(user, orgId, notebookId);
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
      return reply.code(400).send({ error: "expected binary body stream" });
    }
    let recorded: Awaited<ReturnType<typeof recordCompilePreview>>;
    try {
      recorded = await recordCompilePreview({
        orgId,
        notebookId,
        storage,
        pdf,
        createdBy: user.uid,
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(status).send({
        error: message,
        code: (err as { code?: string }).code,
      });
    }
    publishNotebookEvent(orgId, notebookId, {
      type: "notebook.updated",
      notebook: {
        id: notebookId,
        updatedAt: recorded.createdAt,
      },
      at: recorded.createdAt,
    });
    return {
      ok: true,
      exportId: recorded.exportId,
      gcsPath: gcsKeys.exportPdf(orgId, notebookId, recorded.exportId),
      createdAt: recorded.createdAt,
      byteSize: recorded.byteSize,
    };
  });

  app.post("/org/:orgId/notebook/:notebookId/exports/save", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as {
      orgId: string;
      notebookId: string;
    };
    await assertNotebookWritable(user, orgId, notebookId);
    const body = (request.body as { label?: string | null } | undefined) ?? {};
    try {
      const saved = await saveCurrentPreviewAsVersion({
        orgId,
        notebookId,
        storage,
        createdBy: user.uid,
        label: body.label,
      });
      publishNotebookEvent(orgId, notebookId, {
        type: "notebook.updated",
        notebook: {
          id: notebookId,
          latestExportId: saved.exportId,
          updatedAt: saved.createdAt,
        },
        at: saved.createdAt,
      });
      return {
        ok: true,
        export: saved.exportMeta,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(status).send({
        error: message,
        code: (err as { code?: string }).code,
      });
    }
  });

  app.get("/org/:orgId/notebook/:notebookId/exports/:exportId/pdf", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, exportId } = request.params as {
      orgId: string;
      notebookId: string;
      exportId: string;
    };
    await assertNotebookAccess(user, orgId, notebookId);
    const resolved = await resolveExportPdfKey(orgId, notebookId, exportId, storage);
    if (!resolved) return reply.code(404).send({ error: "export not found" });

    const bytes = await storage.getObject(resolved.key);
    if (!bytes) return reply.code(404).send({ error: "export bytes not found" });

    const nbSnap = await store().get(notebookPath(orgId, notebookId));
    const nb = nbSnap as NotebookSummary | null;
    const filename = `${(nb?.title || nb?.name || "notebook").replace(/[^\w.-]+/g, "_")}.pdf`;

    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `inline; filename="${filename}"`)
      .header("Cache-Control", "private, no-cache")
      .header("Content-Length", String(bytes.byteLength))
      .send(bytes);
  });

  app.get("/org/:orgId/notebook/:notebookId/exports/:exportId/url", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, exportId } = request.params as {
      orgId: string;
      notebookId: string;
      exportId: string;
    };
    await assertNotebookAccess(user, orgId, notebookId);
    const resolved = await resolveExportPdfKey(orgId, notebookId, exportId, storage);
    if (!resolved) return reply.code(404).send({ error: "export not found" });
    const url = await storage.getSignedUrl(resolved.key, "read");
    return { url, exportId: resolved.exportId, gcsPath: resolved.key };
  });

  app.delete("/org/:orgId/notebook/:notebookId/exports/:exportId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, exportId } = request.params as {
      orgId: string;
      notebookId: string;
      exportId: string;
    };
    await assertNotebookWritable(user, orgId, notebookId);
    try {
      const result = await deleteCompileExport({ orgId, notebookId, exportId, storage });
      publishNotebookEvent(orgId, notebookId, {
        type: "notebook.updated",
        notebook: {
          id: notebookId,
          latestExportId: result.latestExportId,
          publicExportId: result.publicExportId,
          publicAccess: result.publicAccess,
          updatedAt: new Date().toISOString(),
        },
        at: new Date().toISOString(),
      });
      return result;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({ error: (err as Error).message });
    }
  });

  /**
   * Generic notebook job enqueue. Compile shortcut below uses type "compile".
   * Progress/done/failed arrive on notebook SSE as job.*.
   */
  app.post("/org/:orgId/notebook/:notebookId/jobs", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookWritable(user, orgId, notebookId);

    const body = (request.body || {}) as {
      type?: string;
      resourceKey?: string;
      payload?: Record<string, unknown>;
    };
    const type = body.type?.trim();
    if (!type) return reply.code(400).send({ error: "type required" });

    const resourceKey =
      body.resourceKey?.trim() ||
      (type === "compile" ? "notebook" : type);

    const result = await enqueueNotebookJob({
      orgId,
      notebookId,
      type,
      resourceKey,
      payload: body.payload || {},
      createdBy: user.uid,
      dispatch: jobDispatch,
    });

    if (result.ok) {
      return reply.code(202).send({ ok: true, jobId: result.job.jobId, job: result.job });
    }
    if (result.status === 409) {
      return reply.code(409).send({
        error: "job_in_flight",
        jobId: result.job.jobId,
        job: result.job,
      });
    }
    if (result.status === 503) {
      return reply.code(503).send({
        error: result.code,
        message: result.error,
      });
    }
    return reply.code(502).send({
      error: result.code,
      jobId: result.jobId,
      message: result.error,
      detail: result.detail,
    });
  });

  app.get("/org/:orgId/notebook/:notebookId/jobs/:jobId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, jobId } = request.params as {
      orgId: string;
      notebookId: string;
      jobId: string;
    };
    await assertNotebookAccess(user, orgId, notebookId);
    const job = await getJob(orgId, notebookId, jobId);
    if (!job) return reply.code(404).send({ error: "job not found" });
    return { job };
  });

  /**
   * Shortcut: enqueue type=compile (XeLaTeX worker).
   * Returns 202 + jobId; 409 if compile already in flight; 503 if no worker.
   */
  app.post("/org/:orgId/notebook/:notebookId/compile", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookWritable(user, orgId, notebookId);

    const result = await enqueueNotebookJob({
      orgId,
      notebookId,
      type: "compile",
      resourceKey: "notebook",
      payload: {},
      createdBy: user.uid,
      dispatch: jobDispatch,
    });

    if (result.ok) {
      return reply.code(202).send({ ok: true, jobId: result.job.jobId });
    }
    if (result.status === 409) {
      return reply.code(409).send({
        error: "job_in_flight",
        jobId: result.job.jobId,
      });
    }
    if (result.status === 503) {
      return reply.code(503).send({
        error: "compile_service_unavailable",
        message: result.error,
      });
    }
    return reply.code(502).send({
      error: "compile_worker_error",
      jobId: result.jobId,
      message: result.error,
      detail: result.detail,
    });
  });

  // ── Compile export labels ───────────────────────────────────────────────

  app.patch("/org/:orgId/notebook/:notebookId/exports/:exportId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, exportId } = request.params as {
      orgId: string;
      notebookId: string;
      exportId: string;
    };
    await assertNotebookWritable(user, orgId, notebookId);
    if (!exportId || exportId === "latest") {
      return reply.code(400).send({ error: "cannot rename latest alias" });
    }
    const body = request.body as { label?: string | null };
    const refPath = compileExportPath(orgId, notebookId, exportId);
    const snap = await store().get(refPath);
    if (!snap) return reply.code(404).send({ error: "export not found" });
    const label =
      body.label === null || body.label === undefined
        ? null
        : String(body.label).trim().slice(0, 80) || null;
    await store().update(refPath, omitUndefined({ label, updatedAt: nowIso() }));
    const { id: _id, ...rest } = { ...withoutId(snap), id: exportId, label: label || undefined };
    void _id;
    return { id: exportId, ...rest, label: label || undefined };
  });

  // ── Explicit PDF share links ────────────────────────────────────────────

  app.get("/org/:orgId/notebook/:notebookId/share-links", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    await assertNotebookAccess(user, orgId, notebookId);
    const includeRevoked =
      String((request.query as { includeRevoked?: string }).includeRevoked || "") === "1";
    const links = await listShareLinks(orgId, notebookId, { includeRevoked });
    return { links };
  });

  app.post("/org/:orgId/notebook/:notebookId/share-links", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId } = request.params as { orgId: string; notebookId: string };
    const nbSnap = await store().get(notebookPath(orgId, notebookId));
    if (!nbSnap) return reply.code(404).send({ error: "not found" });
    const callerRole = await requireNotebookAccess(
      user,
      orgId,
      withoutId(nbSnap) as NotebookSummary
    );
    if (callerRole !== "owner" && callerRole !== "admin" && !isServiceAdmin(user)) {
      return reply.code(403).send({ error: "Only admins and owners can create share links" });
    }
    await assertNotebookNotArchived(nbSnap as NotebookSummary);
    const body = request.body as { name?: string; exportId?: string; visibility?: "unlisted" | "public" };
    try {
      const link = await createShareLink({
        orgId,
        notebookId,
        name: String(body.name || "Share link"),
        exportId: String(body.exportId || ""),
        visibility: body.visibility,
        createdBy: user.uid,
      });
      return reply.code(201).send(link);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({ error: (err as Error).message });
    }
  });

  app.patch("/org/:orgId/notebook/:notebookId/share-links/:linkId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, linkId } = request.params as {
      orgId: string;
      notebookId: string;
      linkId: string;
    };
    const nbSnap = await store().get(notebookPath(orgId, notebookId));
    if (!nbSnap) return reply.code(404).send({ error: "not found" });
    const callerRole = await requireNotebookAccess(
      user,
      orgId,
      withoutId(nbSnap) as NotebookSummary
    );
    if (callerRole !== "owner" && callerRole !== "admin" && !isServiceAdmin(user)) {
      return reply.code(403).send({ error: "Only admins and owners can edit share links" });
    }
    await assertNotebookNotArchived(nbSnap as NotebookSummary);
    const body = request.body as { name?: string; exportId?: string; visibility?: "unlisted" | "public" };
    try {
      const link = await updateShareLink({
        orgId,
        notebookId,
        linkId,
        name: body.name,
        exportId: body.exportId,
        visibility: body.visibility,
      });
      return link;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({ error: (err as Error).message });
    }
  });

  app.delete("/org/:orgId/notebook/:notebookId/share-links/:linkId", async (request, reply) => {
    const user = getUser(request);
    const { orgId, notebookId, linkId } = request.params as {
      orgId: string;
      notebookId: string;
      linkId: string;
    };
    const nbSnap = await store().get(notebookPath(orgId, notebookId));
    if (!nbSnap) return reply.code(404).send({ error: "not found" });
    const callerRole = await requireNotebookAccess(
      user,
      orgId,
      withoutId(nbSnap) as NotebookSummary
    );
    if (callerRole !== "owner" && callerRole !== "admin" && !isServiceAdmin(user)) {
      return reply.code(403).send({ error: "Only admins and owners can revoke share links" });
    }
    try {
      const link = await revokeShareLink({ orgId, notebookId, linkId });
      return { ok: true, link };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({ error: (err as Error).message });
    }
  });

  // ── Org catalogs (donors / projects / events / social-links) ───────────
  const catalogCollections = {
    donors: donorsCollection,
    projects: projectsCollection,
    events: eventsCollection,
    "social-links": socialLinksCollection,
  } as const;

  type CatalogSection = keyof typeof catalogCollections;

  function normalizeCatalogBody(body: Record<string, unknown>) {
    const next = { ...body };
    if (next.public === undefined) next.public = true;
    else next.public = next.public === false ? false : true;
    return next;
  }

  for (const section of Object.keys(catalogCollections) as CatalogSection[]) {
    const coll = catalogCollections[section];

    app.get(`/org/:orgId/${section}`, async (request, reply) => {
      const user = getUser(request);
      const { orgId } = request.params as { orgId: string };
      await requireOrgMember(user, orgId, "admin");
      const snap = await store().query(coll(orgId));
      return snap
        .map((d) => ({ ...withoutId(d), id: d.id }))
        .sort((a, b) => Number((a as { order?: number }).order ?? 0) - Number((b as { order?: number }).order ?? 0));
    });

    app.put(`/org/:orgId/${section}/:itemId`, async (request, reply) => {
      const user = getUser(request);
      const { orgId, itemId } = request.params as { orgId: string; itemId: string };
      await requireOrgMember(user, orgId, "admin");
      const body = normalizeCatalogBody((request.body || {}) as Record<string, unknown>);
      const id = itemId === "new" ? randomUUID() : itemId;
      const doc = omitUndefined({ ...body, id, updatedAt: nowIso() });
      await store().set(`${coll(orgId)}/${id}`, doc as Record<string, unknown>, { merge: true });
      return { id, ...doc };
    });

    app.delete(`/org/:orgId/${section}/:itemId`, async (request, reply) => {
      const user = getUser(request);
      const { orgId, itemId } = request.params as { orgId: string; itemId: string };
      await requireOrgMember(user, orgId, "admin");
      await store().delete(`${coll(orgId)}/${itemId}`);
      return { ok: true };
    });
  }
}
