import type { FastifyInstance } from "fastify";
import {
  orgPath,
  orgSlugPath,
  notebookPath,
  notebooksCollection,
  notebookShareLinksCollection,
  membersCollection,
  orgAssetPath,
  donorsCollection,
  projectsCollection,
  eventsCollection,
  socialLinksCollection,
  isPublicRecord,
  isPublicSection,
  type Organization,
  type OrgMember,
  type NotebookSummary,
  type NotebookShareLink,
  type AssetMetadata,
} from "@engineering-notebook/shared";
import { resolveExportPdfKey } from "../compile/recordCompileExport.js";
import { resolvePublicShareLink } from "../compile/shareLinks.js";
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

  async function resolveOrgAssetUrl(slug: string, orgId: string, imageAssetId?: string) {
    if (!imageAssetId) return undefined;
    const assetSnap = await store().get(orgAssetPath(orgId, imageAssetId));
    if (!assetSnap) return undefined;
    return `/public/o/${slug}/assets/${imageAssetId}`;
  }

  async function getEnrichedMembers(slug: string, orgId: string, isSectionEnabled: boolean) {
    if (!isSectionEnabled) return [];
    const orgMembers = await store().query(membersCollection(orgId));
    return Promise.all(
      orgMembers
        .map((d) => {
          const { id, ...rest } = d;
          return { ...(rest as OrgMember), uid: String(id) };
        })
        .filter((m) => isPublicRecord(m))
        .map(async (m) => {
          const imageUrl = await resolveOrgAssetUrl(slug, orgId, m.imageAssetId);
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
    );
  }

  async function getEnrichedCatalog(
    slug: string,
    orgId: string,
    sectionOn: boolean,
    collectionPath: string
  ) {
    if (!sectionOn) return [];
    const rows = await store().query(collectionPath);
    return Promise.all(
      rows
        .filter((d) => isPublicRecord(d as { public?: boolean }))
        .map(async (d) => {
          const { id, ...data } = d as {
            id: string;
            imageAssetId?: string;
            public?: boolean;
          };
          const imageUrl = await resolveOrgAssetUrl(slug, orgId, data.imageAssetId);
          return { id, ...data, imageUrl };
        })
    );
  }

  /**
   * Helper to fetch all PDF publications explicitly marked "public".
   * Note: "unlisted" links are accessible via `/public/o/:slug/publications/:key` but excluded from this listing.
   * Private notebooks are excluded entirely.
   */
  async function getPublicPublications(slug: string, orgId: string, isSectionEnabled: boolean) {
    if (!isSectionEnabled) return [];
    const nbRows = await store().query(notebooksCollection(orgId));

    const publicList: Array<{
      title: string;
      subtitle?: string;
      publication: string;
      url: string;
      updatedAt?: string;
    }> = [];

    for (const nbRow of nbRows) {
      const nb = nbRow as NotebookSummary & { id: string };
      if (nb.archivedAt) continue;

      const linksRows = await store().query(notebookShareLinksCollection(orgId, nb.id));
      const activeLinks = linksRows
        .map((d) => {
          const { id, ...rest } = d;
          return { id: String(id), ...(rest as Omit<NotebookShareLink, "id">) } as NotebookShareLink;
        })
        .filter((l) => !l.revokedAt);

      for (const link of activeLinks) {
        // Distinguish public vs unlisted: only include links marked "public"
        if (link.visibility === "public") {
          publicList.push({
            title: nb.title || nb.name,
            subtitle: nb.subtitle,
            publication: link.name,
            url: `/public/o/${slug}/publications/${link.key}/pdf`,
            updatedAt: link.updatedAt || nb.updatedAt,
          });
        }
      }
    }

    return publicList;
  }

  // ── 1. Comprehensive Org Public Page Bundle ───────────────────────────
  app.get("/public/o/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const org = await resolveOrgBySlug(slug.toLowerCase());
    if (!org) return reply.code(404).send({ error: "not found" });
    if (org.publicPage?.visibility !== "public") {
      return reply.code(404).send({ error: "not found" });
    }
    const orgId = org.id;
    const page = org.publicPage;

    const [donors, projects, events, members, social, publications, logoUrl] = await Promise.all([
      getEnrichedCatalog(slug, orgId, isPublicSection(page, "donors"), donorsCollection(orgId)),
      getEnrichedCatalog(slug, orgId, isPublicSection(page, "projects"), projectsCollection(orgId)),
      getEnrichedCatalog(slug, orgId, isPublicSection(page, "events"), eventsCollection(orgId)),
      getEnrichedMembers(slug, orgId, isPublicSection(page, "members")),
      getEnrichedCatalog(slug, orgId, isPublicSection(page, "social"), socialLinksCollection(orgId)),
      getPublicPublications(slug, orgId, isPublicSection(page, "publications")),
      resolveOrgAssetUrl(slug, orgId, page?.logoAssetId),
    ]);

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
        name: org.name,
        slug: org.slug,
        publicPage,
        logoUrl,
      },
      donors,
      projects,
      events,
      members,
      social,
      publications,
    };
  });

  // ── 2. Granular Modular Public Endpoints ──────────────────────────────
  app.get("/public/o/:slug/projects", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const org = await resolveOrgBySlug(slug.toLowerCase());
    if (!org || org.publicPage?.visibility !== "public") {
      return reply.code(404).send({ error: "not found" });
    }
    const projects = await getEnrichedCatalog(
      slug,
      org.id,
      isPublicSection(org.publicPage, "projects"),
      projectsCollection(org.id)
    );
    return { projects };
  });

  app.get("/public/o/:slug/donors", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const org = await resolveOrgBySlug(slug.toLowerCase());
    if (!org || org.publicPage?.visibility !== "public") {
      return reply.code(404).send({ error: "not found" });
    }
    const donors = await getEnrichedCatalog(
      slug,
      org.id,
      isPublicSection(org.publicPage, "donors"),
      donorsCollection(org.id)
    );
    return { donors };
  });

  app.get("/public/o/:slug/events", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const org = await resolveOrgBySlug(slug.toLowerCase());
    if (!org || org.publicPage?.visibility !== "public") {
      return reply.code(404).send({ error: "not found" });
    }
    const events = await getEnrichedCatalog(
      slug,
      org.id,
      isPublicSection(org.publicPage, "events"),
      eventsCollection(org.id)
    );
    return { events };
  });

  app.get("/public/o/:slug/members", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const org = await resolveOrgBySlug(slug.toLowerCase());
    if (!org || org.publicPage?.visibility !== "public") {
      return reply.code(404).send({ error: "not found" });
    }
    const members = await getEnrichedMembers(
      slug,
      org.id,
      isPublicSection(org.publicPage, "members")
    );
    return { members };
  });

  app.get("/public/o/:slug/social", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const org = await resolveOrgBySlug(slug.toLowerCase());
    if (!org || org.publicPage?.visibility !== "public") {
      return reply.code(404).send({ error: "not found" });
    }
    const social = await getEnrichedCatalog(
      slug,
      org.id,
      isPublicSection(org.publicPage, "social"),
      socialLinksCollection(org.id)
    );
    return { social };
  });

  /**
   * List public publications only.
   * Unlisted publications (which require knowing the unguessable key) and private notebooks are excluded.
   */
  app.get("/public/o/:slug/publications", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const org = await resolveOrgBySlug(slug.toLowerCase());
    if (!org || org.publicPage?.visibility !== "public") {
      return reply.code(404).send({ error: "not found" });
    }
    const publications = await getPublicPublications(
      slug,
      org.id,
      isPublicSection(org.publicPage, "publications")
    );
    return { publications };
  });

  // ── 3. Public Asset Streaming (Decoupled from GCS) ─────────────────────
  app.get("/public/o/:slug/assets/:assetId", async (request, reply) => {
    const { slug, assetId } = request.params as { slug: string; assetId: string };
    const org = await resolveOrgBySlug(slug.toLowerCase());
    if (!org) return reply.code(404).send({ error: "not found" });

    const assetSnap = await store().get(orgAssetPath(org.id, assetId));
    if (!assetSnap) return reply.code(404).send({ error: "asset not found" });
    const asset = assetSnap as AssetMetadata;

    const bytes = await storage.getObject(asset.gcsPath);
    if (!bytes) return reply.code(404).send({ error: "asset file not found" });

    return reply
      .header("Content-Type", asset.contentType || "application/octet-stream")
      .header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800")
      .header("Content-Length", String(bytes.byteLength))
      .send(bytes);
  });

  // ── 4. Individual Publication (Public or Unlisted) ──────────────────────
  app.get("/public/o/:slug/publications/:key", async (request, reply) => {
    const { slug, key } = request.params as { slug: string; key: string };
    const org = await resolveOrgBySlug(slug.toLowerCase());
    if (!org) return reply.code(404).send({ error: "not found" });
    const resolvedLink = await resolvePublicShareLink(org.id, key);
    if (!resolvedLink) return reply.code(404).send({ error: "not found" });
    const { notebookId, link } = resolvedLink;
    const nbSnap = await store().get(notebookPath(org.id, notebookId));
    if (!nbSnap) return reply.code(404).send({ error: "not found" });
    const { id: _nbId, ...nbRest } = nbSnap;
    const nb = { id: notebookId, ...(nbRest as NotebookSummary) };

    const resolved = await resolveExportPdfKey(org.id, notebookId, link.exportId, storage);
    let url: string | undefined;
    if (resolved) {
      url = `/public/o/${slug}/publications/${link.key}/pdf`;
    }

    const visibility = link.visibility || "unlisted";

    return {
      org: { name: org.name, slug: org.slug },
      notebook: {
        title: nb.title || nb.name,
        subtitle: nb.subtitle,
      },
      publication: {
        name: link.name,
        visibility,
      },
      url,
      noindex: visibility === "unlisted",
    };
  });

  /**
   * Public Publication PDF stream. Streams PDF bytes through Core.
   * Pass `?json=1` for `{ url }` (signed/storage URL) when a caller explicitly wants a redirect target.
   */
  app.get("/public/o/:slug/publications/:key/pdf", async (request, reply) => {
    const { slug, key } = request.params as { slug: string; key: string };
    const wantJson =
      (request.query as { json?: string }).json === "1" ||
      (request.query as { json?: string }).json === "true";
    const org = await resolveOrgBySlug(slug.toLowerCase());
    if (!org) return reply.code(404).send({ error: "not found" });
    const resolvedLink = await resolvePublicShareLink(org.id, key);
    if (!resolvedLink) return reply.code(404).send({ error: "not found" });
    const { notebookId, link } = resolvedLink;
    const nbSnap = await store().get(notebookPath(org.id, notebookId));
    if (!nbSnap) return reply.code(404).send({ error: "not found" });
    const nb = nbSnap as NotebookSummary;
    const resolved = await resolveExportPdfKey(org.id, notebookId, link.exportId, storage);
    if (!resolved) return reply.code(404).send({ error: "no compiled pdf" });

    if (wantJson) {
      const signedUrl = await storage.getSignedUrl(resolved.key, "read");
      return { url: signedUrl };
    }

    const bytes = await storage.getObject(resolved.key);
    if (!bytes) return reply.code(404).send({ error: "no compiled pdf" });
    const filename = `${(nb.title || nb.name || "notebook").replace(/[^\w.-]+/g, "_")}.pdf`;
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `inline; filename="${filename}"`)
      .header("Cache-Control", "public, max-age=60")
      .header("Content-Length", String(bytes.byteLength))
      .send(bytes);
  });
}
