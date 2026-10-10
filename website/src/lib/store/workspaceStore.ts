import { NotebookMetadata, EMPTY_METADATA, TeamMetadata, ProjectPhase, EntryMetadata, hydrateTeamAssets, TipTapNode, buildResourceTypeIndex, extractResources, moveEntryOnCalendar, reorderTemplateSequence, serializeNotebookMetadata, formatAuthors, parseAuthors, normalizeNotebookMetadata } from "../notebook/metadata";
import { assetDeletesSafeToPush, cloneNotebookMetadata, collectEntryFileIds, entryArtifactPaths, isAssetPath, reconcileNotebookMerge } from "../notebook/mergeReconcile";
import { INDEX_PATH, ENTRIES_DIR, LATEX_DIR, TEAM_PATH, PHASES_PATH, ENTRIES_INDEX_PATH } from "../constants";
import { generateEntryLatex, generateTeamLatex, generatePhasesLatex, generateAllEntriesLatex, latexPhaseRef } from "../latex/latex";
import { ExplorerFile, GitHubConfig, TeamTab } from "../types";
import { Project, getAllPending, removeStaged, PendingChange, clearBaseMetadata, getBaseMetadata, stageChange } from "../storage/db";
import { events, EventNames } from "../events";
import { WorkspaceMode, OpenFileState, IWorkspaceStore, DebouncedFunction, ImportOptions } from "./types";
export type { WorkspaceMode, OpenFileState, DebouncedFunction };
import { debounceWithFlush, formatDateMonthYear } from "../utils";
import { ProjectManager } from "./projectManager";
import { EntryManager } from "./entryManager";
import { TransferManager } from "./transferManager";
import { TeamManager } from "./teamManager";
import { NavigationManager } from "./navigationManager";

class WorkspaceStore implements IWorkspaceStore {
  // ─── State ──────────────────────────────────────────────────────────────────
  public mode: WorkspaceMode = "none";
  public config: GitHubConfig | null = null;
  public dirHandle: FileSystemDirectoryHandle | null = null;
  public entries: ExplorerFile[] = [];
  public workspaceVersion: number = 0;
  public metadata: NotebookMetadata = EMPTY_METADATA;
  public baseMetadata: NotebookMetadata | null = null;
  public currentProjectId: string | null = null;
  public currentProject: Project | null = null;
  public hasEntryInUrl: boolean = false;
  public showTeamEditor: boolean = false;
  public teamTab: TeamTab = "identity";
  public showHelp: boolean = false;
  public helpPath: string | null = null;
  public showCompiler: boolean = false;
  public showCalendar: boolean = false;
  public calendarMode: "month" | "week" = "month";
  public calendarCursor: string = "";
  public showAbout: boolean = false;
  public showSettings: boolean = false;
  public openFile: OpenFileState | null = null;
  public isLoading = false;
  public loadingLabel = "";
  public isInitialized = false;
  public projects: Project[] = [];
  public pendingChanges: PendingChange[] = [];
  public isMainTexPresent: boolean = true;
  public assetCache = new Map<string, string>();
  public selectedPaths: Set<string> = new Set();
  public isSaving = false;
  public isPendingSave = false;
  public isDiscarding = false;
  public isCommitting = false;
  public needsPermission = false;

  // Internal persistence tracking
  public lastSavedContents = new Map<string, string>();
  public savingCount = 0;
  public queue = Promise.resolve();

  // Sub-managers
  private projectManager: ProjectManager;
  private entryManager: EntryManager;
  private transferManager: TransferManager;
  private teamManager: TeamManager;
  private navigationManager: NavigationManager;

  public debouncedPersist = debounceWithFlush(async () => {
    if (!this.openFile) return;
    const id = this.openFile.id;
    const tiptapContent = this.openFile.tiptapContent;
    const title = this.openFile.title;
    const authors = this.openFile.authors;
    const phase = this.openFile.phase;
    const date = this.openFile.date;

    let contentJson = null;
    try {
      contentJson = JSON.parse(tiptapContent);
    } catch { }

    const doc = contentJson && contentJson.content && !contentJson.type ? contentJson.content : contentJson;
    const resources = doc ? extractResources(doc as TipTapNode) : {};
    const resourceTypes = buildResourceTypeIndex(this.metadata.entries, resources, id);
    const latex = generateEntryLatex(
      tiptapContent,
      title,
      authors,
      latexPhaseRef(phase, this.metadata.phases),
      this.openFile.createdAt,
      id,
      resourceTypes,
      date
    );

    this.setPendingSave(false);
    await this.entryManager.saveDraft(id, latex, tiptapContent, { title, authors, phase, date });
  }, 800);

  get hydratedMetadata(): NotebookMetadata {
    return {
      ...this.metadata,
      team: this.metadata.team ? hydrateTeamAssets(this.metadata.team, this.assetCache) : undefined
    };
  }

  constructor() {
    this.projectManager = new ProjectManager(this);
    this.entryManager = new EntryManager(this);
    this.transferManager = new TransferManager(this);
    this.teamManager = new TeamManager(this);
    this.navigationManager = new NavigationManager(this);

    if (typeof window !== "undefined") {
      window.addEventListener("popstate", () => this.handleUrlChange());
    }
  }

  // ─── Initialization ─────────────────────────────────────────────────────────
  async initialize() {
    this.setLoading(true, "Loading workspace...");
    try {
      await this.refreshProjects();
      await this.handleUrlChange();
      this.isInitialized = true;
    } finally {
      this.setLoading(false);
    }
  }

  // ─── Delegated Navigation & URL Handling ────────────────────────────────────
  public async handleUrlChange(url?: URL) {
    return this.navigationManager.handleUrlChange(url);
  }

  public setSelectedPaths(pathsOrUpdater: Set<string> | ((prev: Set<string>) => Set<string>)) {
    return this.navigationManager.setSelectedPaths(pathsOrUpdater);
  }

  public navigateTo(params: Record<string, string | null>, pathname?: string, options?: { replace?: boolean }) {
    return this.navigationManager.navigateTo(params, pathname, options);
  }

  // ─── Delegated Project Management ───────────────────────────────────────────
  public async refreshProjects() {
    return this.projectManager.refreshProjects();
  }

  public async renameProject(id: string, name: string) {
    return this.projectManager.renameProject(id, name);
  }

  public async createGithubProject(config: { owner: string; repo: string; branch: string; folderPath: string; name: string }) {
    return this.projectManager.createGithubProject(config);
  }

  public async createLocalProject(handle: FileSystemDirectoryHandle, name: string) {
    return this.projectManager.createLocalProject(handle, name);
  }

  public async grantLocalPermission() {
    return this.projectManager.grantLocalPermission();
  }

  public async reselectLocalFolder() {
    return this.projectManager.reselectLocalFolder();
  }

  public async createTemporaryProject() {
    return this.projectManager.createTemporaryProject();
  }

  public async selectProject(id: string) {
    return this.projectManager.selectProject(id);
  }

  public async reloadWorkspace() {
    return this.projectManager.reloadWorkspace();
  }

  // ─── Delegated Entry Management ─────────────────────────────────────────────
  public async openEntry(id: string) {
    return this.entryManager.openEntry(id);
  }

  public updateDraft(tiptapContent: string | null, info: { title?: string; authors?: string[]; phase?: string | null; date?: string }) {
    return this.entryManager.updateDraft(tiptapContent, info);
  }

  public async updateEntry(id: string, latex: string, tiptapContent: string, info: { title: string; authors: string[]; phase: string | null; date: string }) {
    return this.entryManager.updateEntry(id, latex, tiptapContent, info);
  }

  public async createEntry() {
    return this.entryManager.createEntry();
  }

  public async createEntryFromTemplate(templateId: string) {
    return this.entryManager.createEntryFromTemplate(templateId);
  }

  public async repairDuplicateResourceIds() {
    return this.entryManager.repairDuplicateResourceIds();
  }

  public async syncAllEntryResourcesFromFiles() {
    return this.entryManager.syncAllEntryResourcesFromFiles();
  }

  public async duplicateEntry(sourceId: string, options?: { asTemplate?: boolean; title?: string; authors?: string[]; phase?: string | null; date?: string }) {
    return this.entryManager.duplicateEntry(sourceId, options);
  }

  public async createTemplate(templateData?: Partial<EntryMetadata>) {
    return this.entryManager.createTemplate(templateData);
  }

  public async refreshPending() {
    return this.entryManager.refreshPending();
  }

  public setEntryValidity(id: string, isValid: boolean, validationErrors?: string[]) {
    return this.entryManager.setEntryValidity(id, isValid, validationErrors);
  }

  public async discardPendingChanges() {
    return this.entryManager.discardPendingChanges();
  }

  public async discardPathChange(path: string) {
    return this.entryManager.discardPathChange(path);
  }

  public async discardEntryChanges(entryId: string) {
    return this.entryManager.discardEntryChanges(entryId);
  }

  public async discardTeamChanges() {
    return this.entryManager.discardTeamChanges();
  }

  public async discardPhaseChanges() {
    return this.entryManager.discardPhaseChanges();
  }

  public async deleteEntry(file: ExplorerFile) {
    return this.entryManager.deleteEntry(file);
  }

  public async updateLatexMetadata() {
    return this.entryManager.updateLatexMetadata();
  }

  public async persistFile(path: string, content: string, label: string, isBase64?: boolean) {
    return this.entryManager.persistFile(path, content, label, isBase64);
  }

  public async reconcileAssetRefs(oldRefs: string[] | Record<string, string[]>, newRefs: string[] | Record<string, string[]>) {
    return this.entryManager.reconcileAssetRefs(oldRefs, newRefs);
  }

  public async shouldStageDelete(path: string) {
    return this.entryManager.shouldStageDelete(path);
  }

  public async getCommittedFileContent(path: string, isBase64?: boolean) {
    return this.entryManager.getCommittedFileContent(path, isBase64);
  }

  // ─── Delegated Team & Compile Management ────────────────────────────────────
  public async saveTeam(team: TeamMetadata, phases?: Record<string, ProjectPhase>) {
    return this.teamManager.saveTeam(team, phases);
  }

  public async reorderCalendarEntry(movedId: string, targetDate: string, dayIds: string[], toIndex: number) {
    this.metadata = moveEntryOnCalendar(this.metadata, movedId, targetDate, dayIds, toIndex);
    // Keep the open editor in sync — otherwise the next auto-save writes the old date
    // back into notebook.json and clears the pending metadata change.
    if (this.openFile?.id === movedId) {
      this.openFile = { ...this.openFile, date: targetDate, updatedAt: new Date().toISOString() };
    }
    this.notifyStateChange();
    await this.enqueue(async () => {
      await this.persistFile(INDEX_PATH, serializeNotebookMetadata(this.metadata), "Reorder calendar entries");
      const entry = this.metadata.entries[movedId];
      if (entry && !entry.isTemplate) {
        const latexPath = `${LATEX_DIR}/${movedId}.tex`;
        let contentJson: TipTapNode | null = null;
        try {
          const raw = this.lastSavedContents.get(entry.filename)
            || await this.getFileContent(entry.filename);
          if (raw) {
            const parsed = JSON.parse(raw);
            contentJson = parsed?.content && !parsed.type ? parsed.content : parsed;
          }
        } catch { /* fall through */ }
        if (contentJson) {
          const resources = extractResources(contentJson);
          const resourceTypes = buildResourceTypeIndex(this.metadata.entries, resources, movedId);
          const latex = generateEntryLatex(
            JSON.stringify(contentJson),
            entry.title,
            entry.authors,
            latexPhaseRef(entry.phase, this.metadata.phases),
            entry.createdAt,
            movedId,
            resourceTypes,
            entry.date
          );
          await this.persistFile(latexPath, latex, `Update date LaTeX: ${entry.title}`);
          this.lastSavedContents.set(latexPath, latex);
        }
      }
      await this.updateLatexMetadata();
    });
  }

  public async reorderTemplates(templateIds: string[]) {
    this.metadata = reorderTemplateSequence(this.metadata, templateIds);
    this.notifyStateChange();
    await this.enqueue(async () => {
      await this.persistFile(INDEX_PATH, serializeNotebookMetadata(this.metadata), "Reorder templates");
    });
  }

  public async hydrateTeamAssets() {
    return this.teamManager.hydrateTeamAssetsOnDemand();
  }

  public async saveCompiledPdf(pdfData: Uint8Array) {
    return this.teamManager.saveCompiledPdf(pdfData);
  }

  public async getCompiledPdfUrl() {
    return this.teamManager.getCompiledPdfUrl();
  }

  // ─── Delegated Transfer & Archive Management ─────────────────────────────────
  public async getFileContent(path: string) {
    return this.transferManager.getFileContent(path);
  }

  public async getBaseFileContent(path: string) {
    return this.transferManager.getBaseFileContent(path);
  }

  public async getAssetBase64(path: string) {
    return this.transferManager.getAssetBase64(path);
  }

  public async exportEntries(entryIds?: string[], mode?: 'data-only' | 'full') {
    return this.transferManager.exportEntries(entryIds, mode);
  }

  public async exportNotebook(mode?: 'data-only' | 'full') {
    return this.transferManager.exportNotebook(mode);
  }

  public async importNotebook(data: Record<string, unknown>, options?: ImportOptions) {
    return this.transferManager.importNotebook(data, options);
  }

  public async importNotebookArchive(file: File, options?: ImportOptions) {
    return this.transferManager.importNotebookArchive(file, options);
  }

  // ─── Sync / Git Operations ──────────────────────────────────────────────────

  /**
   * Rewrite staged notebook.json by 3-way merging with live remote.
   * Without this, Source Control diffs compare a stale full-index snapshot to
   * remote and look like User B is deleting User A's newly added assets —
   * even when B only edited a different entry.
   */
  public async reconcileStagedIndexWithRemote(): Promise<boolean> {
    if (this.mode !== "github") return false;
    const dbName = this.getDBName();
    const all = await getAllPending(dbName);
    const pendingIndex = all.find((p) => p.path === INDEX_PATH && p.operation === "upsert");
    if (!pendingIndex?.content) return false;

    const remoteIndexContent = await this.transferManager.getBaseFileContent(INDEX_PATH);
    if (!remoteIndexContent) return false;

    try {
      const remoteMetadata = normalizeNotebookMetadata({
        ...EMPTY_METADATA,
        ...JSON.parse(remoteIndexContent),
      });
      const persistedBase = await getBaseMetadata(dbName);
      const baseMetadata = persistedBase
        ? normalizeNotebookMetadata({ ...EMPTY_METADATA, ...persistedBase })
        : this.baseMetadata
          ? cloneNotebookMetadata(this.baseMetadata)
          : null;

      let localMetadata: NotebookMetadata;
      try {
        localMetadata = normalizeNotebookMetadata({
          ...EMPTY_METADATA,
          ...JSON.parse(pendingIndex.content),
        });
      } catch {
        localMetadata = this.metadata;
      }

      const { fileIds, pendingUpsertIds, pendingDeleteIds } = collectEntryFileIds(
        this.entries.map((e) => e.path),
        all
      );
      const { merged } = reconcileNotebookMerge(baseMetadata, localMetadata, remoteMetadata, {
        fileIds,
        pendingUpsertIds,
        pendingDeleteIds,
      });

      const mergedStr = serializeNotebookMetadata(merged);
      if (mergedStr === pendingIndex.content) {
        // Still refresh in-memory index if it lagged the staged merge.
        if (serializeNotebookMetadata(this.metadata) !== mergedStr) {
          this.metadata = merged;
          this.notifyStateChange();
        }
        return false;
      }

      this.metadata = merged;
      await stageChange(dbName, {
        path: INDEX_PATH,
        content: mergedStr,
        operation: "upsert",
        changeType: pendingIndex.changeType || "update",
        label: pendingIndex.label || "Merge remote notebook metadata",
        stagedAt: new Date().toISOString(),
      });
      await this.refreshPending();
      this.notifyStateChange();
      return true;
    } catch (err) {
      console.warn("Failed to reconcile staged notebook.json with remote:", err);
      return false;
    }
  }

  async commitAll(config: GitHubConfig, customMessage?: string) {
    this.isCommitting = true;
    this.notifyStateChange();
    const currentOpenId = this.openFile?.id ?? null;
    try {
      await this.queue;
      // Fold remote-only index changes into staged notebook.json before building the push set.
      await this.reconcileStagedIndexWithRemote();
      const dbName = this.getDBName();
      const all = await getAllPending(dbName);
      const { commitChanges } = await import("../github/github");
      const { clearAllPending } = await import("../storage/db");

      const gitChanges: { path: string; content: string | null; isBinary: boolean }[] = [];

      for (const change of all) {
        const isBinary = change.path.includes("resources/") || /\.(png|jpg|jpeg|gif|webp|pdf)$/i.test(change.path);
        const nextContent = change.operation === "delete"
          ? null
          : (change.content?.startsWith("data:") ? change.content.split(",")[1] : (change.content ?? ""));

        const committedContent = await this.getCommittedFileContent(change.path, isBinary);

        if (change.operation === "delete") {
          if (committedContent === null) {
            await removeStaged(dbName, change.path);
            continue;
          }
        } else if (committedContent !== null && committedContent === nextContent) {
          await removeStaged(dbName, change.path);
          continue;
        }

        gitChanges.push({ path: this.getFullPath(change.path), content: nextContent, isBinary });
      }

      if (gitChanges.length === 0) {
        await clearAllPending(dbName);
        await this.refreshPending();
        events.emit(EventNames.SHOW_NOTIFICATION, { message: "Nothing to sync to GitHub.", type: "info" });
        return;
      }

      // Check if remote notebook.json has changed since last loaded, and 3-way merge if necessary
      const remoteIndexPath = this.getFullPath(INDEX_PATH);
      const remoteIndexContent = await this.transferManager.getBaseFileContent(INDEX_PATH);
      if (remoteIndexContent) {
        try {
          const remoteMetadata = normalizeNotebookMetadata({ ...EMPTY_METADATA, ...JSON.parse(remoteIndexContent) });
          const persistedBase = await getBaseMetadata(dbName);
          const baseMetadata = persistedBase
            ? normalizeNotebookMetadata({ ...EMPTY_METADATA, ...persistedBase })
            : (this.baseMetadata ? cloneNotebookMetadata(this.baseMetadata) : null);

          // Prefer staged notebook.json as local — it is what we would push without merging.
          const pendingIndex = all.find((p) => p.path === INDEX_PATH && p.operation === "upsert");
          let localMetadata = this.metadata;
          if (pendingIndex?.content) {
            try {
              localMetadata = normalizeNotebookMetadata({
                ...EMPTY_METADATA,
                ...JSON.parse(pendingIndex.content),
              });
            } catch (err) {
              console.warn("Failed to parse pending notebook.json for merge; using in-memory metadata:", err);
            }
          }

          const { fileIds, pendingUpsertIds, pendingDeleteIds } = collectEntryFileIds(this.entries.map(e => e.path), all);
          const { merged, hasCollisions, collidingEntryIds, conflictKinds, orphanIds } = reconcileNotebookMerge(
            baseMetadata,
            localMetadata,
            remoteMetadata,
            { fileIds, pendingUpsertIds, pendingDeleteIds }
          );

          if (hasCollisions && collidingEntryIds.length > 0) {
            // Level 2: Prompt user for resolution choice on conflicting entries
            const conflictsList = collidingEntryIds.map(id => {
              const localMeta = localMetadata.entries[id] || this.metadata.entries[id];
              const remoteMeta = remoteMetadata.entries?.[id];
              const kind = conflictKinds[id] || "both_edited";
              return {
                id,
                kind,
                localTitle: kind === "local_delete_remote_edit"
                  ? (baseMetadata?.entries?.[id]?.title || remoteMeta?.title || "Untitled")
                  : (localMeta?.title || "Untitled"),
                remoteTitle: kind === "local_edit_remote_delete"
                  ? (baseMetadata?.entries?.[id]?.title || localMeta?.title || "Untitled")
                  : (remoteMeta?.title || "Untitled"),
                localAuthor: formatAuthors(localMeta?.authors || baseMetadata?.entries?.[id]?.authors),
                remoteAuthor: formatAuthors(parseAuthors(
                  remoteMeta && typeof remoteMeta === "object" ? (remoteMeta as { authors?: unknown; author?: unknown }).authors : undefined,
                  remoteMeta && typeof remoteMeta === "object" ? (remoteMeta as { authors?: unknown; author?: unknown }).author : undefined
                )),
                localDate: localMeta?.date || baseMetadata?.entries?.[id]?.date,
                remoteDate: remoteMeta?.date || baseMetadata?.entries?.[id]?.date,
                localUpdatedAt: localMeta?.updatedAt,
                remoteUpdatedAt: remoteMeta?.updatedAt,
              };
            });

            const resolutions = await new Promise<Record<string, "keep_local" | "keep_remote" | "duplicate"> | null>(resolve => {
              events.emit(EventNames.PROMPT_MERGE_CONFLICT, {
                conflicts: conflictsList,
                resolve,
              });
            });

            if (!resolutions) {
              // User cancelled conflict resolution modal
              events.emit(EventNames.SHOW_NOTIFICATION, { message: "Sync cancelled by user.", type: "info" });
              return;
            }

            // Apply resolution actions
            for (const [entryId, action] of Object.entries(resolutions)) {
              const kind = conflictKinds[entryId] || "both_edited";
              const entryJsonPath = `${ENTRIES_DIR}/${entryId}.json`;
              const entryTexPath = `${LATEX_DIR}/${entryId}.tex`;
              const remoteEntryJson = this.getFullPath(entryJsonPath);
              const remoteEntryTex = this.getFullPath(entryTexPath);

              const removeFromGitChanges = () => {
                const jsonIdx = gitChanges.findIndex(c => c.path === remoteEntryJson);
                if (jsonIdx >= 0) gitChanges.splice(jsonIdx, 1);
                const texIdx = gitChanges.findIndex(c => c.path === remoteEntryTex);
                if (texIdx >= 0) gitChanges.splice(texIdx, 1);
              };

              const stageDeleteInGitChanges = () => {
                const jsonIdx = gitChanges.findIndex(c => c.path === remoteEntryJson);
                if (jsonIdx >= 0) gitChanges[jsonIdx].content = null;
                else gitChanges.push({ path: remoteEntryJson, content: null, isBinary: false });
                const texIdx = gitChanges.findIndex(c => c.path === remoteEntryTex);
                if (texIdx >= 0) gitChanges[texIdx].content = null;
                else gitChanges.push({ path: remoteEntryTex, content: null, isBinary: false });
              };

              if (kind === "local_edit_remote_delete") {
                if (action === "keep_remote") {
                  // Accept remote delete — drop local upserts and remove from index.
                  delete merged.entries[entryId];
                  removeFromGitChanges();
                  stageDeleteInGitChanges();
                  await removeStaged(dbName, entryJsonPath);
                  await removeStaged(dbName, entryTexPath);
                  await stageChange(dbName, { path: entryJsonPath, operation: "delete", label: "Accept remote delete", stagedAt: new Date().toISOString() });
                  await stageChange(dbName, { path: entryTexPath, operation: "delete", label: "Accept remote delete", stagedAt: new Date().toISOString() });
                  this.lastSavedContents.delete(entryJsonPath);
                  this.lastSavedContents.delete(entryTexPath);
                } else if (action === "duplicate") {
                  // Save local work as a new entry; accept remote delete of the original.
                  const localMeta = localMetadata.entries[entryId] || this.metadata.entries[entryId];
                  const newId = await this.entryManager.duplicateEntry(entryId, {
                    title: `${localMeta?.title || "Entry"} (Conflicted Copy)`,
                    authors: localMeta?.authors,
                    phase: localMeta?.phase ?? null,
                    date: localMeta?.date,
                  });
                  delete merged.entries[entryId];
                  const duplicatedMeta = this.metadata.entries[newId];
                  if (duplicatedMeta) {
                    merged.entries[newId] = duplicatedMeta;
                    const newJsonPath = this.getFullPath(`${ENTRIES_DIR}/${newId}.json`);
                    const newTexPath = this.getFullPath(`${LATEX_DIR}/${newId}.tex`);
                    const newJsonContent = await this.getFileContent(`${ENTRIES_DIR}/${newId}.json`);
                    const newTexContent = await this.getFileContent(`${LATEX_DIR}/${newId}.tex`);
                    if (newJsonContent) gitChanges.push({ path: newJsonPath, content: newJsonContent, isBinary: false });
                    if (newTexContent) gitChanges.push({ path: newTexPath, content: newTexContent, isBinary: false });
                  }
                  removeFromGitChanges();
                  stageDeleteInGitChanges();
                  await removeStaged(dbName, entryJsonPath);
                  await removeStaged(dbName, entryTexPath);
                  await stageChange(dbName, { path: entryJsonPath, operation: "delete", label: "Accept remote delete", stagedAt: new Date().toISOString() });
                  await stageChange(dbName, { path: entryTexPath, operation: "delete", label: "Accept remote delete", stagedAt: new Date().toISOString() });
                }
                // keep_local: leave local entry in merged + push upserts (default)
              } else if (kind === "local_delete_remote_edit") {
                if (action === "keep_local") {
                  // Confirm local delete — drop remote edits.
                  delete merged.entries[entryId];
                  stageDeleteInGitChanges();
                  await stageChange(dbName, { path: entryJsonPath, operation: "delete", label: "Delete entry", stagedAt: new Date().toISOString() });
                  await stageChange(dbName, { path: entryTexPath, operation: "delete", label: "Delete LaTeX", stagedAt: new Date().toISOString() });
                } else {
                  // keep_remote (or duplicate): undo local delete, keep remote content.
                  merged.entries[entryId] = remoteMetadata.entries[entryId];
                  removeFromGitChanges();
                  await removeStaged(dbName, entryJsonPath);
                  await removeStaged(dbName, entryTexPath);
                  this.lastSavedContents.delete(entryJsonPath);
                  this.lastSavedContents.delete(entryTexPath);
                }
              } else if (action === "keep_remote") {
                // Discard local edits for this entry
                merged.entries[entryId] = remoteMetadata.entries[entryId];
                removeFromGitChanges();
                await removeStaged(dbName, entryJsonPath);
                await removeStaged(dbName, entryTexPath);
                this.lastSavedContents.delete(entryJsonPath);
                this.lastSavedContents.delete(entryTexPath);
              } else if (action === "duplicate") {
                // Keep remote version at entryId, duplicate local version as a new entry with copy title
                const localMeta = localMetadata.entries[entryId] || this.metadata.entries[entryId];
                const newId = await this.entryManager.duplicateEntry(entryId, {
                  title: `${localMeta?.title || "Entry"} (Conflicted Copy)`,
                  authors: localMeta?.authors,
                  phase: localMeta?.phase ?? null,
                  date: localMeta?.date,
                });

                // Set original entry in merged metadata to remote version
                merged.entries[entryId] = remoteMetadata.entries[entryId];
                // Include duplicated entry in merged metadata
                const duplicatedMeta = this.metadata.entries[newId];
                if (duplicatedMeta) {
                  merged.entries[newId] = duplicatedMeta;
                  const newJsonPath = this.getFullPath(`${ENTRIES_DIR}/${newId}.json`);
                  const newTexPath = this.getFullPath(`${LATEX_DIR}/${newId}.tex`);
                  const newJsonContent = await this.getFileContent(`${ENTRIES_DIR}/${newId}.json`);
                  const newTexContent = await this.getFileContent(`${LATEX_DIR}/${newId}.tex`);
                  if (newJsonContent) gitChanges.push({ path: newJsonPath, content: newJsonContent, isBinary: false });
                  if (newTexContent) gitChanges.push({ path: newTexPath, content: newTexContent, isBinary: false });
                }

                // Remove original entry from staged since remote has it
                removeFromGitChanges();
                await removeStaged(dbName, entryJsonPath);
                await removeStaged(dbName, entryTexPath);
              }
              // "keep_local" keeps merged.entries[entryId] = local version (default in merged)
            }
          }

          for (const id of orphanIds) {
            const { jsonPath, texPath } = entryArtifactPaths(id);
            const fullJson = this.getFullPath(jsonPath);
            const fullTex = this.getFullPath(texPath);
            const jsonIdx = gitChanges.findIndex(c => c.path === fullJson);
            if (jsonIdx >= 0) gitChanges[jsonIdx].content = null;
            else gitChanges.push({ path: fullJson, content: null, isBinary: false });
            const texIdx = gitChanges.findIndex(c => c.path === fullTex);
            if (texIdx >= 0) gitChanges[texIdx].content = null;
            else gitChanges.push({ path: fullTex, content: null, isBinary: false });
            await stageChange(dbName, { path: jsonPath, operation: "delete", label: "Remove orphaned entry", stagedAt: new Date().toISOString() });
            await stageChange(dbName, { path: texPath, operation: "delete", label: "Remove orphaned LaTeX", stagedAt: new Date().toISOString() });
            this.entries = this.entries.filter(e => e.path !== jsonPath);
          }

          this.metadata = merged;

          // Drop stale orphan asset deletes that would remove files still referenced
          // by the merged (or remote) index — e.g. B cleaned up a shared hash while A still uses it.
          const pendingAssetDeletes = all
            .filter((p) => p.operation === "delete" && isAssetPath(p.path))
            .map((p) => p.path);
          if (pendingAssetDeletes.length > 0) {
            const { drop } = assetDeletesSafeToPush(pendingAssetDeletes, merged, remoteMetadata);
            for (const path of drop) {
              const full = this.getFullPath(path);
              const idx = gitChanges.findIndex((c) => c.path === full && c.content === null);
              if (idx >= 0) gitChanges.splice(idx, 1);
              await removeStaged(dbName, path);
            }
          }

          const mergedIndexStr = serializeNotebookMetadata(merged);
          const remoteNormalizedStr = serializeNotebookMetadata(remoteMetadata);
          const isMetadataModified = mergedIndexStr !== remoteNormalizedStr;
          
          const indexChangeIdx = gitChanges.findIndex(c => c.path === remoteIndexPath);
          if (isMetadataModified) {
            if (indexChangeIdx >= 0) {
              gitChanges[indexChangeIdx].content = mergedIndexStr;
            } else {
              gitChanges.push({ path: remoteIndexPath, content: mergedIndexStr, isBinary: false });
            }
          } else {
            // If merged metadata is identical to remote, remove notebook.json from gitChanges and staged
            if (indexChangeIdx >= 0) {
              gitChanges.splice(indexChangeIdx, 1);
            }
            await removeStaged(dbName, INDEX_PATH);
            this.lastSavedContents.delete(INDEX_PATH);
          }

          // Re-generate derivative LaTeX files from the merged metadata
          const regularEntries = Object.values(merged.entries)
            .filter(e => !e.isTemplate && Boolean(e.date));

          const entryDates = regularEntries
            .map(e => e.date)
            .sort();

          const autoStartDate = entryDates.length > 0 ? entryDates[0] : "";
          const autoEndDate = entryDates.length > 0 ? entryDates[entryDates.length - 1] : "";

          const rawTeam: Partial<TeamMetadata> = merged.team || {};
          const isAuto = rawTeam.autoCalculateDates ?? true;
          const effectiveStartDate = (!isAuto && rawTeam.startDate) ? rawTeam.startDate : formatDateMonthYear(autoStartDate);
          const effectiveEndDate = (!isAuto && rawTeam.endDate) ? rawTeam.endDate : formatDateMonthYear(autoEndDate);

          const teamInfo = {
            teamName: "",
            teamNumber: "",
            organization: "",
            members: {},
            ...rawTeam,
            startDate: effectiveStartDate,
            endDate: effectiveEndDate,
          };

          const teamTexContent = generateTeamLatex(teamInfo);
          const phasesTexContent = generatePhasesLatex(merged.phases || {});
          const entriesTexContent = generateAllEntriesLatex(merged);

          const fullTeamPath = this.getFullPath(TEAM_PATH);
          const fullPhasesPath = this.getFullPath(PHASES_PATH);
          const fullEntriesTexPath = this.getFullPath(ENTRIES_INDEX_PATH);

          const updateOrPushChange = (filePath: string, content: string) => {
            const idx = gitChanges.findIndex(c => c.path === filePath);
            if (idx >= 0) {
              gitChanges[idx].content = content;
            } else {
              gitChanges.push({ path: filePath, content, isBinary: false });
            }
          };

          // Compare against remote base to avoid sending unchanged derivative files
          const remoteTeamTex = await this.transferManager.getBaseFileContent(TEAM_PATH);
          if (remoteTeamTex !== teamTexContent) {
            updateOrPushChange(fullTeamPath, teamTexContent);
          } else {
            const idx = gitChanges.findIndex(c => c.path === fullTeamPath);
            if (idx >= 0) gitChanges.splice(idx, 1);
            await removeStaged(dbName, TEAM_PATH);
          }

          const remotePhasesTex = await this.transferManager.getBaseFileContent(PHASES_PATH);
          if (remotePhasesTex !== phasesTexContent) {
            updateOrPushChange(fullPhasesPath, phasesTexContent);
          } else {
            const idx = gitChanges.findIndex(c => c.path === fullPhasesPath);
            if (idx >= 0) gitChanges.splice(idx, 1);
            await removeStaged(dbName, PHASES_PATH);
          }

          const remoteEntriesTex = await this.transferManager.getBaseFileContent(ENTRIES_INDEX_PATH);
          if (remoteEntriesTex !== entriesTexContent) {
            updateOrPushChange(fullEntriesTexPath, entriesTexContent);
          } else {
            const idx = gitChanges.findIndex(c => c.path === fullEntriesTexPath);
            if (idx >= 0) gitChanges.splice(idx, 1);
            await removeStaged(dbName, ENTRIES_INDEX_PATH);
          }
        } catch (mergeErr) {
          console.warn("Failed to 3-way merge remote metadata:", mergeErr);
        }
      }

      if (gitChanges.length === 0) {
        await clearAllPending(dbName);
        await clearBaseMetadata(dbName);
        await this.reloadWorkspace();
        this.workspaceVersion++;

        if (currentOpenId) {
          if (this.metadata.entries[currentOpenId]) {
            await this.openEntry(currentOpenId);
          } else {
            this.openFile = null;
            this.navigateTo({ entry: null });
          }
        }

        await this.refreshPending();
        events.emit(EventNames.SHOW_NOTIFICATION, { message: "Local changes discarded. Workspace updated to latest GitHub version.", type: "info" });
        return;
      }

      const finalMsg = customMessage
        ? `${customMessage} (Updated ${gitChanges.length} ${gitChanges.length === 1 ? "file" : "files"})`
        : `Update notebook: ${gitChanges.length} ${gitChanges.length === 1 ? "file" : "files"}`;

      try {
        await commitChanges(config, gitChanges, finalMsg);
      } catch (pushErr: unknown) {
        const status = (pushErr as { status?: number })?.status;
        const msg = status === 422 || status === 409
          ? "GitHub moved ahead while syncing. Your changes are still staged — sync again to re-merge."
          : ((pushErr as Error)?.message || "Failed to push changes to GitHub.");
        events.emit(EventNames.SHOW_NOTIFICATION, { message: msg, type: "error" });
        throw pushErr;
      }
      await clearAllPending(dbName);
      await clearBaseMetadata(dbName);
      await this.reloadWorkspace();
      this.workspaceVersion++;

      // If the currently open file was affected by the commit or conflict resolution, reload it fresh from remote
      if (currentOpenId) {
        if (this.metadata.entries[currentOpenId]) {
          await this.openEntry(currentOpenId);
        } else {
          this.openFile = null;
          this.navigateTo({ entry: null });
        }
      }

      await this.refreshPending();
    } finally {
      this.isCommitting = false;
      this.notifyStateChange();
    }
  }

  // ─── State & Persistence Core Helpers ───────────────────────────────────────
  public getDBName() {
    const id = this.currentProjectId || "default";
    return `notebook-project-${id}`;
  }

  public getFullPath(path: string): string {
    if (!this.config) return path;
    const baseDir = this.config.baseDir ? this.config.baseDir.replace(/^\/+|\/+$/g, '') : '';
    if (!baseDir) return path;
    const prefix = baseDir + '/';
    if (path.startsWith(prefix)) return path;
    return `${prefix}${path}`;
  }

  public setLoading(val: boolean, label: string = "Loading...") {
    this.isLoading = val;
    this.loadingLabel = label;
    this.notifyStateChange();
    events.emit(EventNames.LOADING_STATUS, val);
  }

  public notifyStateChange() {
    events.emit(EventNames.STATE_CHANGED, this);
  }

  public setPendingSave(val: boolean) {
    if (this.isPendingSave !== val) {
      this.isPendingSave = val;
      this.notifyStateChange();
    }
  }

  public enqueue(op: () => Promise<void>): Promise<void> {
    this.savingCount++;
    if (!this.isSaving) {
      this.isSaving = true;
      this.notifyStateChange();
    }

    const p = this.queue = this.queue.then(async () => {
      try {
        await op();
      } catch (e) {
        console.error("Background persistence error:", e);
      } finally {
        this.savingCount--;
        if (this.savingCount === 0) {
          this.isSaving = false;
          try {
            const dbName = this.getDBName();
            this.pendingChanges = await getAllPending(dbName);
          } catch (err) {
            console.error("Failed to refresh pending changes after save queue:", err);
          }
          this.notifyStateChange();
          events.emit(EventNames.PERSISTENCE_SYNC);
        }
      }
    });

    return p;
  }

  public async disconnect() {
    await this.debouncedPersist.flush();
    this.setLoading(true, "Closing workspace...");
    try {
      await this.queue;

      this.mode = "none";
      this.currentProjectId = null;
      this.currentProject = null;
      this.dirHandle = null;
      this.config = null;
      this.entries = [];
      this.metadata = EMPTY_METADATA;
      this.openFile = null;
      this.selectedPaths = new Set();
      this.assetCache.clear();
      this.needsPermission = false;
      this.notifyStateChange();
    } finally {
      this.setLoading(false);
    }
  }
}

export const store = new WorkspaceStore();
