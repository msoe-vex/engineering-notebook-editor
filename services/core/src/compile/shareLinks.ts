import { randomUUID } from "node:crypto";
import {
  notebookPath,
  notebookShareLinkPath,
  notebookShareLinksCollection,
  publicNotebookKeyPath,
  type NotebookShareLink,
  type NotebookSummary,
} from "@engineering-notebook/shared";
import { getMetadataStore } from "../db/metadataStore.js";
import { omitUndefined } from "../db/sanitize.js";

function nowIso() {
  return new Date().toISOString();
}

function withoutId<T extends Record<string, unknown>>(row: T & { id?: string }): T {
  const { id: _id, ...rest } = row;
  void _id;
  return rest as T;
}

export function normalizeShareKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function listShareLinks(
  orgId: string,
  notebookId: string,
  opts?: { includeRevoked?: boolean }
): Promise<NotebookShareLink[]> {
  const store = getMetadataStore();
  await maybeMigrateLegacyShareLink(orgId, notebookId);
  const rows = await store.query(notebookShareLinksCollection(orgId, notebookId));
  const links = rows
    .map((d) => {
      const { id, ...rest } = d;
      return { id: String(id), ...(rest as Omit<NotebookShareLink, "id">) } as NotebookShareLink;
    })
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  if (opts?.includeRevoked) return links;
  return links.filter((l) => !l.revokedAt);
}

/**
 * One-time: lift notebook.publicKey + publicExportId into an explicit share link.
 */
export async function maybeMigrateLegacyShareLink(
  orgId: string,
  notebookId: string
): Promise<void> {
  const store = getMetadataStore();
  const existing = await store.query(notebookShareLinksCollection(orgId, notebookId));
  if (existing.length > 0) return;

  const nbSnap = await store.get(notebookPath(orgId, notebookId));
  if (!nbSnap) return;
  const nb = withoutId(nbSnap as Record<string, unknown> & { id?: string }) as NotebookSummary;
  const key = nb.publicKey ? normalizeShareKey(nb.publicKey) : "";
  const access = nb.publicAccess;
  if (!key || (access !== "unlisted" && access !== "public")) return;

  const exportId = nb.publicExportId || nb.latestExportId;
  if (!exportId) return;

  const linkId = randomUUID();
  const ts = nowIso();
  const link: NotebookShareLink = {
    id: linkId,
    key,
    name: "Share",
    exportId,
    createdAt: nb.publishedAt || ts,
    createdBy: nb.publishedBy,
    updatedAt: ts,
  };
  await store.set(
    notebookShareLinkPath(orgId, notebookId, linkId),
    omitUndefined({ ...link }) as Record<string, unknown>
  );
  await store.set(publicNotebookKeyPath(orgId, key), {
    notebookId,
    linkId,
    updatedAt: ts,
  } as Record<string, unknown>);
}

export async function createShareLink(opts: {
  orgId: string;
  notebookId: string;
  name: string;
  exportId: string;
  visibility?: "unlisted" | "public";
  createdBy?: string;
}): Promise<NotebookShareLink> {
  const store = getMetadataStore();
  await maybeMigrateLegacyShareLink(opts.orgId, opts.notebookId);

  const name = opts.name.trim() || "Share link";
  const exportId = opts.exportId.trim();
  if (!exportId || exportId === "latest") {
    throw Object.assign(new Error("exportId required"), { statusCode: 400 });
  }

  const visibility = opts.visibility === "public" ? "public" : "unlisted";
  const key = randomUUID();
  const linkId = randomUUID();
  const ts = nowIso();
  const link: NotebookShareLink = omitUndefined({
    id: linkId,
    key,
    name,
    exportId,
    visibility,
    createdAt: ts,
    createdBy: opts.createdBy,
    updatedAt: ts,
  }) as NotebookShareLink;

  await store.set(
    notebookShareLinkPath(opts.orgId, opts.notebookId, linkId),
    omitUndefined({ ...link }) as Record<string, unknown>
  );
  await store.set(publicNotebookKeyPath(opts.orgId, key), {
    notebookId: opts.notebookId,
    linkId,
    visibility,
    updatedAt: ts,
  } as Record<string, unknown>);

  // Keep legacy notebook fields roughly in sync for older clients.
  await store.update(notebookPath(opts.orgId, opts.notebookId), {
    publicAccess: visibility,
    publicKey: key,
    publicExportId: exportId,
    publishedAt: ts,
    publishedBy: opts.createdBy || null,
    updatedAt: ts,
  });

  return link;
}

export async function updateShareLink(opts: {
  orgId: string;
  notebookId: string;
  linkId: string;
  name?: string;
  exportId?: string;
  visibility?: "unlisted" | "public";
}): Promise<NotebookShareLink> {
  const store = getMetadataStore();
  const path = notebookShareLinkPath(opts.orgId, opts.notebookId, opts.linkId);
  const snap = await store.get(path);
  if (!snap) {
    throw Object.assign(new Error("share link not found"), { statusCode: 404 });
  }
  const existing = {
    id: opts.linkId,
    ...(withoutId(snap as Record<string, unknown> & { id?: string }) as Omit<
      NotebookShareLink,
      "id"
    >),
  } as NotebookShareLink;
  if (existing.revokedAt) {
    throw Object.assign(new Error("share link revoked"), { statusCode: 410 });
  }

  const ts = nowIso();
  const patch: Record<string, unknown> = { updatedAt: ts };
  if (opts.name !== undefined) {
    const name = opts.name.trim();
    if (!name) throw Object.assign(new Error("name required"), { statusCode: 400 });
    patch.name = name;
  }
  if (opts.exportId !== undefined) {
    const exportId = opts.exportId.trim();
    if (!exportId || exportId === "latest") {
      throw Object.assign(new Error("exportId required"), { statusCode: 400 });
    }
    patch.exportId = exportId;
  }
  if (opts.visibility !== undefined) {
    patch.visibility = opts.visibility === "public" ? "public" : "unlisted";
    await store.update(publicNotebookKeyPath(opts.orgId, existing.key), {
      visibility: patch.visibility,
      updatedAt: ts,
    });
  }

  await store.update(path, omitUndefined(patch));
  const merged = { ...existing, ...patch } as NotebookShareLink;

  const nbSnap = await store.get(notebookPath(opts.orgId, opts.notebookId));
  if (nbSnap && (nbSnap as NotebookSummary).publicKey === existing.key) {
    await store.update(notebookPath(opts.orgId, opts.notebookId), {
      publicExportId: merged.exportId,
      updatedAt: ts,
    });
  }

  return merged;
}

export async function revokeShareLink(opts: {
  orgId: string;
  notebookId: string;
  linkId: string;
}): Promise<NotebookShareLink> {
  const store = getMetadataStore();
  const path = notebookShareLinkPath(opts.orgId, opts.notebookId, opts.linkId);
  const snap = await store.get(path);
  if (!snap) {
    throw Object.assign(new Error("share link not found"), { statusCode: 404 });
  }
  const existing = {
    id: opts.linkId,
    ...(withoutId(snap as Record<string, unknown> & { id?: string }) as Omit<
      NotebookShareLink,
      "id"
    >),
  } as NotebookShareLink;

  const ts = nowIso();
  await store.update(path, { revokedAt: ts, updatedAt: ts });
  try {
    await store.delete(publicNotebookKeyPath(opts.orgId, existing.key));
  } catch {
    /* ok */
  }

  const nbPath = notebookPath(opts.orgId, opts.notebookId);
  const nbSnap = await store.get(nbPath);
  if (nbSnap && (nbSnap as NotebookSummary).publicKey === existing.key) {
    const remaining = (await listShareLinks(opts.orgId, opts.notebookId)).filter(
      (l) => l.id !== opts.linkId
    );
    const next = remaining[0];
    if (next) {
      await store.update(nbPath, {
        publicKey: next.key,
        publicExportId: next.exportId,
        publicAccess: "unlisted",
        updatedAt: ts,
      });
    } else {
      await store.update(nbPath, {
        publicKey: null,
        publicExportId: null,
        publicAccess: "off",
        publishedAt: null,
        publishedBy: null,
        updatedAt: ts,
      });
    }
  }

  return { ...existing, revokedAt: ts, updatedAt: ts };
}

/** Resolve an active share link from a public URL key. */
export async function resolvePublicShareLink(
  orgId: string,
  publicKey: string
): Promise<{ notebookId: string; link: NotebookShareLink } | null> {
  const store = getMetadataStore();
  const key = normalizeShareKey(publicKey);
  if (!key) return null;
  const keySnap = await store.get(publicNotebookKeyPath(orgId, key));
  if (!keySnap) return null;
  const notebookId = keySnap.notebookId as string | undefined;
  if (!notebookId) return null;

  let linkId = keySnap.linkId as string | undefined;
  if (!linkId) {
    await maybeMigrateLegacyShareLink(orgId, notebookId);
    const again = await store.get(publicNotebookKeyPath(orgId, key));
    linkId = again?.linkId as string | undefined;
  }
  if (!linkId) {
    // Legacy: key on notebook without shareLinks row after failed migrate.
    const nbSnap = await store.get(notebookPath(orgId, notebookId));
    const nb = nbSnap as NotebookSummary | null;
    if (!nb || nb.publicKey !== key) return null;
    if (nb.publicAccess !== "unlisted" && nb.publicAccess !== "public") return null;
    const exportId = nb.publicExportId || nb.latestExportId;
    if (!exportId) return null;
    return {
      notebookId,
      link: {
        id: "legacy",
        key,
        name: "Share",
        exportId,
        createdAt: nb.publishedAt || nowIso(),
        createdBy: nb.publishedBy,
      },
    };
  }

  const linkSnap = await store.get(notebookShareLinkPath(orgId, notebookId, linkId));
  if (!linkSnap) return null;
  const link = {
    id: linkId,
    ...(withoutId(linkSnap as Record<string, unknown> & { id?: string }) as Omit<
      NotebookShareLink,
      "id"
    >),
  } as NotebookShareLink;
  if (link.revokedAt) return null;
  if (normalizeShareKey(link.key) !== key) return null;
  return { notebookId, link };
}

/** After deleting a compile export, retarget or revoke links that pointed at it. */
export async function retargetShareLinksAfterExportDelete(opts: {
  orgId: string;
  notebookId: string;
  deletedExportId: string;
  nextExportId: string | null;
}): Promise<void> {
  const store = getMetadataStore();
  const rows = await store.query(notebookShareLinksCollection(opts.orgId, opts.notebookId));
  const ts = nowIso();
  for (const row of rows) {
    const linkId = String(row.id);
    const link = withoutId(row as Record<string, unknown> & { id?: string }) as NotebookShareLink;
    if (link.revokedAt) continue;
    if (link.exportId !== opts.deletedExportId) continue;
    if (opts.nextExportId) {
      await store.update(notebookShareLinkPath(opts.orgId, opts.notebookId, linkId), {
        exportId: opts.nextExportId,
        updatedAt: ts,
      });
    } else {
      await revokeShareLink({
        orgId: opts.orgId,
        notebookId: opts.notebookId,
        linkId,
      });
    }
  }
}
