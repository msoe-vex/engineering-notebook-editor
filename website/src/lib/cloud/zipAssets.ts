import type { TipTapNode } from "@/lib/notebook/metadata";

/** Collect cloud asset ids from TipTap image attrs (`cloud:{id}` or attrs.id). */
export function collectAssetIdsFromTipTap(doc: unknown, into: Set<string> = new Set()): Set<string> {
  const walk = (node: TipTapNode | undefined) => {
    if (!node) return;
    if (node.type === "image") {
      const fp = String(node.attrs?.filePath || "");
      const id = String(node.attrs?.id || "");
      if (fp.startsWith("cloud:")) into.add(fp.slice("cloud:".length));
      else if (id && !fp.includes("/")) into.add(id);
    }
    for (const child of node.content || []) walk(child);
  };
  walk(doc as TipTapNode);
  return into;
}

/** Remap image asset ids inside TipTap JSON (cloud: keys + attrs.id). */
export function remapTipTapAssetIds(doc: unknown, idMap: Map<string, string>): unknown {
  const walk = (node: TipTapNode): TipTapNode => {
    if (node.type === "image") {
      const attrs = { ...(node.attrs || {}) };
      const fp = String(attrs.filePath || "");
      const id = String(attrs.id || "");
      if (fp.startsWith("cloud:")) {
        const oldId = fp.slice("cloud:".length);
        const next = idMap.get(oldId);
        if (next) {
          attrs.filePath = `cloud:${next}`;
          attrs.originalFilePath = `cloud:${next}`;
          attrs.id = next;
        }
      } else if (id && idMap.has(id)) {
        const next = idMap.get(id)!;
        attrs.id = next;
        if (typeof attrs.filePath === "string" && attrs.filePath.includes(id)) {
          attrs.filePath = attrs.filePath.replace(id, next);
        }
        if (typeof attrs.originalFilePath === "string" && attrs.originalFilePath.includes(id)) {
          attrs.originalFilePath = (attrs.originalFilePath as string).replace(id, next);
        }
      }
      return { ...node, attrs };
    }
    return {
      ...node,
      content: node.content?.map(walk),
    };
  };
  if (!doc || typeof doc !== "object") return doc;
  return walk(doc as TipTapNode);
}

export function remapIdList(ids: string[] | undefined, idMap: Map<string, string>): string[] | undefined {
  if (!ids?.length) return ids;
  return ids.map((id) => idMap.get(id) ?? id);
}
