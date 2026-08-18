import { NotebookMetadata, EMPTY_METADATA, TeamMetadata, ProjectPhase, EntryMetadata, hydrateTeamAssets, TipTapNode, buildResourceTypeIndex, extractResources, mergeNotebookMetadata } from "./metadata";
import { INDEX_PATH, ENTRIES_DIR, LATEX_DIR, TEAM_PATH, PHASES_PATH, ENTRIES_INDEX_PATH } from "./constants";
import { generateEntryLatex, generateTeamLatex, generatePhasesLatex, generateAllEntriesLatex } from "./latex";
import { ExplorerFile, GitHubConfig, TeamTab } from "./types";
import { Project, getAllPending, removeStaged, PendingChange, clearBaseMetadata } from "./db";
import { events, EventNames } from "./events";
import { WorkspaceMode, OpenFileState, IWorkspaceStore, DebouncedFunction, ImportOptions } from "./store/types";
export type { WorkspaceMode, OpenFileState, DebouncedFunction };
import { debounceWithFlush, formatDateMonthYear } from "./utils";
import { ProjectManager } from "./store/projectManager";
import { EntryManager } from "./store/entryManager";
import { TransferManager } from "./store/transferManager";
import { TeamManager } from "./store/teamManager";
import { NavigationManager } from "./store/navigationManager";

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
  public showAbout: boolean = false;
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
    const author = this.openFile.author;
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
      author,
      phase === null ? "" : phase,
      this.openFile.createdAt,
      id,
      resourceTypes,
      date
    );

    this.setPendingSave(false);
    await this.entryManager.saveDraft(id, latex, tiptapContent, { title, author, phase, date });
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

  public navigateTo(params: Record<string, string | null>, pathname?: string) {
    return this.navigationManager.navigateTo(params, pathname);
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

  public updateDraft(tiptapContent: string | null, info: { title?: string; author?: string; phase?: number | null; date?: string }) {
    return this.entryManager.updateDraft(tiptapContent, info);
  }

  public async updateEntry(id: string, latex: string, tiptapContent: string, info: { title: string; author: string; phase: number | null; date: string }) {
    return this.entryManager.updateEntry(id, latex, tiptapContent, info);
  }

  public async createEntry() {
    return this.entryManager.createEntry();
  }

  public async duplicateEntry(sourceId: string, options?: { asTemplate?: boolean; title?: string }) {
    return this.entryManager.duplicateEntry(sourceId, options);
  }

  public async createTemplate(templateData?: Partial<EntryMetadata>) {
    return this.entryManager.createTemplate(templateData);
  }

  public async createEntryFromTemplate(templateId: string) {
    return this.entryManager.createEntryFromTemplate(templateId);
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
  public async saveTeam(team: TeamMetadata, phases?: ProjectPhase[]) {
    return this.teamManager.saveTeam(team, phases);
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
  async commitAll(config: GitHubConfig, customMessage?: string) {
    this.isCommitting = true;
    this.notifyStateChange();
    const currentOpenId = this.openFile?.id ?? null;
    try {
      await this.queue;
      const dbName = this.getDBName();
      const all = await getAllPending(dbName);
      const { commitChanges } = await import("./github");
      const { clearAllPending } = await import("./db");

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

      const changesCount = gitChanges.length;
      // Check if remote notebook.json has changed since last loaded, and 3-way merge if necessary
      const remoteIndexPath = this.getFullPath(INDEX_PATH);
      const remoteIndexContent = await this.transferManager.getBaseFileContent(INDEX_PATH);
      if (remoteIndexContent) {
        try {
          const remoteMetadata = JSON.parse(remoteIndexContent);
          const baseIndex = await this.getCommittedFileContent(INDEX_PATH);
          const baseMetadata = this.baseMetadata || (baseIndex ? JSON.parse(baseIndex) : null);
          const { merged, hasCollisions, collidingEntryIds } = mergeNotebookMetadata(baseMetadata, this.metadata, remoteMetadata);

          if (hasCollisions && collidingEntryIds.length > 0) {
            // Level 2: Prompt user for resolution choice on conflicting entries
            const conflictsList = collidingEntryIds.map(id => {
              const localMeta = this.metadata.entries[id];
              const remoteMeta = remoteMetadata.entries?.[id];
              return {
                id,
                localTitle: localMeta?.title || "Untitled",
                remoteTitle: remoteMeta?.title || "Untitled",
                localAuthor: localMeta?.author,
                remoteAuthor: remoteMeta?.author,
                localDate: localMeta?.date,
                remoteDate: remoteMeta?.date,
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
              if (action === "keep_remote") {
                // Discard local edits for this entry
                merged.entries[entryId] = remoteMetadata.entries[entryId];
                const entryJsonPath = `${ENTRIES_DIR}/${entryId}.json`;
                const entryTexPath = `${LATEX_DIR}/${entryId}.tex`;
                const remoteEntryJson = this.getFullPath(entryJsonPath);
                const remoteEntryTex = this.getFullPath(entryTexPath);

                const jsonIdx = gitChanges.findIndex(c => c.path === remoteEntryJson);
                if (jsonIdx >= 0) gitChanges.splice(jsonIdx, 1);
                const texIdx = gitChanges.findIndex(c => c.path === remoteEntryTex);
                if (texIdx >= 0) gitChanges.splice(texIdx, 1);

                await removeStaged(dbName, entryJsonPath);
                await removeStaged(dbName, entryTexPath);
                this.lastSavedContents.delete(entryJsonPath);
                this.lastSavedContents.delete(entryTexPath);
              } else if (action === "duplicate") {
                // Keep remote version at entryId, duplicate local version as a new entry with copy title
                const localMeta = this.metadata.entries[entryId];
                const newId = await this.entryManager.duplicateEntry(entryId, {
                  title: `${localMeta?.title || "Entry"} (Conflicted Copy)`,
                  author: localMeta?.author,
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
                const origJsonPath = this.getFullPath(`${ENTRIES_DIR}/${entryId}.json`);
                const origTexPath = this.getFullPath(`${LATEX_DIR}/${entryId}.tex`);
                const jIdx = gitChanges.findIndex(c => c.path === origJsonPath);
                if (jIdx >= 0) gitChanges.splice(jIdx, 1);
                const tIdx = gitChanges.findIndex(c => c.path === origTexPath);
                if (tIdx >= 0) gitChanges.splice(tIdx, 1);

                await removeStaged(dbName, `${ENTRIES_DIR}/${entryId}.json`);
                await removeStaged(dbName, `${LATEX_DIR}/${entryId}.tex`);
              }
              // "keep_local" keeps merged.entries[entryId] = local version (default in merged)
            }
          }
          
          this.metadata = merged;
          const mergedIndexStr = JSON.stringify(merged, null, 2);
          const remoteNormalizedStr = JSON.stringify(remoteMetadata, null, 2);
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
          const teamInfo = {
            teamName: "",
            teamNumber: "",
            organization: "",
            members: [],
            ...(merged.team || {}),
          };
          const entryDates = Object.values(merged.entries)
            .map(e => e.date)
            .filter(Boolean)
            .sort();
          if (entryDates.length > 0) {
            teamInfo.startDate = formatDateMonthYear(entryDates[0]);
            teamInfo.endDate = formatDateMonthYear(entryDates[entryDates.length - 1]);
          }

          const teamTexContent = generateTeamLatex(teamInfo);
          const phasesTexContent = generatePhasesLatex(merged.phases || []);
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

      await commitChanges(config, gitChanges, finalMsg);
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
