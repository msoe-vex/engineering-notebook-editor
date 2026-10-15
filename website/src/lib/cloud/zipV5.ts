import JSZip from "jszip";
import {
  NOTEBOOK_SCHEMA_VERSION,
  buildExportV5,
  normalizeImportNotebook,
  type EntryMetadataV5,
  type NotebookSummaryV5,
} from "@engineering-notebook/shared";

export async function exportNotebookZipV5(args: {
  summary: NotebookSummaryV5;
  entries: Record<string, EntryMetadataV5>;
  tipTapByEntryId: Record<string, unknown>;
  assets?: Record<string, Uint8Array>;
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
      },
      null,
      2
    )
  );
  const entriesFolder = zip.folder("entries");
  for (const [id, doc] of Object.entries(args.tipTapByEntryId)) {
    entriesFolder?.file(`${id}.json`, JSON.stringify(doc, null, 2));
  }
  if (args.assets) {
    const assetsFolder = zip.folder("assets");
    for (const [assetId, bytes] of Object.entries(args.assets)) {
      assetsFolder?.folder(assetId)?.file("compressed", bytes);
    }
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

  return { summary, entries, tipTapByEntryId, members };
}
