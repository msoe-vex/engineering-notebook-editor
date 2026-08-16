import { INDEX_PATH, ENTRIES_DIR, LATEX_DIR, TEAM_PATH, PHASES_PATH, ENTRIES_INDEX_PATH } from "../constants";
import { events, EventNames } from "../events";
import { ExplorerFile } from "../types";
import { getAllPending, getPending, stageChange, removeStaged } from "../db";
import { fetchFileContent, fetchRawFileContent, checkGitHubFileExists } from "../github";
import { readLocalFile, writeLocalFile, deleteLocalFileAtPath, getLocalFileContent, checkLocalFileExists } from "../fs";
import { generateUUID, getMimeTypeFromExtension, formatDateMonthYear } from "../utils";
import { EntryMetadata, validateNotebookIntegrity, dehydrateAssets, hydrateAssets, extractImagePaths, extractResources, extractReferences, removeEntryFromMetadata, TipTapNode, ensureResourceIds, buildResourceTypeIndex } from "../metadata";
import { generateAllEntriesLatex, generateTeamLatex, generatePhasesLatex } from "../latex";
import { IWorkspaceStore } from "./types";

export class EntryManager {
  private store: IWorkspaceStore;

  constructor(store: IWorkspaceStore) {
    this.store = store;
  }

  async openEntry(id: string) {
    this.store.debouncedPersist.flush();
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
      const texPath = `${LATEX_DIR}/${id}.tex`;

      // 1. Fetch pending changes once
      const pending = await getAllPending(dbName);

      // 2. Fetch Entry JSON and LaTeX concurrently
      const [entryJsonStr, latex] = await Promise.all([
        (async () => {
          // Check memory cache first
          if (this.store.lastSavedContents.has(meta.filename)) {
            return this.store.lastSavedContents.get(meta.filename)!;
          }
          // Check staged changes
          const stagedEntry = pending.find(p => p.path === meta.filename && p.operation === "upsert");
          if (stagedEntry?.content) return stagedEntry.content;
          // Check disk / remote
          if (this.store.mode === "local" && this.store.dirHandle) {
            return (await getLocalFileContent(this.store.dirHandle, meta.filename)).text || "";
          } else if (this.store.mode === "github" && this.store.config) {
            return await fetchFileContent(this.store.config, this.store.getFullPath(meta.filename));
          }
          return "";
        })(),
        (async () => {
          try {
            const stagedTex = pending.find(p => p.path === texPath && p.operation === "upsert");
            if (stagedTex?.content) return stagedTex.content;
            if (this.store.mode === "local" && this.store.dirHandle) {
              return await readLocalFile(this.store.dirHandle, texPath);
            } else if (this.store.mode === "github" && this.store.config) {
              return await fetchFileContent(this.store.config, this.store.getFullPath(texPath));
            }
          } catch { }
          return "";
        })()
      ]);

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
        latex,
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
    info: { title?: string; author?: string; phase?: number | null; date?: string }
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
      this.store.metadata = {
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
      };
    }

    // 3. Mark pending save as true
    this.store.setPendingSave(true);

    // 4. Trigger debounced background save
    this.store.debouncedPersist();

    // 5. Notify reactive hooks/listeners
    this.store.notifyStateChange();
  }

  async updateEntry(id: string, latex: string, tiptapContent: string, info: { title: string; author: string; phase: number | null; date: string }) {
    this.updateDraft(tiptapContent, info);
    this.store.debouncedPersist.flush();
  }

  async saveDraft(id: string, latex: string, tiptapContent: string, info: { title: string; author: string; phase: number | null; date: string }) {
    let contentJson = JSON.parse(tiptapContent);
    // Handle double-stringification and wrapping
    if (typeof contentJson === 'string') {
      try { contentJson = JSON.parse(contentJson); } catch { }
    }
    if (contentJson && contentJson.content && !contentJson.type) {
      contentJson = contentJson.content;
    }

    // Ensure all tables, headings, codeBlocks, etc. have IDs!
    contentJson = ensureResourceIds(contentJson) as TipTapNode;
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

    this.store.metadata = validateNotebookIntegrity({
      ...this.store.metadata,
      entries: { ...this.store.metadata.entries, [id]: mergedEntry }
    });

    this.store.notifyStateChange();
    events.emit(EventNames.ENTRY_UPDATED, { id, ...info });

    if (info.author && info.author !== existingEntry.author) {
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

      // Save Entry JSON
      if (this.store.lastSavedContents.get(mergedEntry.filename) !== entryJsonStr) {
        await this.persistFile(mergedEntry.filename, entryJsonStr, `Auto-save: ${info.title}`);
        this.store.lastSavedContents.set(mergedEntry.filename, entryJsonStr);
      }

      // Save LaTeX
      const latexPath = `${LATEX_DIR}/${id}.tex`;
      if (this.store.lastSavedContents.get(latexPath) !== latex) {
        await this.persistFile(latexPath, latex, `Generate LaTeX: ${info.title}`);
        this.store.lastSavedContents.set(latexPath, latex);
      }

      // Cleanup orphaned assets
      await this.reconcileAssetRefs(existingEntry.assets || [], mergedEntry.assets || []);

      // Save Metadata
      await this.persistFile(INDEX_PATH, JSON.stringify(this.store.metadata, null, 2), "Auto-save metadata");
      await this.store.updateLatexMetadata();
    });
  }

  async createEntry() {
    const id = generateUUID();
    const createdAt = new Date().toISOString();
    const path = `${ENTRIES_DIR}/${id}.json`;
    const latexPath = `${LATEX_DIR}/${id}.tex`;

    const newEntry: EntryMetadata = {
      id,
      title: "",
      author: localStorage.getItem("nb-last-author") || "",
      phase: null,
      date: createdAt.split('T')[0], // Use simplified fallback or custom date if needed
      createdAt, updatedAt: createdAt, filename: path
    };

    const wrapper = { version: 3, content: { type: "doc", content: [{ type: "paragraph" }] } };
    const jsonStr = JSON.stringify(wrapper, null, 2);
    const initialLatex = `\\notebookentry{${newEntry.title}}{${createdAt.split('T')[0]}}{${newEntry.author}}{}{${id}}\n\n`;

    this.store.lastSavedContents.set(path, jsonStr);
    this.store.lastSavedContents.set(latexPath, initialLatex);

    this.store.metadata = validateNotebookIntegrity({
      ...this.store.metadata,
      entries: { ...this.store.metadata.entries, [id]: newEntry }
    });
    this.store.entries = [{ name: `${id}.json`, path }, ...this.store.entries];
    this.store.notifyStateChange();

    await this.store.enqueue(async () => {
      await this.persistFile(path, jsonStr, "New entry");
      await this.persistFile(latexPath, initialLatex, "Init LaTeX");
      await this.persistFile(INDEX_PATH, JSON.stringify(this.store.metadata, null, 2), "Create entry metadata");
      await this.store.updateLatexMetadata();
    });

    this.store.navigateTo({ entry: id });
    return id;
  }

  async duplicateEntry(sourceId: string, options?: { asTemplate?: boolean; title?: string }): Promise<string> {
    const sourceMeta = this.store.metadata.entries[sourceId];
    if (!sourceMeta) throw new Error("Source entry not found");

    // Flush any pending debounced edits first
    this.store.debouncedPersist.flush();

    // 1. Get raw content JSON from memory or disk
    let contentJson: TipTapNode = { type: "doc", content: [{ type: "paragraph" }] };
    if (this.store.openFile?.id === sourceId && this.store.openFile.tiptapContent) {
      try {
        contentJson = JSON.parse(this.store.openFile.tiptapContent);
      } catch {}
    } else {
      const raw = await this.store.getFileContent(sourceMeta.filename);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          contentJson = parsed.content || parsed;
        } catch {}
      }
    }

    // Ensure all resource nodes in duplicated doc get fresh unique IDs
    contentJson = ensureResourceIds(JSON.parse(JSON.stringify(contentJson)));

    const newId = generateUUID();
    const createdAt = new Date().toISOString();
    const newPath = `${ENTRIES_DIR}/${newId}.json`;
    const newLatexPath = `${LATEX_DIR}/${newId}.tex`;

    const isTemplate = options?.asTemplate ?? sourceMeta.isTemplate ?? false;
    let newTitle = options?.title;
    if (!newTitle) {
      if (options?.asTemplate && !sourceMeta.isTemplate) {
        newTitle = `${sourceMeta.title || "Untitled"} Template`;
      } else {
        newTitle = `${sourceMeta.title || "Untitled"} (Copy)`;
      }
    }

    const newEntry: EntryMetadata = {
      id: newId,
      title: newTitle,
      author: sourceMeta.author || localStorage.getItem("nb-last-author") || "",
      phase: sourceMeta.phase ?? null,
      date: isTemplate ? (sourceMeta.date || createdAt.split('T')[0]) : createdAt.split('T')[0],
      createdAt,
      updatedAt: createdAt,
      filename: newPath,
      isTemplate: isTemplate || undefined,
      resources: sourceMeta.resources ? { ...sourceMeta.resources } : undefined,
      assets: sourceMeta.assets ? [...sourceMeta.assets] : undefined
    };

    const wrapper = { version: 3, content: dehydrateAssets(contentJson) };
    const jsonStr = JSON.stringify(wrapper, null, 2);

    const { generateEntryLatex } = await import("../latex");
    const resourceTypes = buildResourceTypeIndex(this.store.metadata.entries, sourceMeta.resources, newId);
    const newLatex = generateEntryLatex(
      contentJson,
      newTitle,
      newEntry.author,
      newEntry.phase,
      createdAt,
      newId,
      resourceTypes,
      newEntry.date
    );

    this.store.lastSavedContents.set(newPath, jsonStr);
    this.store.lastSavedContents.set(newLatexPath, newLatex);

    this.store.metadata = validateNotebookIntegrity({
      ...this.store.metadata,
      entries: { ...this.store.metadata.entries, [newId]: newEntry }
    });
    this.store.entries = [{ name: `${newId}.json`, path: newPath }, ...this.store.entries];
    this.store.notifyStateChange();

    await this.store.enqueue(async () => {
      await this.persistFile(newPath, jsonStr, `Create entry: ${newTitle}`);
      await this.persistFile(newLatexPath, newLatex, `Init LaTeX for: ${newTitle}`);
      await this.persistFile(INDEX_PATH, JSON.stringify(this.store.metadata, null, 2), "Update notebook metadata");
      await this.store.updateLatexMetadata();
    });

    this.store.navigateTo({ entry: newId });
    return newId;
  }

  async createTemplate(templateData?: Partial<EntryMetadata>): Promise<string> {
    const id = generateUUID();
    const createdAt = new Date().toISOString();
    const path = `${ENTRIES_DIR}/${id}.json`;
    const latexPath = `${LATEX_DIR}/${id}.tex`;

    const newTemplate: EntryMetadata = {
      id,
      title: templateData?.title || "New Template",
      author: templateData?.author || localStorage.getItem("nb-last-author") || "",
      phase: templateData?.phase ?? null,
      date: templateData?.date || createdAt.split('T')[0],
      createdAt,
      updatedAt: createdAt,
      filename: path,
      isTemplate: true
    };

    const wrapper = { version: 3, content: { type: "doc", content: [{ type: "paragraph" }] } };
    const jsonStr = JSON.stringify(wrapper, null, 2);
    const initialLatex = `\\notebookentry{${newTemplate.title}}{${newTemplate.date}}{${newTemplate.author}}{}{${id}}\n\n`;

    this.store.lastSavedContents.set(path, jsonStr);
    this.store.lastSavedContents.set(latexPath, initialLatex);

    this.store.metadata = validateNotebookIntegrity({
      ...this.store.metadata,
      entries: { ...this.store.metadata.entries, [id]: newTemplate }
    });
    this.store.entries = [{ name: `${id}.json`, path }, ...this.store.entries];
    this.store.notifyStateChange();

    await this.store.enqueue(async () => {
      await this.persistFile(path, jsonStr, `Create template: ${newTemplate.title}`);
      await this.persistFile(latexPath, initialLatex, "Init template LaTeX");
      await this.persistFile(INDEX_PATH, JSON.stringify(this.store.metadata, null, 2), "Update notebook metadata");
    });

    this.store.navigateTo({ entry: id });
    return id;
  }

  async createEntryFromTemplate(templateId: string): Promise<string> {
    return this.duplicateEntry(templateId, {
      asTemplate: false,
      title: this.store.metadata.entries[templateId]?.title || "New Entry"
    });
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
    await this.refreshPending();
    this.store.notifyStateChange();
  }

  async discardEntryChanges(entryId: string) {
    if (this.store.mode !== "github" && this.store.mode !== "temporary") return;
    const dbName = this.store.getDBName();
    await this.store.queue;
    
    const entryJsonPath = `${ENTRIES_DIR}/${entryId}.json`;
    const entryTexPath = `${LATEX_DIR}/${entryId}.tex`;

    await removeStaged(dbName, entryJsonPath);
    await removeStaged(dbName, entryTexPath);
    this.store.lastSavedContents.delete(entryJsonPath);
    this.store.lastSavedContents.delete(entryTexPath);

    // If this entry was a newly created entry (never committed), clean it from memory
    const committed = await this.getCommittedFileContent(entryJsonPath);
    if (!committed) {
      this.store.metadata = validateNotebookIntegrity(removeEntryFromMetadata(this.store.metadata, entryId));
      this.store.entries = this.store.entries.filter(e => e.path !== entryJsonPath);
      if (this.store.openFile?.id === entryId) {
        this.store.openFile = null;
        this.store.navigateTo({ entry: null });
      }
    } else {
      try {
        await this.openEntry(entryId);
      } catch {}
    }

    await this.refreshPending();
    this.store.notifyStateChange();
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

      const { clearAllPending } = await import("../db");
      await clearAllPending(dbName);

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
    const updatedMeta = validateNotebookIntegrity(removeEntryFromMetadata(this.store.metadata, id));

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
      await this.persistFile(INDEX_PATH, JSON.stringify(this.store.metadata, null, 2), "Delete entry");
      await this.store.updateLatexMetadata();
    });
  }

  async updateLatexMetadata() {
    const entryDates = Object.values(this.store.metadata.entries)
      .map(e => e.date)
      .filter(Boolean)
      .sort();

    const startDate = entryDates.length > 0 ? entryDates[0] : "";
    const endDate = entryDates.length > 0 ? entryDates[entryDates.length - 1] : "";

    // Update team metadata in memory so generateTeamLatex picks it up
    const teamInfo = {
      teamName: "",
      teamNumber: "",
      organization: "",
      members: [],
      ...(this.store.metadata.team || {}),
      startDate: formatDateMonthYear(startDate),
      endDate: formatDateMonthYear(endDate)
    };

    const teamLatex = generateTeamLatex(teamInfo);
    const phasesLatex = generatePhasesLatex(this.store.metadata.phases || []);
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
