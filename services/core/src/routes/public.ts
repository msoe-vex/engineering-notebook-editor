import type { FastifyInstance } from "fastify";
import {
  orgPath,
  orgSlugPath,
  notebookPath,
  membersCollection,
  orgAssetPath,
  donorsCollection,
  projectsCollection,
  eventsCollection,
  socialLinksCollection,
  publicNotebookKeyPath,
  isPublicRecord,
  isPublicSection,
  type Organization,
  type OrgMember,
  type NotebookSummaryV5,
  type AssetMetadata,
} from "@engineering-notebook/shared";
import { resolveExportPdfKey } from "../compile/recordCompileExport.js";
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

  async function resolveOrgAssetUrl(orgId: string, imageAssetId?: string) {
    if (!imageAssetId) return undefined;
    const assetSnap = await store().get(orgAssetPath(orgId, imageAssetId));
    if (!assetSnap) return undefined;
    try {
      return await storage.getSignedUrl((assetSnap as AssetMetadata).gcsPath, "read");
    } catch {
      return undefined;
    }
  }

  app.get("/public/o/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const org = await resolveOrgBySlug(slug.toLowerCase());
    if (!org) return reply.code(404).send({ error: "not found" });
    if (org.publicPage?.visibility !== "public") {
      return reply.code(404).send({ error: "not found" });
    }
    const orgId = org.id;
    const [donors, projects, events, orgMembers, social] = await Promise.all([
      store().query(donorsCollection(orgId)),
      store().query(projectsCollection(orgId)),
      store().query(eventsCollection(orgId)),
      store().query(membersCollection(orgId)),
      store().query(socialLinksCollection(orgId)),
    ]);

    const page = org.publicPage;

    const enrichedMembers = isPublicSection(page, "members")
      ? await Promise.all(
          orgMembers
            .map((d) => {
              const { id, ...rest } = d;
              return { ...(rest as OrgMember), uid: String(id) };
            })
            .filter((m) => isPublicRecord(m))
            .map(async (m) => {
              const imageUrl = await resolveOrgAssetUrl(orgId, m.imageAssetId);
              return {
                id: m.uid,
                name: m.displayName || m.email || "Member",
                role: m.title || undefined,
                title: m.title,
                status: m.status || "active",
                imageAssetId: m.imageAssetId,
                imageUrl,
              };
            })
        )
      : [];

    async function enrichCatalog(
      sectionOn: boolean,
      rows: Array<Record<string, unknown> & { id: string }>
    ) {
      if (!sectionOn) return [];
      return Promise.all(
        rows
          .filter((d) => isPublicRecord(d as { public?: boolean }))
          .map(async (d) => {
            const { id, ...data } = d as {
              id: string;
              imageAssetId?: string;
              public?: boolean;
            };
            const imageUrl = await resolveOrgAssetUrl(orgId, data.imageAssetId);
            return { id, ...data, imageUrl };
          })
      );
    }

    const logoUrl = await resolveOrgAssetUrl(orgId, page?.logoAssetId);
    const aboutText = isPublicSection(page, "about")
      ? page?.about || page?.mission
      : undefined;
    const publicPage = page
      ? {
          ...page,
          about: aboutText,
          mission: aboutText ? page.mission : undefined,
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
      donors: await enrichCatalog(
        isPublicSection(page, "donors"),
        donors as Array<Record<string, unknown> & { id: string }>
      ),
      projects: await enrichCatalog(
        isPublicSection(page, "projects"),
        projects as Array<Record<string, unknown> & { id: string }>
      ),
      events: await enrichCatalog(
        isPublicSection(page, "events"),
        events as Array<Record<string, unknown> & { id: string }>
      ),
      members: enrichedMembers,
      social: await enrichCatalog(
        isPublicSection(page, "social"),
        social as Array<Record<string, unknown> & { id: string }>
      ),
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

    const exportId = nb.publicExportId || nb.latestExportId || "latest";
    const resolved = await resolveExportPdfKey(org.id, notebookId, exportId, storage);
    let pdfUrl: string | undefined;
    if (resolved) {
      try {
        pdfUrl = await storage.getSignedUrl(resolved.key, "read");
      } catch {
        pdfUrl = undefined;
      }
    }

    return {
      org: { id: org.id, name: org.name, slug: org.slug },
      notebook: {
        id: nb.id,
        name: nb.name,
        title: nb.title,
        subtitle: nb.subtitle,
        publicAccess: nb.publicAccess,
        publicKey: nb.publicKey,
        lastCompiled: nb.lastCompiled,
        publicExportId: resolved?.exportId || nb.publicExportId || null,
      },
      pdfUrl,
      noindex: nb.publicAccess === "unlisted",
    };
  });

  /** Entry TipTap public reads removed — public notebooks are PDF-only. */
  app.get("/public/o/:slug/notebooks/:publicKey/entries/:entryId", async (_request, reply) => {
    return reply.code(404).send({ error: "not found" });
  });

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
    const exportId = nb.publicExportId || nb.latestExportId || "latest";
    const resolved = await resolveExportPdfKey(org.id, notebookId, exportId, storage);
    if (!resolved) return reply.code(404).send({ error: "no compiled pdf" });
    const url = await storage.getSignedUrl(resolved.key, "read");
    return {
      url,
      lastCompiled: nb.lastCompiled,
      exportId: resolved.exportId,
    };
  });
}
