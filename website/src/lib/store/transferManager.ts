import { INDEX_PATH, ENTRIES_DIR, ASSETS_DIR, LATEX_DIR, TEAM_PATH, PHASES_PATH, ENTRIES_INDEX_PATH } from "../constants";
import { events, EventNames } from "../events";
import { getPending } from "../storage/db";
import { isBinaryFile, zipCompressionOptions, addTextFileToZip, addAssetFileToZip } from "../storage/transferUtils";
import { getLocalFileContent } from "../storage/fs";
import { fetchFileContent, fetchRawFileContent } from "../github/github";
import { generateUUID, getMimeTypeFromExtension, normalizeBase64 } from "../utils";
import { EntryMetadata, normalizeNotebookMetadata, serializeNotebookMetadata, EMPTY_METADATA, TeamMetadata, ProjectPhase, remapContentIds, remapEntryMetadataIds, TipTapNode, ensureResourceIds, extractResources, buildResourceTypeIndex, extractImagePaths, NotebookMetadata, collectNotebookResourceIds, uniqueResourceId } from "../notebook/metadata";
import { generateEntryLatex, latexPhaseRef } from "../latex/latex";
import { IWorkspaceStore, ImportOptions, EntryImportMode } from "./types";
import type JSZipType from 'jszip';

export class TransferManager {
  private store: IWorkspaceStore;

  constructor(store: IWorkspaceStore) {
    this.store = store;
  }

  async getFileContent(path: string): Promise<string | null> {
    if (this.store.lastSavedContents.has(path)) {
      return this.store.lastSavedContents.get(path)!;
    }

    const dbName = this.store.getDBName();
    // If there's a pending delete for this path, treat as removed for exports
    const staged = await getPending(dbName, path);
    if (staged?.operation === 'delete') return null;
    if (staged?.operation === 'upsert' && staged.content) return staged.content;

    try {
      if (this.store.mode === "local" && this.store.dirHandle) {
        const res = await getLocalFileContent(this.store.dirHandle, path);
        return res.text || null;
      } else if (this.store.mode === "github" && this.store.config) {
        return await fetchFileContent(this.store.config, this.store.getFullPath(path));
      } else if (this.store.mode === "temporary") {
        return null;
      }
    } catch (e) {
      console.error(`Failed to get content for ${path}:`, e);
    }
    return null;
  }

  async getBaseFileContent(path: string): Promise<string | null> {
    try {
      if (this.store.mode === "local" && this.store.dirHandle) {
        const res = await getLocalFileContent(this.store.dirHandle, path);
        return res.text || null;
      } else if (this.store.mode === "github" && this.store.config) {
        return await fetchFileContent(this.store.config, this.store.getFullPath(path));
      } else if (this.store.mode === "temporary") {
        return null;
      }
    } catch (e) {
      console.error(`Failed to get base content for ${path}:`, e);
    }
    return null;
  }

  async getAssetBase64(path: string): Promise<string | null> {
    const dbName = this.store.getDBName();
    // If there's a pending delete for this path, treat as removed for exports
    const pending = await getPending(dbName, path);
    if (pending?.operation === 'delete') return null;

    if (this.store.mode === "github" || this.store.mode === "temporary") {
      if (pending?.operation === "upsert" && pending.content) {
        const c = pending.content;
        if (typeof c === 'string') {
          return normalizeBase64(c);
        }
        return null;
      }
    }

    // 1. Check in-memory session cache (0ms)
    if (this.store.assetCache.has(path)) {
      const cached = this.store.assetCache.get(path);
      if (cached) return normalizeBase64(cached);
    }

    // 2. Fetch from filesystem or GitHub
    try {
      if (this.store.mode === "local" && this.store.dirHandle) {
        const res = await getLocalFileContent(this.store.dirHandle, path);
        const norm = normalizeBase64(res.base64 as string | null | undefined);
        if (norm) {
          const dataUrl = `data:${getMimeTypeFromExtension(path)};base64,${norm}`;
          this.store.assetCache.set(path, dataUrl);
          return norm;
        }
      } else if (this.store.mode === "github" && this.store.config) {
        const remote = await fetchRawFileContent(this.store.config, this.store.getFullPath(path));
        const norm = normalizeBase64(remote as string | null | undefined);
        if (norm) {
          const dataUrl = `data:${getMimeTypeFromExtension(path)};base64,${norm}`;
          this.store.assetCache.set(path, dataUrl);
          return norm;
        }
      }
    } catch (e: unknown) {
      console.warn(`Failed to get asset base64 for ${path}:`, e);
    }
    return null;
  }

  async exportEntries(entryIds?: string[], mode: 'data-only' | 'full' = 'data-only') {
    this.store.setLoading(true, "Exporting data...");
    try {
      const JSZipModule = await import("jszip");
      const JSZip = JSZipModule.default as unknown as { new(): JSZipType };
      const zip: JSZipType = new JSZip();
      
      const isSubset = !!entryIds;
      const exportMode = isSubset ? 'data-only' : mode;
      const targets = entryIds || Object.keys(this.store.metadata.entries);
      const assetPaths = new Set<string>();

      const addAssetPath = (assetPath?: string) => {
        if (assetPath && !assetPath.startsWith("data:")) {
          assetPaths.add(assetPath);
        }
      };

      const addTextFile = async (path: string) => addTextFileToZip(zip, (p: string) => this.getFileContent(p), path);
      const addAssetFile = async (path: string) => addAssetFileToZip(zip, (p: string) => this.getAssetBase64(p), path);

      // 1. Data Mode files
      if (!isSubset) {
        zip.file(INDEX_PATH, serializeNotebookMetadata(this.store.metadata));
      } else {
        const filteredEntries: Record<string, EntryMetadata> = {};
        for (const id of targets) {
          const meta = this.store.metadata.entries[id];
          if (meta) filteredEntries[id] = meta;
        }
        zip.file(INDEX_PATH, JSON.stringify({
          version: this.store.metadata.version,
          entries: filteredEntries,
        }, null, 2));
      }

      // Add entries json
      for (const id of targets) {
        const meta = this.store.metadata.entries[id];
        if (!meta) continue;

        const contentStr = await this.getFileContent(meta.filename);
        if (!contentStr) continue;

        zip.file(meta.filename, contentStr);

        let content: TipTapNode;
        try {
          const parsed = JSON.parse(contentStr);
          content = parsed.content || parsed;
        } catch (e) {
          console.error(`Failed to parse content for ${id}`, e);
          continue;
        }
        extractImagePaths(content).forEach(addAssetPath);
      }

      // Include team assets if exporting full notebook
      if (!isSubset && this.store.metadata.team) {
        addAssetPath(this.store.metadata.team.logo);
        addAssetPath(this.store.metadata.team.logoOriginal);
        Object.values(this.store.metadata.team.members || {}).forEach(member => {
          addAssetPath(member.image);
          addAssetPath(member.imageOriginal);
        });
      }

      // Bundle assets
      for (const assetPath of assetPaths) {
        try {
          await addAssetFile(assetPath);
        } catch (err) {
          console.warn(`[Export] Skipping asset due to error: ${assetPath}`, err);
        }
      }

      // 2. Full LaTeX Project Mode files
      if (exportMode === 'full') {
        await addTextFile("main.tex");
        await addTextFile("notebook.sty");

        try {
          const pdfBase64 = await this.getAssetBase64("main.pdf");
          if (pdfBase64) {
            zip.file("main.pdf", pdfBase64, { base64: true });
          }
        } catch (err) {
          console.warn("[Export] Skipping main.pdf due to error:", err);
        }

        // Global LaTeX documents
        await addTextFile(TEAM_PATH);
        await addTextFile(PHASES_PATH);
        await addTextFile(ENTRIES_INDEX_PATH);

        // Entry LaTeX documents
        for (const id of targets) {
          const latexPath = `${LATEX_DIR}/${id}.tex`;
          const latex = await this.getFileContent(latexPath);
          if (latex) zip.file(latexPath, latex);
        }

        // Bundle fonts
        const fontFiles = [
          'inter/Inter-Regular.otf', 'inter/Inter-Bold.otf', 'inter/Inter-Italic.otf', 'inter/Inter-BoldItalic.otf',
          'inconsolata/Inconsolata-Regular.otf', 'inconsolata/Inconsolata-Bold.otf'
        ];

        for (const font of fontFiles) {
          try {
            let base64 = await this.getAssetBase64(`fonts/${font}`);
            if (!base64) {
              const res = await fetch(`/notebook-template/fonts/${font}`);
              if (res.ok) {
                const buffer = await res.arrayBuffer();
                let binary = '';
                const bytes = new Uint8Array(buffer);
                for (let i = 0; i < bytes.byteLength; i++) {
                  binary += String.fromCharCode(bytes[i]);
                }
                base64 = btoa(binary);
              }
            }
            if (base64) {
              zip.file(`fonts/${font}`, base64, { base64: true });
            }
          } catch (err) {
            console.warn(`[Export] Skipping font ${font} due to error:`, err);
          }
        }
      }

      const blob = await zip.generateAsync(zipCompressionOptions);
      const { saveAs } = await import("file-saver");
      const name = entryIds
        ? (entryIds.length === 1
          ? (this.store.metadata.entries[entryIds[0]]?.title || "entry").replace(/[^a-z0-9]/gi, '_').toLowerCase()
          : "entries")
        : "notebook";
      saveAs(blob as Blob, `${name}.zip`);

    } catch (e) {
      console.error("Export failed", e);
      events.emit(EventNames.SHOW_NOTIFICATION, { message: "Export failed", type: "error" });
    } finally {
      this.store.setLoading(false);
    }
  }

  async exportNotebook(mode?: 'data-only' | 'full') {
    await this.exportEntries(undefined, mode);
  }

  async importNotebook(data: Record<string, unknown>, options?: ImportOptions) {
    this.store.setLoading(true, "Importing data...");
    try {
      const {
        entries = {},
        assets = {},
        files = {},
        latexFiles = {},
        pdf = ""
      } = data as {
        entries: Record<string, Record<string, unknown>>;
        assets: Record<string, unknown>;
        files?: Record<string, string>;
        latexFiles?: Record<string, string>;
        pdf?: string;
      };
      const entryImportMode: EntryImportMode = options?.entryImportMode || "replace";
      const idMap = new Map<string, string>();
      const entryIdList = Object.keys(entries);
      const effectiveEntryIdList = entryImportMode === "none" ? [] : entryIdList;

      if (this.store.mode === "temporary" && entryImportMode === "clear") {
        const { clearAllPending, clearAllResources } = await import("../storage/db");
        const dbName = this.store.getDBName();
        await clearAllPending(dbName);
        await clearAllResources(dbName);
        this.store.assetCache.clear();
        this.store.entries = [];
      }

      const usedIds = collectNotebookResourceIds(this.store.metadata.entries);

      if (entryImportMode === "keep") {
        for (const oldId of effectiveEntryIdList) {
          const newId = usedIds.has(oldId) ? uniqueResourceId(usedIds) : oldId;
          idMap.set(oldId, newId);
          usedIds.add(newId);
        }

        for (const oldId of effectiveEntryIdList) {
          const entryData = entries[oldId] as Record<string, unknown>;
          const resources = entryData.resources as Record<string, unknown> | undefined;
          if (!resources) continue;

          for (const resId of Object.keys(resources)) {
            if (idMap.has(resId)) continue;
            const newId = usedIds.has(resId) ? uniqueResourceId(usedIds) : resId;
            idMap.set(resId, newId);
            usedIds.add(newId);
          }
        }
      } else {
        for (const oldId of effectiveEntryIdList) {
          idMap.set(oldId, oldId);
          usedIds.add(oldId);
          const entryData = entries[oldId] as Record<string, unknown>;
          const resources = entryData.resources as Record<string, unknown> | undefined;
          if (resources) {
            for (const resId of Object.keys(resources)) {
              idMap.set(resId, resId);
              usedIds.add(resId);
            }
          }
        }
      }

      const assetList = Object.entries(assets as Record<string, string>);

      const remappedEntries: { id: string, doc: TipTapNode, meta: EntryMetadata }[] = [];
      const newEntriesMap: Record<string, EntryMetadata> = {};

      for (const oldId of effectiveEntryIdList) {
        const entryWithContent = entries[oldId] as Record<string, unknown> & { content?: TipTapNode };
        const { content, ...entryMetadata } = entryWithContent;
        const newId = idMap.get(oldId)!;

        const { doc: remappedDoc } = remapContentIds((content || {}) as TipTapNode, idMap, usedIds);
        const docWithIds = ensureResourceIds(remappedDoc as TipTapNode, usedIds) as TipTapNode;

        const remappedMeta = remapEntryMetadataIds(entryMetadata as unknown as EntryMetadata, idMap);
        remappedMeta.filename = `${ENTRIES_DIR}/${newId}.json`;

        if (!remappedMeta.date) {
          remappedMeta.date = "";
        }

        const discoveredResources = extractResources(docWithIds);
        const mergedResources: Record<string, { type: string; title: string; caption: string }> = {};
        const oldResources = remappedMeta.resources || {};
        for (const [resId, resInfo] of Object.entries(discoveredResources)) {
          mergedResources[resId] = {
            type: resInfo.type,
            title: resInfo.title || oldResources[resId]?.title || "",
            caption: resInfo.caption || oldResources[resId]?.caption || "",
          };
        }
        remappedMeta.resources = mergedResources;

        remappedEntries.push({ id: newId, doc: docWithIds, meta: remappedMeta });
        newEntriesMap[newId] = remappedMeta;
      }

      const mergedEntries = entryImportMode === "none"
        ? { ...this.store.metadata.entries }
        : entryImportMode === "clear"
          ? newEntriesMap
          : { ...this.store.metadata.entries, ...newEntriesMap };
      const globalResourceTypes = buildResourceTypeIndex(entryImportMode === "none"
        ? this.store.metadata.entries
        : entryImportMode === "clear"
          ? newEntriesMap
          : { ...this.store.metadata.entries, ...newEntriesMap });

      const importedPhases = data.phases as Record<string, ProjectPhase> | ProjectPhase[] | undefined;
      const importedTeam = data.team as TeamMetadata | undefined;
      const importedLastCompiled = pdf && typeof data.lastCompiled === "string"
        ? data.lastCompiled as string
        : undefined;

      this.store.metadata = normalizeNotebookMetadata({
        ...EMPTY_METADATA,
        ...this.store.metadata,
        entries: mergedEntries,
        ...(importedLastCompiled ? { lastCompiled: importedLastCompiled } : {}),
        ...(importedPhases && options?.overwritePhases ? { phases: importedPhases } : {}),
        ...(importedTeam && options?.overwriteTeam ? { team: importedTeam } : {}),
      });

      const extraFiles = { ...(latexFiles || {}), ...(files || {}) };

      await this.store.enqueue(async () => {
        // Write assets
        for (const [path, base64] of assetList) {
          const dataUrl = `data:${getMimeTypeFromExtension(path)};base64,${base64}`;
          this.store.assetCache.set(path, dataUrl);
          await this.store.persistFile(path, base64, `Import asset: ${path}`, true);
        }

        // Write entries JSON and entries LaTeX files (which are reconstructed for regular imported entries)
        for (const item of remappedEntries) {
          const { id, doc, meta } = item;
          const contentStr = JSON.stringify({ version: 3, content: doc }, null, 2);

          await this.store.persistFile(meta.filename, contentStr, `Import entry: ${meta.title}`);
          if (!meta.isTemplate) {
            const latex = generateEntryLatex(doc, meta.title, meta.authors, latexPhaseRef(meta.phase, this.store.metadata.phases), meta.createdAt, id, globalResourceTypes, meta.date);
            await this.store.persistFile(`${LATEX_DIR}/${id}.tex`, latex, `Import LaTeX: ${meta.title}`);
          }
        }

        // Only write custom project files if opted-in
        if (options?.importProjectFiles) {
          if (options.overwriteMainTex && files["main.tex"]) {
            await this.store.persistFile("main.tex", files["main.tex"], "Import main.tex");
          }
          if (options.overwriteStyles && files["notebook.sty"]) {
            await this.store.persistFile("notebook.sty", files["notebook.sty"], "Import notebook.sty");
          }

          // Write remaining extra non-binary files (custom latex config files, readme, guide etc.)
          for (const [path, content] of Object.entries(extraFiles)) {
            if (!path || typeof content !== "string") continue;
            if (path === INDEX_PATH || path === "main.tex" || path === "notebook.sty") continue;
            if (entryImportMode === "none" && (path.startsWith(`${ENTRIES_DIR}/`) || path.startsWith("latex/"))) continue;
            if (path.startsWith(`${ENTRIES_DIR}/`) || path.startsWith(`${ASSETS_DIR}/`)) continue;
            if (entryIdList.length > 0 && path.startsWith("latex/")) continue;
            await this.store.persistFile(path, content, `Import file: ${path}`);
          }

          if (pdf && typeof pdf === "string") {
            await this.store.persistFile("main.pdf", pdf, "Import compiled PDF", true);
          }

          if (options.overwriteFonts && data.fonts) {
            for (const [path, base64] of Object.entries(data.fonts as Record<string, string>)) {
              await this.store.persistFile(path, base64, `Import font: ${path}`, true);
            }
          }
        }

        await this.store.persistFile(INDEX_PATH, serializeNotebookMetadata(this.store.metadata), "Import notebook metadata");
        await this.store.updateLatexMetadata();
      });

      await this.store.reloadWorkspace();
      this.store.workspaceVersion++;

      const newPaths = new Set<string>(Object.values(newEntriesMap).map(m => m.filename));
      this.store.selectedPaths = newPaths;
      this.store.notifyStateChange();

      const isFullNotebook = !!(data.team || data.phases);
      const entryCount = entryIdList.length;
      const entryText = `${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}`;
      const message = isFullNotebook
        ? `Notebook imported successfully with ${entryText}`
        : `Successfully imported ${entryText}`;

      events.emit(EventNames.SHOW_NOTIFICATION, { message, type: "success" });

    } catch (e) {
      console.error("Import failed", e);
      events.emit(EventNames.SHOW_NOTIFICATION, { message: "Import failed", type: "error" });
    } finally {
      this.store.setLoading(false);
    }
  }

  async importNotebookArchive(file: File, options?: ImportOptions) {
    try {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const filenames = Object.keys(zip.files).filter(name => !zip.files[name].dir);

      let parsedNotebookIndex: NotebookMetadata | null = null;
      const indexEntry = zip.file(INDEX_PATH);
      if (indexEntry) {
        parsedNotebookIndex = JSON.parse(await indexEntry.async("string")) as NotebookMetadata;
      }

      const entries: Record<string, Record<string, unknown>> = {};
      const assets: Record<string, string> = {};
      const files: Record<string, string> = {};
      const latexFiles: Record<string, string> = {};
      const fonts: Record<string, string> = {};
      let pdf = "";

      for (const filename of filenames) {
        const entry = zip.file(filename);
        if (!entry || filename === INDEX_PATH) continue;

        if (filename.startsWith(`${ENTRIES_DIR}/`) && filename.endsWith(".json")) {
          const raw = await entry.async("string");
          const parsed = JSON.parse(raw) as { version?: number; content?: TipTapNode } & Record<string, unknown>;
          const entryId = filename.split("/").pop()?.replace(/\.json$/, "") || generateUUID();
          const metadata = parsedNotebookIndex?.entries?.[entryId] as Record<string, unknown> | undefined;
          entries[entryId] = {
            ...(metadata || {}),
            content: parsed.content || parsed,
          };
        } else if (filename === "main.pdf") {
          pdf = await entry.async("base64");
        } else if (filename.startsWith(`${ASSETS_DIR}/`)) {
          assets[filename] = await entry.async("base64");
        } else if (filename.startsWith("latex/") && filename.endsWith(".tex")) {
          latexFiles[filename] = await entry.async("string");
        } else if (filename.startsWith("fonts/")) {
          fonts[filename] = await entry.async("base64");
        } else if (!isBinaryFile(filename)) {
          files[filename] = await entry.async("string");
        }
      }

      const importData: Record<string, unknown> = {
        entries,
        assets,
        files,
        latexFiles,
        fonts,
        pdf,
      };

      if (parsedNotebookIndex?.team) {
        importData.team = parsedNotebookIndex.team;
      }
      if (parsedNotebookIndex?.phases) {
        importData.phases = parsedNotebookIndex.phases;
      }

      await this.importNotebook(importData, options);
    } catch (e) {
      console.error("Archive import failed", e);
      events.emit(EventNames.SHOW_NOTIFICATION, { message: "Import failed", type: "error" });
    }
  }
}
