import JSZip from "jszip";
import {
  NOTEBOOK_SCHEMA_VERSION,
  buildExportV5,
  normalizeImportNotebook,
  type EntryMetadataV5,
  type NotebookSummaryV5,
} from "@engineering-notebook/shared";

export type ZipAssetBlob = {
  bytes: Uint8Array;
  contentType?: string;
};

export async function exportNotebookZipV5(args: {
  summary: NotebookSummaryV5;
  entries: Record<string, EntryMetadataV5>;
  tipTapByEntryId: Record<string, unknown>;
  assets?: Record<string, ZipAssetBlob | Uint8Array>;
  members?: Parameters<typeof buildExportV5>[2];
}): Promise<Blob> {
  const zip = new JSZip();
  const exportMeta = buildExportV5(args.summary, args.entries, args.members);
  zip.file("notebook.v5.json", JSON.stringify(exportMeta, null, 2));
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        schemaVersion: NOTEBOOK_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        entryCount: Object.keys(args.entries).length,
        assetCount: args.assets ? Object.keys(args.assets).length : 0,
      },
      null,
      2
    )
  );
  const entriesFolder = zip.folder("entries");
  for (const [id, doc] of Object.entries(args.tipTapByEntryId)) {
    entriesFolder?.file(`${id}.json`, JSON.stringify(doc, null, 2));
  }
  if (args.assets && Object.keys(args.assets).length) {
    const assetsFolder = zip.folder("assets");
    const index: Record<string, { contentType?: string; byteSize: number }> = {};
    for (const [assetId, raw] of Object.entries(args.assets)) {
      const blob: ZipAssetBlob = raw instanceof Uint8Array ? { bytes: raw } : raw;
      assetsFolder?.folder(assetId)?.file("compressed", blob.bytes);
      index[assetId] = {
        contentType: blob.contentType,
        byteSize: blob.bytes.byteLength,
      };
    }
    assetsFolder?.file("index.json", JSON.stringify(index, null, 2));
  }
  return zip.generateAsync({ type: "blob" });
}

export async function importNotebookZip(
  file: ArrayBuffer,
  orgId: string,
  fallbackName: string
): Promise<{
  summary: NotebookSummaryV5;
  entries: Record<string, EntryMetadataV5>;
  tipTapByEntryId: Record<string, unknown>;
  members: Record<
    string,
    { name: string; role: string; order: number; imageAssetId?: string; linkedUid?: string }
  >;
  assets: Record<string, ZipAssetBlob>;
}> {
  const zip = await JSZip.loadAsync(file);
  const indexFile =
    zip.file("notebook.v5.json") || zip.file("notebook.json") || zip.file("data/notebook.json");
  if (!indexFile) throw new Error("ZIP missing notebook.v5.json / notebook.json");
  const raw = JSON.parse(await indexFile.async("string")) as Record<string, unknown>;
  const { summary, entries, members } = normalizeImportNotebook(raw, orgId, fallbackName);

  const tipTapByEntryId: Record<string, unknown> = {};
  const entryFiles = Object.keys(zip.files).filter(
    (p) =>
      (p.startsWith("entries/") || p.startsWith("data/entries/")) &&
      p.endsWith(".json") &&
      !p.endsWith("/")
  );
  for (const path of entryFiles) {
    const id = path.split("/").pop()!.replace(/\.json$/, "");
    const parsed = JSON.parse(await zip.file(path)!.async("string")) as {
      content?: unknown;
      type?: string;
    };
    tipTapByEntryId[id] = parsed.content ?? parsed;
  }

  const assets: Record<string, ZipAssetBlob> = {};
  let assetIndex: Record<string, { contentType?: string }> = {};
  const indexPath = zip.file("assets/index.json");
  if (indexPath) {
    try {
      assetIndex = JSON.parse(await indexPath.async("string")) as typeof assetIndex;
    } catch {
      assetIndex = {};
    }
  }

  const assetFiles = Object.keys(zip.files).filter(
    (p) =>
      (p.startsWith("assets/") || p.startsWith("data/assets/")) &&
      !p.endsWith("/") &&
      !p.endsWith("index.json")
  );
  for (const path of assetFiles) {
    // assets/{assetId}/compressed  OR  assets/{assetId}/original  OR legacy flat
    const parts = path.split("/").filter(Boolean);
    const assetsIdx = parts[0] === "data" ? 1 : 0;
    if (parts[assetsIdx] !== "assets") continue;
    const assetId = parts[assetsIdx + 1];
    if (!assetId) continue;
    const variant = parts[assetsIdx + 2] || "compressed";
    // Prefer compressed; skip if we already have compressed and this is original
    if (assets[assetId] && variant !== "compressed") continue;
    const bytes = await zip.file(path)!.async("uint8array");
    assets[assetId] = {
      bytes,
      contentType: assetIndex[assetId]?.contentType || guessContentType(path, bytes),
    };
  }

  return { summary, entries, tipTapByEntryId, members, assets };
}

function guessContentType(path: string, bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return "image/gif";
  }
  if (bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}
