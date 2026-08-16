import { NotebookMetadata, EMPTY_METADATA, TeamMetadata, ProjectPhase, hydrateTeamAssets, TipTapNode, buildResourceTypeIndex, extractResources } from "./metadata";
import { generateEntryLatex } from "./latex";
import { ExplorerFile, GitHubConfig, TeamTab } from "./types";
import { Project, getAllPending, removeStaged, PendingChange } from "./db";
import { events, EventNames } from "./events";
import { WorkspaceMode, OpenFileState, IWorkspaceStore, DebouncedFunction, ImportOptions } from "./store/types";
export type { WorkspaceMode, OpenFileState, DebouncedFunction };
import { debounceWithFlush } from "./utils";
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

  public async refreshPending() {
    return this.entryManager.refreshPending();
  }

  public setEntryValidity(id: string, isValid: boolean, validationErrors?: string[]) {
    return this.entryManager.setEntryValidity(id, isValid, validationErrors);
  }

  public async discardPendingChanges() {
    return this.entryManager.discardPendingChanges();
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
      const filesLabel = changesCount === 1 ? "file" : "files";
      const defaultMsg = `Update notebook: ${changesCount} ${filesLabel}`;
      const finalMsg = customMessage
        ? `${customMessage} (Updated ${changesCount} ${filesLabel})`
        : defaultMsg;

      await commitChanges(config, gitChanges, finalMsg);
      await this.reloadWorkspace();
      await clearAllPending(dbName);
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
    this.debouncedPersist.flush();
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
      this.notifyStateChange();
    } finally {
      this.setLoading(false);
    }
  }
}

export const store = new WorkspaceStore();
