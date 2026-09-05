import { INDEX_PATH, ENTRIES_DIR, LATEX_DIR, TEAM_PATH, PHASES_PATH, ENTRIES_INDEX_PATH } from "../constants";
import { events, EventNames } from "../events";
import { ExplorerFile } from "../types";
import { getAllPending, getPending, stageChange, removeStaged } from "../db";
import { fetchFileContent, fetchRawFileContent, checkGitHubFileExists } from "../github";
import { writeLocalFile, deleteLocalFileAtPath, getLocalFileContent, checkLocalFileExists } from "../fs";
import { generateUUID, getMimeTypeFromExtension, formatDateMonthYear, getLocalDateString } from "../utils";
import { EntryMetadata, normalizeNotebookMetadata, serializeNotebookMetadata, dehydrateAssets, hydrateAssets, extractImagePaths, extractResources, extractReferences, removeEntryFromMetadata, TipTapNode, ensureResourceIds, buildResourceTypeIndex, remapContentIds, remapEntryMetadataIds, collectNotebookResourceIds, duplicateResourceOwners, canonicalResourceOwner, remapSelectedContentIds, placeCreatedEntry } from "../metadata";
import { generateAllEntriesLatex, generateTeamLatex, generatePhasesLatex, generateEntryLatex, latexPhaseRef } from "../latex";
import { IWorkspaceStore } from "./types";

export class EntryManager {
  private store: IWorkspaceStore;

  constructor(store: IWorkspaceStore) {
    this.store = store;
  }

  async openEntry(id: string) {
    // Flush any pending save for the previous entry in the background (non-blocking)
    this.store.debouncedPersist.flush().catch((e: unknown) => {
      console.warn("Background persist flush failed during entry navigation:", e);
    });

    const meta = this.store.metadata.entries[id];

    if (!meta) {
      this.store.navigateTo({ entry: null });
      events.emit(EventNames.SHOW_NOTIFICATION, {
        message: "Entry not found",
        type: "error"
      });
      return;
    }

    // Clear current file to show localized loading state in UI
    this.store.openFile = null;
    this.store.notifyStateChange();

    try {
      const dbName = this.store.getDBName();

      // 1. Fetch pending changes once
      const pending = await getAllPending(dbName);

      // 2. Fetch Entry JSON (from memory cache -> staged -> local/remote)
      let entryJsonStr: string | null = null;
      if (this.store.lastSavedContents.has(meta.filename)) {
        entryJsonStr = this.store.lastSavedContents.get(meta.filename)!;
      } else {
        const stagedEntry = pending.find(p => p.path === meta.filename && p.operation === "upsert");
        if (stagedEntry?.content) {
          entryJsonStr = stagedEntry.content;
        } else if (this.store.mode === "local" && this.store.dirHandle) {
          entryJsonStr = (await getLocalFileContent(this.store.dirHandle, meta.filename)).text || "";
        } else if (this.store.mode === "github" && this.store.config) {
          entryJsonStr = await fetchFileContent(this.store.config, this.store.getFullPath(meta.filename));
        }
      }

      if (!entryJsonStr) throw new Error("Entry not found");
      const rawData = JSON.parse(entryJsonStr);
      const content = rawData.content || rawData;

      // 3. Fast asset resolution from memory and staged pending changes
      const assetCache = new Map<string, string>();
      const images = extractImagePaths(content);

      for (const imgPath of images) {
        if (imgPath.startsWith('data:')) continue;
        const staged = pending.find(p => p.path === imgPath && p.operation === "upsert");
        if (staged?.content) {
          const dataUrl = staged.content.startsWith('data:') ? staged.content : `data:${getMimeTypeFromExtension(imgPath)};base64,${staged.content}`;
          assetCache.set(imgPath, dataUrl);
        } else if (this.store.assetCache.has(imgPath)) {
          assetCache.set(imgPath, this.store.assetCache.get(imgPath)!);
        }
      }

      const hydratedContent = hydrateAssets(content, assetCache);

      this.store.openFile = {
        path: meta.filename,
        name: meta.filename.split('/').pop() || "",
        id: id,
        tiptapContent: JSON.stringify(hydratedContent),
        latex: "",
        title: meta.title,
        author: meta.author,
        phase: meta.phase,
        date: meta.date,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt
      };

      this.store.lastSavedContents.set(meta.filename, JSON.stringify({ version: 3, content }, null, 2));
      events.emit(EventNames.ENTRY_LOADED, this.store.openFile);
      this.store.notifyStateChange();
    } catch (e) {
      console.error("Failed to open entry:", e);
      this.store.openFile = null;
      this.store.navigateTo({ entry: null });
      events.emit(EventNames.SHOW_NOTIFICATION, { message: "Failed to load entry.", type: "error" });
      this.store.notifyStateChange();
    }
  }

  updateDraft(
    tiptapContent: string | null,
    info: { title?: string; author?: string; phase?: string | null; date?: string }
  ) {
    if (!this.store.openFile) return;
    const id = this.store.openFile.id;

    // Check if anything actually changed
    const titleChanged = info.title !== undefined && info.title !== this.store.openFile.title;
    const authorChanged = info.author !== undefined && info.author !== this.store.openFile.author;
    const phaseChanged = info.phase !== undefined && info.phase !== this.store.openFile.phase;
    const dateChanged = info.date !== undefined && info.date !== this.store.openFile.date;
    const contentChanged = tiptapContent !== null && tiptapContent !== this.store.openFile.tiptapContent;

    if (!titleChanged && !authorChanged && !phaseChanged && !dateChanged && !contentChanged) {
      return; // No real change, do not bump updatedAt or stage pending saves
    }

    // 1. Synchronously update openFile
    if (tiptapContent !== null) {
      this.store.openFile.tiptapContent = tiptapContent;
    }
    if (info.title !== undefined) this.store.openFile.title = info.title;
    if (info.author !== undefined) this.store.openFile.author = info.author;
    if (info.phase !== undefined) this.store.openFile.phase = info.phase;
    if (info.date !== undefined) this.store.openFile.date = info.date;
    this.store.openFile.updatedAt = new Date().toISOString();

    // 2. Synchronously update metadata in-memory for immediate UI feedback (Sidebar, etc.)
    const existingEntry = this.store.metadata.entries[id];
    if (existingEntry) {
      this.store.metadata = normalizeNotebookMetadata({
        ...this.store.metadata,
        entries: {
          ...this.store.metadata.entries,
          [id]: {
            ...existingEntry,
            ...(info.title !== undefined ? { title: info.title } : {}),
            ...(info.author !== undefined ? { author: info.author } : {}),
            ...(info.phase !== undefined ? { phase: info.phase } : {}),
            ...(info.date !== undefined ? { date: info.date } : {}),
            updatedAt: this.store.openFile.updatedAt,
          }
        }
      });
    }

    // 3. Mark pending save as true
    this.store.setPendingSave(true);

    // 4. Trigger debounced background save
    this.store.debouncedPersist();

    // 5. Notify reactive hooks/listeners
    this.store.notifyStateChange();
  }

  async updateEntry(id: string, latex: string, tiptapContent: string, info: { title: string; author: string; phase: string | null; date: string }) {
    this.updateDraft(tiptapContent, info);
    await this.store.debouncedPersist.flush();
  }

  async saveDraft(id: string, latex: string, tiptapContent: string, info: { title: string; author: string; phase: string | null; date: string }) {
    let contentJson = JSON.parse(tiptapContent);
    // Handle double-stringification and wrapping
    if (typeof contentJson === 'string') {
      try { contentJson = JSON.parse(contentJson); } catch { }
    }
    if (contentJson && contentJson.content && !contentJson.type) {
      contentJson = contentJson.content;
    }

    contentJson = ensureResourceIds(
      contentJson,
      collectNotebookResourceIds(this.store.metadata.entries, id)
    ) as TipTapNode;
    tiptapContent = JSON.stringify(contentJson);

    // 1. Update memory immediately (Source of Truth)
    if (this.store.openFile && this.store.openFile.id === id) {
      this.store.openFile = { ...this.store.openFile, ...info, tiptapContent, latex, updatedAt: new Date().toISOString() };
    }

    const existingEntry = this.store.metadata.entries[id];
    if (!existingEntry) return;

    const discoveredResources = extractResources(contentJson);
    const mergedResources: Record<string, { type: string; title: string; caption: string }> = {};
    const oldResources = existingEntry.resources || {};

    for (const [resId, resInfo] of Object.entries(discoveredResources)) {
      mergedResources[resId] = {
        type: resInfo.type,
        title: resInfo.title || oldResources[resId]?.title || "",
        caption: resInfo.caption || oldResources[resId]?.caption || "",
      };
    }

    const mergedEntry: EntryMetadata = {
      ...existingEntry,
      ...info,
      updatedAt: new Date().toISOString(),
      resources: mergedResources,
      references: extractReferences(contentJson),
      assets: extractImagePaths(contentJson),
    };

    this.store.metadata = normalizeNotebookMetadata({
      ...this.store.metadata,
      entries: { ...this.store.metadata.entries, [id]: mergedEntry }
    });

    this.store.notifyStateChange();
    events.emit(EventNames.ENTRY_UPDATED, { id, ...info });

    if (info.author) {
      localStorage.setItem("nb-last-author", info.author);
    }

    // 2. Queue background persistence
    await this.store.enqueue(async () => {
      let contentObj = JSON.parse(tiptapContent);
      // Handle potential double-stringification
      if (typeof contentObj === 'string') {
        try {
          contentObj = JSON.parse(contentObj);
        } catch { /* use as is */ }
      }

      const { cleanDoc, newAssets } = await dehydrateAssets(contentObj, existingEntry.assets || []);
      const entryJsonStr = JSON.stringify({ version: 3, content: cleanDoc }, null, 2);

      // Save assets
      for (const asset of newAssets) {
        await this.persistFile(asset.path, asset.base64, `Asset: ${asset.path}`, true);
        const dataUrl = `data:${getMimeTypeFromExtension(asset.path)};base64,${asset.base64}`;
        this.store.assetCache.set(asset.path, dataUrl);
      }

      // Save Entry JSON (always write to ensure metadata edits like date/title/author trigger entry change tracking)
      await this.persistFile(mergedEntry.filename, entryJsonStr, `Auto-save: ${info.title}`);
      this.store.lastSavedContents.set(mergedEntry.filename, entryJsonStr);

      // Save LaTeX (only for regular entries, not templates)
      if (!mergedEntry.isTemplate) {
        const latexPath = `${LATEX_DIR}/${id}.tex`;
        if (this.store.lastSavedContents.get(latexPath) !== latex) {
          await this.persistFile(latexPath, latex, `Generate LaTeX: ${info.title}`);
          this.store.lastSavedContents.set(latexPath, latex);
        }
      }

      // Cleanup orphaned assets
      await this.reconcileAssetRefs(existingEntry.assets || [], mergedEntry.assets || []);

      // Save Metadata
      await this.persistFile(INDEX_PATH, serializeNotebookMetadata(this.store.metadata), "Auto-save metadata");
      await this.store.updateLatexMetadata();
    });
  }

  async createEntry() {
    const id = generateUUID();
    const createdAt = new Date().toISOString();
    const localDate = getLocalDateString();
    const path = `${ENTRIES_DIR}/${id}.json`;
    const latexPath = `${LATEX_DIR}/${id}.tex`;

    const newEntry: EntryMetadata = {
      title: "",
      author: localStorage.getItem("nb-last-author") || "",
      phase: null,
      date: localDate,
      createdAt, updatedAt: createdAt, filename: path,
      order: Object.keys(this.store.metadata.entries || {}).length
    };

    const wrapper = { version: 3, content: { type: "doc", content: [{ type: "paragraph" }] } };
    const jsonStr = JSON.stringify(wrapper, null, 2);
    const initialLatex = `\\notebookentry{${newEntry.title}}{${localDate}}{${newEntry.author}}{}{${id}}\n\n`;

    this.store.lastSavedContents.set(path, jsonStr);
    this.store.lastSavedContents.set(latexPath, initialLatex);

    this.store.metadata = placeCreatedEntry(normalizeNotebookMetadata({
      ...this.store.metadata,
      entries: { ...this.store.metadata.entries, [id]: newEntry }
    }), id);
    this.store.entries = [{ name: `${id}.json`, path }, ...this.store.entries];
    this.store.notifyStateChange();

    this.store.enqueue(async () => {
      await this.persistFile(path, jsonStr, "New entry");
      await this.persistFile(latexPath, initialLatex, "Init LaTeX");
      await this.persistFile(INDEX_PATH, serializeNotebookMetadata(this.store.metadata), "Create entry metadata");
      await this.store.updateLatexMetadata();
    });

    this.store.navigateTo({ entry: id });
    return id;
  }

  async duplicateEntry(sourceId: string, options?: { asTemplate?: boolean; title?: string; author?: string; phase?: string | null; date?: string }): Promise<string> {
    const sourceMeta = this.store.metadata.entries[sourceId];
    if (!sourceMeta) throw new Error("Source entry not found");

    // Flush any pending debounced edits first and wait for the save to complete
    await this.store.debouncedPersist.flush();

    let contentJson = await this.readEntryTipTapDoc(sourceId, sourceMeta);

    // Deep clone and remap all resource and heading UUIDs so copies never share ids with the source or the rest of the notebook
    const reserved = collectNotebookResourceIds(this.store.metadata.entries);
    const remapped = remapContentIds(JSON.parse(JSON.stringify(contentJson)), new Map(), reserved);
    contentJson = ensureResourceIds(remapped.doc as TipTapNode, reserved) as TipTapNode;
    const remappedEntryMeta = remapEntryMetadataIds(sourceMeta, remapped.idMap);
    remappedEntryMeta.resources = extractResources(contentJson);
    remappedEntryMeta.references = extractReferences(contentJson);

    const newId = generateUUID();
    const createdAt = new Date().toISOString();
    const todayDate = getLocalDateString();
    const newPath = `${ENTRIES_DIR}/${newId}.json`;
    const newLatexPath = `${LATEX_DIR}/${newId}.tex`;

    const isTemplate = options?.asTemplate ?? sourceMeta.isTemplate ?? false;
    let newTitle = options?.title;
    if (!newTitle) {
      if (options?.asTemplate && !sourceMeta.isTemplate) {
        newTitle = `${sourceMeta.title || "Untitled"} Template`;
      } else if (!isTemplate && sourceMeta.isTemplate) {
        newTitle = sourceMeta.title || "New Entry";
      } else {
        newTitle = `${sourceMeta.title || "Untitled"} (Copy)`;
      }
    }

    const lastUsedAuthor = (typeof window !== "undefined" ? localStorage.getItem("nb-last-author") : null) || "";

    const author = options?.author !== undefined
      ? options.author
      : (!isTemplate && sourceMeta.isTemplate)
      ? (lastUsedAuthor || sourceMeta.author || "")
      : (sourceMeta.author || lastUsedAuthor);

    const phase = options?.phase !== undefined
      ? options.phase
      : (sourceMeta.phase ?? null);

    const date = isTemplate
      ? ""
      : options?.date !== undefined
      ? options.date
      : (!isTemplate && sourceMeta.isTemplate)
      ? todayDate
      : (sourceMeta.date || todayDate);

    const newEntry: EntryMetadata = {
      title: newTitle,
      author,
      phase,
      date,
      createdAt,
      updatedAt: createdAt,
      filename: newPath,
      order: Object.keys(this.store.metadata.entries || {}).length,
      isTemplate: isTemplate || undefined,
      resources: remappedEntryMeta.resources,
      references: remappedEntryMeta.references,
      assets: sourceMeta.assets ? [...sourceMeta.assets] : undefined
    };

    const { cleanDoc, newAssets } = await dehydrateAssets(contentJson, newEntry.assets || []);
    const wrapper = { version: 3, content: cleanDoc };
    const jsonStr = JSON.stringify(wrapper, null, 2);

    // Merge any freshly extracted asset paths into metadata
    if (newAssets.length > 0) {
      const assetPaths = newAssets.map(a => a.path);
      newEntry.assets = [...new Set([...(newEntry.assets || []), ...assetPaths])];
    }

    const resourceTypes = buildResourceTypeIndex(this.store.metadata.entries, remappedEntryMeta.resources || {}, newId);
    const newLatex = !isTemplate ? generateEntryLatex(
      contentJson,
      newTitle,
      newEntry.author,
      latexPhaseRef(newEntry.phase, this.store.metadata.phases),
      createdAt,
      newId,
      resourceTypes,
      newEntry.date
    ) : "";

    this.store.lastSavedContents.set(newPath, jsonStr);
    if (!isTemplate) {
      this.store.lastSavedContents.set(newLatexPath, newLatex);
    }

    this.store.metadata = placeCreatedEntry(normalizeNotebookMetadata({
      ...this.store.metadata,
      entries: { ...this.store.metadata.entries, [newId]: newEntry }
    }), newId);
    this.store.entries = [{ name: `${newId}.json`, path: newPath }, ...this.store.entries];
    this.store.notifyStateChange();

    this.store.enqueue(async () => {
      // Persist any new asset files
      for (const asset of newAssets) {
        await this.persistFile(asset.path, asset.base64, `Asset: ${asset.path}`, true);
        const { getMimeTypeFromExtension } = await import("../utils");
        const dataUrl = `data:${getMimeTypeFromExtension(asset.path)};base64,${asset.base64}`;
        this.store.assetCache.set(asset.path, dataUrl);
      }
      await this.persistFile(newPath, jsonStr, `Create entry: ${newTitle}`);
      if (!isTemplate) {
        await this.persistFile(newLatexPath, newLatex, `Init LaTeX for: ${newTitle}`);
      }
      await this.persistFile(INDEX_PATH, serializeNotebookMetadata(this.store.metadata), "Update notebook metadata");
      await this.store.updateLatexMetadata();
    });

    this.store.navigateTo({ entry: newId });
    return newId;
  }


  async createTemplate(templateData?: Partial<EntryMetadata>): Promise<string> {
    const id = generateUUID();
    const createdAt = new Date().toISOString();
    const path = `${ENTRIES_DIR}/${id}.json`;

    const newTemplate: EntryMetadata = {
      title: templateData?.title || "New Template",
      author: templateData?.author || localStorage.getItem("nb-last-author") || "",
      phase: templateData?.phase ?? null,
      date: "",
      createdAt,
      updatedAt: createdAt,
      filename: path,
      order: Object.keys(this.store.metadata.entries || {}).length,
      isTemplate: true
    };

    const wrapper = { version: 3, content: { type: "doc", content: [{ type: "paragraph" }] } };
    const jsonStr = JSON.stringify(wrapper, null, 2);

    this.store.lastSavedContents.set(path, jsonStr);

    this.store.metadata = placeCreatedEntry(normalizeNotebookMetadata({
      ...this.store.metadata,
      entries: { ...this.store.metadata.entries, [id]: newTemplate }
    }), id);
    this.store.entries = [{ name: `${id}.json`, path }, ...this.store.entries];
    this.store.notifyStateChange();

    this.store.enqueue(async () => {
      await this.persistFile(path, jsonStr, `Create template: ${newTemplate.title}`);
      await this.persistFile(INDEX_PATH, serializeNotebookMetadata(this.store.metadata), "Update notebook metadata");
    });

    this.store.navigateTo({ entry: id });
    return id;
  }

  async createEntryFromTemplate(templateId: string): Promise<string> {
    const templateMeta = this.store.metadata.entries[templateId];
    const lastAuthor = (typeof window !== "undefined" ? localStorage.getItem("nb-last-author") : null) || "";
    const todayDate = getLocalDateString();

    return this.duplicateEntry(templateId, {
      asTemplate: false,
      title: templateMeta?.title || "New Entry",
      author: lastAuthor || templateMeta?.author || "",
      phase: templateMeta?.phase ?? null,
      date: todayDate
    });
  }

  private async readEntryTipTapDoc(entryId: string, meta: EntryMetadata): Promise<TipTapNode> {
    let contentJson: TipTapNode = { type: "doc", content: [{ type: "paragraph" }] };
    if (this.store.openFile?.id === entryId && this.store.openFile.tiptapContent) {
      try {
        contentJson = JSON.parse(this.store.openFile.tiptapContent);
      } catch { /* use empty */ }
    } else {
      let raw: string | null = null;
      if (this.store.lastSavedContents.has(meta.filename)) {
        raw = this.store.lastSavedContents.get(meta.filename)!;
      } else {
        const dbName = this.store.getDBName();
        const pending = await getAllPending(dbName);
        const stagedEntry = pending.find(p => p.path === meta.filename && p.operation === "upsert");
        if (stagedEntry?.content) {
          raw = stagedEntry.content;
        } else if (this.store.mode === "local" && this.store.dirHandle) {
          raw = (await getLocalFileContent(this.store.dirHandle, meta.filename)).text || null;
        } else if ((this.store.mode === "github" || this.store.mode === "temporary") && this.store.config) {
          raw = await fetchFileContent(this.store.config, this.store.getFullPath(meta.filename));
        }
      }
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          contentJson = parsed.content || parsed;
        } catch { /* keep empty */ }
      }
    }
    return contentJson;
  }

  /** Give colliding resource UUIDs (e.g. entry created from a template without remapping) unique ids. Prefer keeping non-template owners. */
  async repairDuplicateResourceIds(): Promise<boolean> {
    const dupes = duplicateResourceOwners(this.store.metadata.entries);
    if (dupes.size === 0) return false;

    const byEntry = new Map<string, Set<string>>();
    for (const [resId, owners] of dupes) {
      const keep = canonicalResourceOwner(owners, this.store.metadata.entries);
      for (const entryId of owners) {
        if (entryId === keep) continue;
        const set = byEntry.get(entryId) ?? new Set<string>();
        set.add(resId);
        byEntry.set(entryId, set);
      }
    }
    if (byEntry.size === 0) return false;

    let nextMeta = this.store.metadata;
    for (const [entryId, idsToChange] of byEntry) {
      const meta = nextMeta.entries[entryId];
      if (!meta) continue;
      const content = await this.readEntryTipTapDoc(entryId, meta);
      const reserved = collectNotebookResourceIds(nextMeta.entries, entryId);
      const { doc, idMap } = remapSelectedContentIds(content, idsToChange, reserved);
      const patched = remapEntryMetadataIds(meta, idMap);
      patched.resources = extractResources(doc as TipTapNode);
      patched.references = extractReferences(doc as TipTapNode);
      const jsonStr = JSON.stringify({ version: 3, content: doc }, null, 2);
      this.store.lastSavedContents.set(meta.filename, jsonStr);
      await this.persistFile(meta.filename, jsonStr, `Remap duplicate resource ids: ${meta.title || entryId}`);
      nextMeta = {
        ...nextMeta,
        entries: { ...nextMeta.entries, [entryId]: patched }
      };
    }

    this.store.metadata = normalizeNotebookMetadata(nextMeta);
    await this.persistFile(INDEX_PATH, serializeNotebookMetadata(this.store.metadata), "Dedupe resource ids");
    this.store.notifyStateChange();
    return true;
  }

  async refreshPending() {
    if (this.store.savingCount > 0) {
      return this.store.pendingChanges;
    }
    const dbName = this.store.getDBName();
    this.store.pendingChanges = await getAllPending(dbName);
    this.store.notifyStateChange();
    return this.store.pendingChanges;
  }

  setEntryValidity(id: string, isValid: boolean, validationErrors: string[] = []) {
    const existingEntry = this.store.metadata.entries[id];
    if (!existingEntry) return;

    if (existingEntry.isValid === isValid && JSON.stringify(existingEntry.validationErrors || []) === JSON.stringify(validationErrors)) {
      return;
    }

    this.store.metadata = {
      ...this.store.metadata,
      entries: {
        ...this.store.metadata.entries,
        [id]: {
          ...existingEntry,
          isValid,
          validationErrors
        }
      }
    };

    this.store.notifyStateChange();
  }

  async discardPathChange(path: string) {
    if (this.store.mode !== "github" && this.store.mode !== "temporary") return;
    const dbName = this.store.getDBName();
    await this.store.queue;
    await removeStaged(dbName, path);
    this.store.lastSavedContents.delete(path);

    if (path === "main.pdf") {
      this.store.assetCache.delete("main.pdf");
      const committedIndex = await this.getCommittedFileContent(INDEX_PATH);
      let committedLastCompiled: string | undefined = undefined;
      if (committedIndex) {
        try {
          const parsed = JSON.parse(committedIndex);
          committedLastCompiled = parsed.lastCompiled;
        } catch {}
      }

      this.store.metadata = {
        ...this.store.metadata,
        lastCompiled: committedLastCompiled
      };

      const currentMetaStr = serializeNotebookMetadata(this.store.metadata);
      if (committedIndex && JSON.stringify(JSON.parse(committedIndex), null, 2) === currentMetaStr) {
        await removeStaged(dbName, INDEX_PATH);
        this.store.lastSavedContents.delete(INDEX_PATH);
      } else {
        await this.persistFile(INDEX_PATH, currentMetaStr, "Revert lastCompiled metadata");
      }
    }

    await this.refreshPending();
    this.store.notifyStateChange();
  }

  async discardEntryChanges(entryId: string) {
    if (this.store.mode !== "github" && this.store.mode !== "temporary") return;
    this.store.isDiscarding = true;
    this.store.notifyStateChange();

    try {
      const dbName = this.store.getDBName();
      await this.store.queue;
      
      const entryJsonPath = `${ENTRIES_DIR}/${entryId}.json`;
      const entryTexPath = `${LATEX_DIR}/${entryId}.tex`;

      // 1. Revert staged entry files
      await removeStaged(dbName, entryJsonPath);
      await removeStaged(dbName, entryTexPath);
      this.store.lastSavedContents.delete(entryJsonPath);
      this.store.lastSavedContents.delete(entryTexPath);

      // 2. Revert any staged asset files associated with this entry
      const entryMeta = this.store.metadata.entries[entryId];
      if (entryMeta?.assets) {
        for (const assetPath of entryMeta.assets) {
          // Only revert asset if it was newly staged and not shared by other non-discarded entries
          const otherEntriesUsingAsset = Object.entries(this.store.metadata.entries)
            .filter(([id, m]) => id !== entryId && m.assets?.includes(assetPath));
          if (otherEntriesUsingAsset.length === 0) {
            await removeStaged(dbName, assetPath);
            this.store.assetCache.delete(assetPath);
          }
        }
      }

    // 3. If this entry was a newly created entry (never committed), clean it from metadata and explorer
    const committed = await this.getCommittedFileContent(entryJsonPath);
    if (!committed) {
      this.store.metadata = normalizeNotebookMetadata(removeEntryFromMetadata(this.store.metadata, entryId));
      this.store.entries = this.store.entries.filter(e => e.path !== entryJsonPath);
      if (this.store.openFile?.id === entryId) {
        this.store.openFile = null;
        this.store.navigateTo({ entry: null });
      }
    } else {
      // Re-read committed metadata if notebook.json was modified
      const committedIndex = await this.getCommittedFileContent(INDEX_PATH);
      if (committedIndex) {
        try {
          const parsed = JSON.parse(committedIndex);
          if (parsed.entries?.[entryId]) {
            this.store.metadata = normalizeNotebookMetadata({
              ...this.store.metadata,
              entries: {
                ...this.store.metadata.entries,
                [entryId]: parsed.entries[entryId]
              }
            });
          }
        } catch {}
      }

      try {
        await this.openEntry(entryId);
      } catch {}
    }

    // 4. Update or clear staged notebook.json
    const committedIndex = await this.getCommittedFileContent(INDEX_PATH);
    const currentMetaStr = serializeNotebookMetadata(this.store.metadata);
    if (committedIndex && JSON.stringify(JSON.parse(committedIndex), null, 2) === currentMetaStr) {
      // If metadata now matches committed state, remove staged notebook.json
      await removeStaged(dbName, INDEX_PATH);
      this.store.lastSavedContents.delete(INDEX_PATH);
    } else {
      // Otherwise update the staged notebook.json with the reverted metadata
      await this.persistFile(INDEX_PATH, currentMetaStr, "Update notebook metadata");
    }

    await this.store.updateLatexMetadata();
    await this.refreshPending();
  } finally {
    this.store.isDiscarding = false;
    this.store.notifyStateChange();
  }
}

  async discardTeamChanges() {
    if (this.store.mode !== "github" && this.store.mode !== "temporary") return;
    this.store.isDiscarding = true;
    this.store.notifyStateChange();

    try {
      const dbName = this.store.getDBName();
      await this.store.queue;

      // 1. Remove staged team.tex
      await removeStaged(dbName, TEAM_PATH);
      this.store.lastSavedContents.delete(TEAM_PATH);

      // 2. Fetch committed notebook.json to restore original team data
      const committedIndex = await this.getCommittedFileContent(INDEX_PATH);
      let committedTeam: import("../metadata").TeamMetadata | undefined = undefined;
      if (committedIndex) {
        try {
          const parsed = JSON.parse(committedIndex);
          committedTeam = parsed.team;
        } catch {}
      }

      this.store.metadata = normalizeNotebookMetadata({
        ...this.store.metadata,
        team: committedTeam
      });

      // 3. Update or clear staged notebook.json
      const currentMetaStr = serializeNotebookMetadata(this.store.metadata);
      if (committedIndex && JSON.stringify(JSON.parse(committedIndex), null, 2) === currentMetaStr) {
        await removeStaged(dbName, INDEX_PATH);
        this.store.lastSavedContents.delete(INDEX_PATH);
      } else {
        await this.persistFile(INDEX_PATH, currentMetaStr, "Revert team metadata");
      }

      await this.store.updateLatexMetadata();
      await this.refreshPending();
    } finally {
      this.store.isDiscarding = false;
      this.store.notifyStateChange();
    }
  }

  async discardPhaseChanges() {
    if (this.store.mode !== "github" && this.store.mode !== "temporary") return;
    this.store.isDiscarding = true;
    this.store.notifyStateChange();

    try {
      const dbName = this.store.getDBName();
      await this.store.queue;

      // 1. Remove staged phases.tex
      await removeStaged(dbName, PHASES_PATH);
      this.store.lastSavedContents.delete(PHASES_PATH);

      // 2. Fetch committed notebook.json to restore original phases
      const committedIndex = await this.getCommittedFileContent(INDEX_PATH);
      let committedPhases: Record<string, import("../metadata").ProjectPhase> | unknown = undefined;
      if (committedIndex) {
        try {
          const parsed = JSON.parse(committedIndex);
          committedPhases = parsed.phases;
        } catch {}
      }

      this.store.metadata = normalizeNotebookMetadata({
        ...this.store.metadata,
        phases: committedPhases
      });

      // 3. Update or clear staged notebook.json
      const currentMetaStr = serializeNotebookMetadata(this.store.metadata);
      if (committedIndex && JSON.stringify(JSON.parse(committedIndex), null, 2) === currentMetaStr) {
        await removeStaged(dbName, INDEX_PATH);
        this.store.lastSavedContents.delete(INDEX_PATH);
      } else {
        await this.persistFile(INDEX_PATH, currentMetaStr, "Revert phases metadata");
      }

      await this.store.updateLatexMetadata();
      await this.refreshPending();
    } finally {
      this.store.isDiscarding = false;
      this.store.notifyStateChange();
    }
  }

  async discardPendingChanges() {
    if (this.store.mode !== "github" && this.store.mode !== "temporary") {
      return;
    }

    this.store.isDiscarding = true;
    this.store.notifyStateChange();

    try {
      const dbName = this.store.getDBName();
      await this.store.queue;
      const previousOpenId = this.store.openFile?.id ?? null;

      const { clearAllPending, clearBaseMetadata } = await import("../db");
      await clearAllPending(dbName);
      await clearBaseMetadata(dbName);

      // Drop in-memory drafts so reload/openEntry can't resurrect discarded text.
      this.store.lastSavedContents.clear();

      await this.store.reloadWorkspace();
      await this.refreshPending();

      if (previousOpenId) {
        if (this.store.metadata.entries[previousOpenId]) {
          await this.openEntry(previousOpenId);
          return;
        }

        this.store.openFile = null;
        this.store.selectedPaths = new Set();
        this.store.navigateTo({ entry: null, resource: null });
        return;
      }
    } finally {
      this.store.isDiscarding = false;
      this.store.notifyStateChange();
    }
  }

  async deleteEntry(file: ExplorerFile) {
    const id = file.path.split('/').pop()?.replace('.json', '') || "";
    if (this.store.openFile?.id === id) {
      this.store.debouncedPersist.cancel();
    }
    const oldMeta = this.store.metadata;
    const updatedMeta = normalizeNotebookMetadata(removeEntryFromMetadata(this.store.metadata, id));

    // Memory update
    this.store.metadata = updatedMeta;
    this.store.entries = this.store.entries.filter(e => e.path !== file.path);
    if (this.store.openFile?.id === id) {
      this.store.openFile = null;
      this.store.navigateTo({ entry: null });
    }

    this.store.notifyStateChange();

    // Background persistence
    await this.store.enqueue(async () => {
      if (this.store.mode === "local" && this.store.dirHandle) {
        if (await this.shouldStageDelete(file.path)) {
          await deleteLocalFileAtPath(this.store.dirHandle, file.path);
        }
        if (await this.shouldStageDelete(`${LATEX_DIR}/${id}.tex`)) {
          await deleteLocalFileAtPath(this.store.dirHandle, `${LATEX_DIR}/${id}.tex`);
        }
      } else if (this.store.mode === "github" || this.store.mode === "temporary") {
        const dbName = this.store.getDBName();

        if (await this.shouldStageDelete(file.path)) {
          await stageChange(dbName, { path: file.path, operation: "delete", label: "Delete entry", stagedAt: new Date().toISOString() });
        }

        if (await this.shouldStageDelete(`${LATEX_DIR}/${id}.tex`)) {
          await stageChange(dbName, { path: `${LATEX_DIR}/${id}.tex`, operation: "delete", label: "Delete LaTeX", stagedAt: new Date().toISOString() });
        }
      }

      await this.reconcileAssetRefs(oldMeta.assetRefs || {}, this.store.metadata.assetRefs || {});
      await this.persistFile(INDEX_PATH, serializeNotebookMetadata(this.store.metadata), "Delete entry");
      await this.store.updateLatexMetadata();
    });
  }

  async updateLatexMetadata() {
    const regularEntries = Object.values(this.store.metadata.entries)
      .filter(e => !e.isTemplate && Boolean(e.date));

    const entryDates = regularEntries
      .map(e => e.date)
      .sort();

    const autoStartDate = entryDates.length > 0 ? entryDates[0] : "";
    const autoEndDate = entryDates.length > 0 ? entryDates[entryDates.length - 1] : "";

    const rawTeam: Partial<import("../metadata").TeamMetadata> = this.store.metadata.team || {};
    const isAuto = rawTeam.autoCalculateDates ?? true;
    const effectiveStartDate = (!isAuto && rawTeam.startDate) ? rawTeam.startDate : formatDateMonthYear(autoStartDate);
    const effectiveEndDate = (!isAuto && rawTeam.endDate) ? rawTeam.endDate : formatDateMonthYear(autoEndDate);

    // Update team metadata in memory so generateTeamLatex picks it up
    const teamInfo = {
      teamName: "",
      teamNumber: "",
      organization: "",
      members: {},
      ...rawTeam,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate
    };

    const teamLatex = generateTeamLatex(teamInfo);
    const phasesLatex = generatePhasesLatex(this.store.metadata.phases || {});
    const allEntriesLatex = generateAllEntriesLatex(this.store.metadata);

    await this.persistFile(TEAM_PATH, teamLatex, "Update team.tex");
    await this.persistFile(PHASES_PATH, phasesLatex, "Update phases.tex");
    await this.persistFile(ENTRIES_INDEX_PATH, allEntriesLatex, "Update entries.tex");
  }

  async persistFile(path: string, content: string, label: string, isBase64 = false) {
    if ((this.store.mode === "local" || (this.store.mode === "none" && this.store.dirHandle)) && this.store.dirHandle) {
      await writeLocalFile(this.store.dirHandle, path, content, isBase64);
    } else if (this.store.mode === "github" || this.store.mode === "temporary" || (this.store.mode === "none" && this.store.config)) {
      const mode = (this.store.mode === "none" && this.store.config) ? "github" : this.store.mode;
      const dbName = this.store.getDBName();
      const staged = await getPending(dbName, path);
      const committed = mode === "github" ? await this.getCommittedFileContent(path, isBase64) : null;
      const changeType = committed === null ? "create" : "update";

      if (mode === "github") {
        if (committed === content) {
          if (staged) {
            await removeStaged(dbName, path);
            await this.refreshPending();
          }
          return;
        }
      }

      if (staged?.operation === "upsert" && staged.content === content) {
        return;
      }

      await stageChange(dbName, { path, content, operation: "upsert", changeType, label, stagedAt: new Date().toISOString() });
      await this.refreshPending();
    }
  }

  async reconcileAssetRefs(oldRefs: string[] | Record<string, string[]>, newRefs: string[] | Record<string, string[]>) {
    const removed: string[] = [];

    if (Array.isArray(oldRefs) && Array.isArray(newRefs)) {
      // Comparing specific entry assets
      for (const path of oldRefs) {
        // Only mark for deletion if it's not in the new set AND not used by ANY other entry/team
        if (!newRefs.includes(path) && (!this.store.metadata.assetRefs?.[path] || this.store.metadata.assetRefs[path].length === 0)) {
          removed.push(path);
        }
      }
    } else {
      // Comparing global assetRefs (Record<path, owners[]>)
      const oldR = oldRefs as Record<string, string[]>;
      const newR = newRefs as Record<string, string[]>;
      for (const path in oldR) {
        if (!newR[path]) removed.push(path);
      }
    }

    for (const path of removed) {
      if (this.store.mode === "local" && this.store.dirHandle) {
        if (await this.shouldStageDelete(path)) {
          await deleteLocalFileAtPath(this.store.dirHandle, path);
        }
      } else if (this.store.mode === "github" || this.store.mode === "temporary") {
        if (await this.shouldStageDelete(path)) {
          await stageChange(this.store.getDBName(), { path, operation: "delete", label: `Cleanup orphan: ${path}`, stagedAt: new Date().toISOString() });
        }
      }
      // Also remove from global cache to prevent hydration of dead paths
      this.store.assetCache.delete(path);
    }
  }

  async shouldStageDelete(path: string): Promise<boolean> {
    const dbName = this.store.getDBName();
    const staged = await getPending(dbName, path);

    if (staged?.operation === "upsert") {
      await removeStaged(dbName, path);
      await this.refreshPending();
      return false;
    }

    if (staged?.operation === "delete") {
      return false;
    }

    if (this.store.mode === "local" && this.store.dirHandle) {
      return checkLocalFileExists(this.store.dirHandle, path);
    }

    if (this.store.config && (this.store.mode === "github" || this.store.mode === "temporary" || this.store.mode === "none")) {
      return checkGitHubFileExists(this.store.config, this.store.getFullPath(path));
    }

    return false;
  }

  async getCommittedFileContent(path: string, isBase64 = false): Promise<string | null> {
    if (this.store.mode !== "github" || !this.store.config) {
      return null;
    }

    try {
      const fullPath = this.store.getFullPath(path);
      return isBase64 ? await fetchRawFileContent(this.store.config, fullPath) : await fetchFileContent(this.store.config, fullPath);
    } catch {
      return null;
    }
  }
}
