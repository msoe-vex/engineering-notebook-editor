import {
  fetchAssetRef,
  fetchStorageObject,
  type CompileSnapshot,
  type CompileSnapshotMeta,
} from "./coreClient.js";

const DEFAULT_CONCURRENCY = Number(process.env.COMPILE_FETCH_CONCURRENCY || 8);

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

function collectAssetIdsFromTipTap(node: unknown, out: Set<string>) {
  if (!node || typeof node !== "object") return;
  const n = node as {
    type?: string;
    attrs?: { filePath?: string; id?: string };
    content?: unknown[];
  };
  if (n.type === "image") {
    const fp = String(n.attrs?.filePath || "");
    const id = String(n.attrs?.id || "");
    if (fp.startsWith("cloud:")) out.add(fp.slice("cloud:".length));
    else if (/^[0-9a-f-]{36}$/i.test(id)) out.add(id);
    else if (fp.includes("/assets/")) {
      const bare = fp.split("/assets/").pop()?.replace(/\.(jpe?g|png|gif|webp|pdf)$/i, "");
      if (bare) out.add(bare);
    }
  }
  for (const child of n.content || []) collectAssetIdsFromTipTap(child, out);
}

/**
 * Pull TipTap JSON + asset bytes from Core (metadata snapshot has paths only).
 */
export async function hydrateCompileSnapshot(
  meta: CompileSnapshotMeta,
  opts?: { onProgress?: (message: string, progress: number) => void }
): Promise<CompileSnapshot> {
  const { orgId, notebookId } = meta;
  const entryIds = Object.keys(meta.entries);
  opts?.onProgress?.(`Downloading ${entryIds.length} entries…`, 20);

  const tipTapByEntry: Record<string, unknown> = {};
  await mapPool(entryIds, DEFAULT_CONCURRENCY, async (entryId) => {
    const key = meta.entries[entryId].tipTapGcsPath;
    const buf = await fetchStorageObject(orgId, notebookId, key);
    if (!buf) {
      tipTapByEntry[entryId] = { type: "doc", content: [] };
      return;
    }
    try {
      tipTapByEntry[entryId] = JSON.parse(buf.toString("utf8"));
    } catch {
      tipTapByEntry[entryId] = { type: "doc", content: [] };
    }
  });

  const needed = new Set<string>(Object.keys(meta.assets || {}));
  if (meta.notebook.logoAssetId) needed.add(meta.notebook.logoAssetId);
  for (const m of meta.members) {
    if (m.imageAssetId) needed.add(m.imageAssetId);
  }
  for (const e of Object.values(meta.entries)) {
    for (const aid of e.assetIds || []) needed.add(aid);
  }
  for (const tipTap of Object.values(tipTapByEntry)) {
    collectAssetIdsFromTipTap(tipTap, needed);
  }

  const assetMeta = { ...(meta.assets || {}) };
  const missing = [...needed].filter((id) => !assetMeta[id]);
  if (missing.length) {
    opts?.onProgress?.(`Resolving ${missing.length} asset refs…`, 28);
    await mapPool(missing, DEFAULT_CONCURRENCY, async (assetId) => {
      try {
        assetMeta[assetId] = await fetchAssetRef(orgId, notebookId, assetId);
      } catch {
        /* skip */
      }
    });
  }

  const assetIds = [...needed].filter((id) => assetMeta[id]);
  opts?.onProgress?.(`Downloading ${assetIds.length} assets…`, 32);

  const assets: CompileSnapshot["assets"] = {};
  await mapPool(assetIds, DEFAULT_CONCURRENCY, async (assetId) => {
    const ref = assetMeta[assetId];
    if (!ref) return;
    try {
      const bytes = await fetchStorageObject(orgId, notebookId, ref.gcsPath);
      if (!bytes) return;
      assets[assetId] = { contentType: ref.contentType || "image/jpeg", bytes };
    } catch (err) {
      console.warn(`[compile] skip asset ${assetId}:`, err);
    }
  });

  const entries: CompileSnapshot["entries"] = {};
  for (const [id, e] of Object.entries(meta.entries)) {
    const { tipTapGcsPath: _path, ...rest } = e;
    void _path;
    entries[id] = {
      ...rest,
      tipTap: tipTapByEntry[id] ?? { type: "doc", content: [] },
    };
  }

  return {
    orgId,
    notebookId,
    notebook: meta.notebook,
    members: meta.members,
    entries,
    assets,
  };
}
