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
import { getMetadataStore } from "../db/metadataStore.js";
import type { StoragePort } from "../storage/storagePort.js";

async function resolveOrgBySlug(slug: string) {
  const store = getMetadataStore();
  const lookup = await store.get(orgSlugPath(slug));
  if (!lookup) return null;
  const orgId = lookup.orgId as string | undefined;
  if (!orgId) return null;
  const orgSnap = await store.get(orgPath(orgId));
  if (!orgSnap) return null;
  const { id: _id, ...rest } = orgSnap;
  return { ...(rest as Organization), id: orgId };
}

export async function registerPublicRoutes(app: FastifyInstance, storage: StoragePort) {
  const store = () => getMetadataStore();

  app.get("/public/o/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const org = await resolveOrgBySlug(slug.toLowerCase());
    if (!org) return reply.code(404).send({ error: "not found" });
    if (org.publicPage?.visibility !== "public") {
      return reply.code(404).send({ error: "not found" });
    }
    const orgId = org.id;
    const [donors, projects, events, members, social] = await Promise.all([
      store().query(publicDonorsCollection(orgId)),
      store().query(publicProjectsCollection(orgId)),
      store().query(publicEventsCollection(orgId)),
      store().query(publicMembersCollection(orgId)),
      store().query(publicSocialCollection(orgId)),
    ]);

    async function resolveOrgAssetUrl(imageAssetId?: string) {
      if (!imageAssetId) return undefined;
      const assetSnap = await store().get(orgAssetPath(orgId, imageAssetId));
      if (!assetSnap) return undefined;
      try {
        return await storage.getSignedUrl((assetSnap as AssetMetadata).gcsPath, "read");
      } catch {
        return undefined;
      }
    }

    const enrichedMembers = await Promise.all(
      members.map(async (d) => {
        const { id, ...data } = d as {
          id: string;
          imageAssetId?: string;
          orgMemberUid?: string;
          name?: string;
          role?: string;
          classYear?: string;
        };
        let imageAssetId = data.imageAssetId;
        if (!imageAssetId && data.orgMemberUid) {
          const om = await store().get(memberPath(orgId, data.orgMemberUid));
          if (om) {
            imageAssetId = (om as OrgMember).imageAssetId;
          }
        }
        const imageUrl = await resolveOrgAssetUrl(imageAssetId);
        return { id, ...data, imageAssetId, imageUrl };
      })
    );

    const enrichedDonors = await Promise.all(
      donors.map(async (d) => {
        const { id, ...data } = d as {
          id: string;
          imageAssetId?: string;
          name?: string;
          url?: string;
          tier?: string;
        };
        const imageUrl = await resolveOrgAssetUrl(data.imageAssetId);
        return { id, ...data, imageUrl };
      })
    );

    const logoUrl = await resolveOrgAssetUrl(org.publicPage?.logoAssetId);
    const publicPage = org.publicPage
      ? {
          ...org.publicPage,
          about: org.publicPage.about || org.publicPage.mission,
        }
      : undefined;

    return {
      org: {
        id: orgId,
        name: org.name,
        slug: org.slug,
        publicPage,
        logoUrl,
      },
      donors: enrichedDonors,
      projects: projects.map((d) => {
        const { id, ...rest } = d;
        return { id, ...rest };
      }),
      events: events.map((d) => {
        const { id, ...rest } = d;
        return { id, ...rest };
      }),
      members: enrichedMembers,
      social: social.map((d) => {
        const { id, ...rest } = d;
        return { id, ...rest };
      }),
    };
  });

  app.get("/public/o/:slug/notebooks/:publicKey", async (request, reply) => {
    const { slug, publicKey } = request.params as { slug: string; publicKey: string };
    const org = await resolveOrgBySlug(slug.toLowerCase());
    if (!org) return reply.code(404).send({ error: "not found" });
    const key = publicKey.trim().toLowerCase();
    const keySnap = await store().get(publicNotebookKeyPath(org.id, key));
    if (!keySnap) return reply.code(404).send({ error: "not found" });
    const notebookId = keySnap.notebookId as string | undefined;
    if (!notebookId) return reply.code(404).send({ error: "not found" });
    const nbSnap = await store().get(notebookPath(org.id, notebookId));
    if (!nbSnap) return reply.code(404).send({ error: "not found" });
    const { id: _nbId, ...nbRest } = nbSnap;
    const nb = { id: notebookId, ...(nbRest as NotebookSummaryV5) };
    if (nb.publicAccess !== "public" && nb.publicAccess !== "unlisted") {
      return reply.code(404).send({ error: "not found" });
    }
    if (nb.publicKey !== key) return reply.code(404).send({ error: "not found" });

    const [entries, contributors] = await Promise.all([
      store().query(entriesCollection(org.id, notebookId)),
      store().query(notebookMembersCollection(org.id, notebookId)),
    ]);
    const liveEntries = entries
      .map((d) => {
        const { id, ...rest } = d;
        return { id, ...(rest as EntryMetadataV5) };
      })
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
      contributors: contributors.map((d) => {
        const { id, ...data } = d as {
          id: string;
          name?: string;
          role?: string;
          order?: number;
        };
        return {
          id,
          name: data.name,
          role: data.role,
          order: data.order,
        };
      }),
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
    const keySnap = await store().get(publicNotebookKeyPath(org.id, key));
    if (!keySnap) return reply.code(404).send({ error: "not found" });
    const notebookId = keySnap.notebookId as string | undefined;
    if (!notebookId) return reply.code(404).send({ error: "not found" });
    const nbSnap = await store().get(notebookPath(org.id, notebookId));
    if (!nbSnap) return reply.code(404).send({ error: "not found" });
    const nb = nbSnap as NotebookSummaryV5;
    if (nb.publicAccess !== "public" && nb.publicAccess !== "unlisted") {
      return reply.code(404).send({ error: "not found" });
    }
    const entrySnap = await store().get(entryPath(org.id, notebookId, entryId));
    if (!entrySnap) return reply.code(404).send({ error: "not found" });
    const { id: entryDocId, ...entryRest } = entrySnap;
    const entry = entryRest as EntryMetadataV5;
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
        id: entryDocId,
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
    const keySnap = await store().get(publicNotebookKeyPath(org.id, key));
    if (!keySnap) return reply.code(404).send({ error: "not found" });
    const notebookId = keySnap.notebookId as string | undefined;
    if (!notebookId) return reply.code(404).send({ error: "not found" });
    const nbSnap = await store().get(notebookPath(org.id, notebookId));
    if (!nbSnap) return reply.code(404).send({ error: "not found" });
    const nb = nbSnap as NotebookSummaryV5;
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
