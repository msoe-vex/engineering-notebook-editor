import type { FastifyInstance } from "fastify";
import {
  orgPath,
  orgSlugPath,
  notebookPath,
  entriesCollection,
  entryPath,
  notebookMembersCollection,
  memberPath,
  orgAssetPath,
  publicDonorsCollection,
  publicProjectsCollection,
  publicEventsCollection,
  publicMembersCollection,
  publicSocialCollection,
  publicNotebookKeyPath,
  gcsKeys,
  type Organization,
  type OrgMember,
  type NotebookSummaryV5,
  type EntryMetadataV5,
  type AssetMetadata,
} from "@engineering-notebook/shared";
import { getFirestore } from "../db/firestore.js";
import type { StoragePort } from "../storage/storagePort.js";

async function resolveOrgBySlug(slug: string) {
  const db = getFirestore();
  const lookup = await db.doc(orgSlugPath(slug)).get();
  if (!lookup.exists) return null;
  const orgId = (lookup.data() as { orgId?: string }).orgId;
  if (!orgId) return null;
  const orgSnap = await db.doc(orgPath(orgId)).get();
  if (!orgSnap.exists) return null;
  const org = { ...(orgSnap.data() as Organization), id: orgSnap.id };
  return org;
}

export async function registerPublicRoutes(app: FastifyInstance, storage: StoragePort) {
  const db = () => getFirestore();

  app.get("/public/o/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const org = await resolveOrgBySlug(slug.toLowerCase());
    if (!org) return reply.code(404).send({ error: "not found" });
    if (org.publicPage?.visibility !== "public") {
      return reply.code(404).send({ error: "not found" });
    }
    const orgId = org.id;
    const [donors, projects, events, members, social] = await Promise.all([
      db().collection(publicDonorsCollection(orgId)).get(),
      db().collection(publicProjectsCollection(orgId)).get(),
      db().collection(publicEventsCollection(orgId)).get(),
      db().collection(publicMembersCollection(orgId)).get(),
      db().collection(publicSocialCollection(orgId)).get(),
    ]);

    async function resolveOrgAssetUrl(imageAssetId?: string) {
      if (!imageAssetId) return undefined;
      const assetSnap = await db().doc(orgAssetPath(orgId, imageAssetId)).get();
      if (!assetSnap.exists) return undefined;
      try {
        return await storage.getSignedUrl((assetSnap.data() as AssetMetadata).gcsPath, "read");
      } catch {
        return undefined;
      }
    }

    const enrichedMembers = await Promise.all(
      members.docs.map(async (d) => {
        const data = d.data() as {
          imageAssetId?: string;
          orgMemberUid?: string;
          name?: string;
          role?: string;
          classYear?: string;
        };
        let imageAssetId = data.imageAssetId;
        if (!imageAssetId && data.orgMemberUid) {
          const om = await db().doc(memberPath(orgId, data.orgMemberUid)).get();
          if (om.exists) {
            imageAssetId = (om.data() as OrgMember).imageAssetId;
          }
        }
        const imageUrl = await resolveOrgAssetUrl(imageAssetId);
        return { id: d.id, ...data, imageAssetId, imageUrl };
      })
    );

    const enrichedDonors = await Promise.all(
      donors.docs.map(async (d) => {
        const data = d.data() as { imageAssetId?: string; name?: string; url?: string; tier?: string };
        const imageUrl = await resolveOrgAssetUrl(data.imageAssetId);
        return { id: d.id, ...data, imageUrl };
      })
    );

    return {
      org: {
        id: orgId,
        name: org.name,
        slug: org.slug,
        publicPage: org.publicPage,
      },
      donors: enrichedDonors,
      projects: projects.docs.map((d) => ({ id: d.id, ...d.data() })),
      events: events.docs.map((d) => ({ id: d.id, ...d.data() })),
      members: enrichedMembers,
      social: social.docs.map((d) => ({ id: d.id, ...d.data() })),
    };
  });

  app.get("/public/o/:slug/notebooks/:publicKey", async (request, reply) => {
    const { slug, publicKey } = request.params as { slug: string; publicKey: string };
    const org = await resolveOrgBySlug(slug.toLowerCase());
    if (!org) return reply.code(404).send({ error: "not found" });
    const key = publicKey.trim().toLowerCase();
    const keySnap = await db().doc(publicNotebookKeyPath(org.id, key)).get();
    if (!keySnap.exists) return reply.code(404).send({ error: "not found" });
    const notebookId = (keySnap.data() as { notebookId?: string }).notebookId;
    if (!notebookId) return reply.code(404).send({ error: "not found" });
    const nbSnap = await db().doc(notebookPath(org.id, notebookId)).get();
    if (!nbSnap.exists) return reply.code(404).send({ error: "not found" });
    const nb = { id: nbSnap.id, ...(nbSnap.data() as NotebookSummaryV5) };
    if (nb.publicAccess !== "public" && nb.publicAccess !== "unlisted") {
      return reply.code(404).send({ error: "not found" });
    }
    if (nb.publicKey !== key) return reply.code(404).send({ error: "not found" });

    const [entries, contributors] = await Promise.all([
      db().collection(entriesCollection(org.id, notebookId)).get(),
      db().collection(notebookMembersCollection(org.id, notebookId)).get(),
    ]);
    const liveEntries = entries.docs
      .map((d) => ({ id: d.id, ...(d.data() as EntryMetadataV5) }))
      .filter((e) => !e.deletedAt)
      .map((e) => ({
        id: e.id,
        title: e.title,
        authors: e.authors,
        phase: e.phase,
        date: e.date,
        folderId: e.folderId,
        explorerOrder: e.explorerOrder,
        order: e.order,
      }));

    return {
      org: { id: org.id, name: org.name, slug: org.slug },
      notebook: {
        id: nb.id,
        name: nb.name,
        title: nb.title,
        subtitle: nb.subtitle,
        logoAssetId: nb.logoAssetId,
        folders: nb.folders,
        phases: nb.phases,
        publicAccess: nb.publicAccess,
        publicKey: nb.publicKey,
        lastCompiled: nb.lastCompiled,
        // publishedAt / publishedBy / judgments intentionally omitted (admin-only)
      },
      entries: liveEntries,
      contributors: contributors.docs.map((d) => ({
        id: d.id,
        name: (d.data() as { name?: string }).name,
        role: (d.data() as { role?: string }).role,
        order: (d.data() as { order?: number }).order,
      })),
      noindex: nb.publicAccess === "unlisted",
    };
  });

  app.get("/public/o/:slug/notebooks/:publicKey/entries/:entryId", async (request, reply) => {
    const { slug, publicKey, entryId } = request.params as {
      slug: string;
      publicKey: string;
      entryId: string;
    };
    const org = await resolveOrgBySlug(slug.toLowerCase());
    if (!org) return reply.code(404).send({ error: "not found" });
    const key = publicKey.trim().toLowerCase();
    const keySnap = await db().doc(publicNotebookKeyPath(org.id, key)).get();
    if (!keySnap.exists) return reply.code(404).send({ error: "not found" });
    const notebookId = (keySnap.data() as { notebookId?: string }).notebookId;
    if (!notebookId) return reply.code(404).send({ error: "not found" });
    const nbSnap = await db().doc(notebookPath(org.id, notebookId)).get();
    if (!nbSnap.exists) return reply.code(404).send({ error: "not found" });
    const nb = nbSnap.data() as NotebookSummaryV5;
    if (nb.publicAccess !== "public" && nb.publicAccess !== "unlisted") {
      return reply.code(404).send({ error: "not found" });
    }
    const entrySnap = await db().doc(entryPath(org.id, notebookId, entryId)).get();
    if (!entrySnap.exists) return reply.code(404).send({ error: "not found" });
    const entry = entrySnap.data() as EntryMetadataV5;
    if (entry.deletedAt) return reply.code(404).send({ error: "not found" });
    const tipTapKey = entry.tipTapGcsPath || gcsKeys.tipTap(org.id, notebookId, entryId);
    const buf = await storage.getObject(tipTapKey);
    let tipTapJson: unknown = null;
    if (buf) {
      try {
        tipTapJson = JSON.parse(buf.toString("utf8"));
      } catch {
        tipTapJson = null;
      }
    }
    return {
      entry: {
        id: entrySnap.id,
        title: entry.title,
        authors: entry.authors,
        phase: entry.phase,
        date: entry.date,
      },
      tipTapJson,
    };
  });

  /** Last compiled PDF when available (no live compile for anonymous). */
  app.get("/public/o/:slug/notebooks/:publicKey/pdf", async (request, reply) => {
    const { slug, publicKey } = request.params as { slug: string; publicKey: string };
    const org = await resolveOrgBySlug(slug.toLowerCase());
    if (!org) return reply.code(404).send({ error: "not found" });
    const key = publicKey.trim().toLowerCase();
    const keySnap = await db().doc(publicNotebookKeyPath(org.id, key)).get();
    if (!keySnap.exists) return reply.code(404).send({ error: "not found" });
    const notebookId = (keySnap.data() as { notebookId?: string }).notebookId;
    if (!notebookId) return reply.code(404).send({ error: "not found" });
    const nbSnap = await db().doc(notebookPath(org.id, notebookId)).get();
    if (!nbSnap.exists) return reply.code(404).send({ error: "not found" });
    const nb = nbSnap.data() as NotebookSummaryV5;
    if (nb.publicAccess !== "public" && nb.publicAccess !== "unlisted") {
      return reply.code(404).send({ error: "not found" });
    }
    if (!nb.lastCompiled) {
      return reply.code(404).send({ error: "no compiled pdf" });
    }
    const exportKey = gcsKeys.exportPdf(org.id, notebookId, "latest");
    const exists = await storage.getObject(exportKey);
    if (!exists) return reply.code(404).send({ error: "no compiled pdf" });
    const url = await storage.getSignedUrl(exportKey, "read");
    return { url, lastCompiled: nb.lastCompiled };
  });
}
