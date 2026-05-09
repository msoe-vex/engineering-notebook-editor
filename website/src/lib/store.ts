import { NotebookMetadata, EMPTY_METADATA, EntryMetadata, validateNotebookIntegrity, dehydrateAssets, hydrateAssets, extractImagePaths, extractResources, extractReferences, TeamMetadata, ProjectPhase, removeEntryFromMetadata, dehydrateTeamAssets, hydrateTeamAssets, remapContentIds, remapEntryMetadataIds, TipTapNode, buildResourceTypeIndex } from "./metadata";
import { generateAllEntriesLatex, generateEntryLatex, generateTeamLatex, generatePhasesLatex } from "./latex";
import { ExplorerFile, GitHubConfig, TeamTab } from "./types";
import { getProjects, getProject, Project, getAllPending, getPending, stageChange, removeStaged, getResource, putResource, saveProject, getProjectHandle, saveProjectHandle, PendingChange } from "./db";
import { fetchFileContent, fetchDirectoryTree, fetchRawFileContent, GitHubFile } from "./github";
import { listLocalFiles, readLocalFile, writeLocalFile, deleteLocalFileAtPath, getLocalFileContent, ensureLocalDirectory } from "./fs";
import { INDEX_PATH, ENTRIES_DIR, ENTRIES_INDEX_PATH, LATEX_DIR, ASSETS_DIR, TEAM_PATH, PHASES_PATH } from "./constants";
import { events, EventNames } from "./events";
import { generateUUID, getMimeTypeFromExtension, generateDeterministicUUID } from "./utils";

export type WorkspaceMode = "local" | "github" | "temporary" | "none";

interface OpenFileState {
  path: string;
  name: string;
  id: string;
  tiptapContent: string;
  latex: string;
  title: string;
  author: string;
  phase: number | null;
  createdAt: string;
  updatedAt: string;
}

class WorkspaceStore {
  // ─── State ──────────────────────────────────────────────────────────────────
  public mode: WorkspaceMode = "none";
  public config: GitHubConfig | null = null;
  public dirHandle: FileSystemDirectoryHandle | null = null;
  public entries: ExplorerFile[] = [];
  public metadata: NotebookMetadata = EMPTY_METADATA;
  public currentProjectId: string | null = null;
  public currentProject: Project | null = null;
  public hasEntryInUrl: boolean = false;
  public showTeamEditor: boolean = false;
  public teamTab: TeamTab = "identity";
  public openFile: OpenFileState | null = null;
  public isLoading = false;
  public loadingLabel = "";
  public isInitialized = false;
  public projects: Project[] = [];
  public pendingChanges: PendingChange[] = [];
  public assetCache = new Map<string, string>();
  public selectedPaths: Set<string> = new Set();

  get hydratedMetadata(): NotebookMetadata {
    return {
      ...this.metadata,
      team: this.metadata.team ? hydrateTeamAssets(this.metadata.team, this.assetCache) : undefined
    };
  }

  // ─── Internal ───────────────────────────────────────────────────────────────
  #queue = Promise.resolve();
  #lastSavedContents = new Map<string, string>();

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("popstate", () => this.handleUrlChange());
    }
  }

  // ─── Initialization ─────────────────────────────────────────────────────────
  async initialize() {
    this.setLoading(true);
    try {
      await this.refreshProjects();
      await this.handleUrlChange();
      this.isInitialized = true;
    } finally {
      this.setLoading(false);
    }
  }

  public async handleUrlChange(url: URL = new URL(window.location.href)) {
    const path = url.pathname;
    if (path.startsWith('/workspace/team')) {
      this.showTeamEditor = true;
      const tab = path.split('/').pop() as TeamTab;
      this.teamTab = ["identity", "members", "phases"].includes(tab) ? tab : "identity";
    } else {
      this.showTeamEditor = false;
    }

    const params = url.searchParams;
    this.hasEntryInUrl = params.has("entry");
    const projectId = params.get("project");
    const entryId = params.get("entry");
    const resourceId = params.get("resource");

    if (projectId && projectId !== this.currentProjectId) {
      await this.selectProject(projectId);
    } else if (!projectId) {
      this.disconnect();
    }

    if (entryId && (!this.openFile || this.openFile.id !== entryId)) {
      await this.openEntry(entryId);
    } else if (!entryId) {
      this.openFile = null;
    }

    if (resourceId) {
      events.emit(EventNames.SCROLL_TO_RESOURCE, resourceId);
    }

    // Ensure the URL matches the state if we're in a workspace
    if (this.currentProjectId) {
      const url = new URL(window.location.href);
      if (url.searchParams.get('project') !== this.currentProjectId) {
        url.searchParams.set('project', this.currentProjectId);
        window.history.replaceState({}, '', url.toString());
      }
    }

    this.notifyStateChange();
  }

  public setSelectedPaths(pathsOrUpdater: Set<string> | ((prev: Set<string>) => Set<string>)) {
    if (typeof pathsOrUpdater === "function") {
      this.selectedPaths = pathsOrUpdater(this.selectedPaths);
    } else {
      this.selectedPaths = pathsOrUpdater;
    }
    this.notifyStateChange();
  }

  public navigateTo(params: Record<string, string | null>, pathname?: string) {
    const url = new URL(window.location.href);
    if (pathname) url.pathname = pathname;

    // Preserve current project if not specified and not navigating to root
    if (this.currentProjectId && !params.project && url.pathname !== '/') {
      url.searchParams.set('project', this.currentProjectId);
    }

    // Clear resource if changing entry and no new resource specified
    if (params.entry && !params.resource) {
      url.searchParams.delete('resource');
    }

    for (const [k, v] of Object.entries(params)) {
      if (v === null) url.searchParams.delete(k);
      else url.searchParams.set(k, v);
    }
    if (window.location.href !== url.toString()) {
      window.history.pushState({}, '', url.toString());
    }
    if (params.resource) {
      events.emit(EventNames.SCROLL_TO_RESOURCE, params.resource);
    }
    this.handleUrlChange(url);
  }

  // ─── Project Management ─────────────────────────────────────────────────────
  async refreshProjects() {
    this.projects = await getProjects();
    // Sync currentProject if it was renamed
    if (this.currentProjectId && this.currentProject) {
      const updated = this.projects.find(p => p.id === this.currentProjectId);
      if (updated && updated.name !== this.currentProject.name) {
        this.currentProject = { ...updated };
      }
    }
    this.notifyStateChange();
  }

  async renameProject(id: string, name: string) {
    const p = await getProject(id);
    if (p) {
      p.name = name;
      await saveProject(p);
      await this.refreshProjects();
    }
  }

  async createGithubProject(config: { owner: string; repo: string; branch: string; folderPath: string; name: string }) {
    const id = await generateDeterministicUUID(`github:${config.owner}/${config.repo}:${config.folderPath}`);
    const p: Project = {
      id,
      name: config.name,
      type: "github",
      githubConfig: {
        owner: config.owner,
        repo: config.repo,
        branch: config.branch,
        folderPath: config.folderPath
      },
      lastOpened: new Date().toISOString()
    };
    await saveProject(p);
    await this.refreshProjects();
    return id;
  }

  async createLocalProject(handle: FileSystemDirectoryHandle, name: string) {
    // 1. Check if we already have this project by handle
    for (const p of this.projects) {
      if (p.type === "local") {
        try {
          const existingHandle = await getProjectHandle(p.id);
          if (existingHandle && await handle.isSameEntry(existingHandle)) {
            return p.id;
          }
        } catch { }
      }
    }

    let id: string | null = null;
    if (!id) id = generateUUID();

    const p: Project = {
      id,
      name,
      type: "local",
      lastOpened: new Date().toISOString()
    };
    await saveProject(p);
    await saveProjectHandle(id, handle);

    // Ensure base directories
    await ensureLocalDirectory(handle, ENTRIES_DIR);
    await ensureLocalDirectory(handle, ASSETS_DIR);
    await ensureLocalDirectory(handle, LATEX_DIR);



    await this.refreshProjects();
    return id;
  }

  async createTemporaryProject() {
    // Temporary doesn't need to be "created" in DB, just navigated to
    return "temporary";
  }

  async selectProject(id: string) {
    if (this.currentProjectId === id && this.isInitialized && !this.isLoading) return;
    
    // Ensure all pending I/O for the current project is finished before switching
    await this.#queue;
    
    this.selectedPaths = new Set();
    this.setLoading(true);
    try {
      if (id === "temporary") {
        if (this.currentProjectId !== "temporary") {
          this.currentProject = { id: "temporary", name: "Temporary Project", type: "temporary", lastOpened: new Date().toISOString() };
          this.currentProjectId = "temporary";
          this.mode = "temporary";
          this.metadata = EMPTY_METADATA;
          this.entries = [];

          // Update URL for temporary project
          const url = new URL(window.location.href);
          url.searchParams.set('project', "temporary");
          if (url.pathname === '/') url.pathname = '/workspace/editor';
          if (window.location.href !== url.toString()) {
            window.history.pushState({}, '', url.toString());
          }
        }
        this.notifyStateChange();
        return;
      }

      const project = await getProject(id);
      if (!project) {
        this.disconnect();
        window.history.replaceState({}, '', '/');
        this.notifyStateChange();
        events.emit(EventNames.SHOW_NOTIFICATION, { message: "Project not found", type: "error" });
        return;
      }

      this.currentProject = project;
      this.currentProjectId = id;
      this.mode = project.type as WorkspaceMode;

      if (this.mode === "local") {
        const handle = await getProjectHandle(id);
        if (handle) {
          this.dirHandle = handle;
          await this.loadLocalWorkspace();
        } else {
          // Needs permission
          this.mode = "none";
        }
      } else if (this.mode === "github") {
        const token = localStorage.getItem("nb-github-token");
        if (!token) {
          this.disconnect();
          events.emit(EventNames.SHOW_NOTIFICATION, { message: "GitHub token is missing. Please sign in.", type: "error" });
          events.emit(EventNames.SHOW_GITHUB_LOGIN, { loginOnly: true, projectId: project.id });
          window.history.replaceState({}, '', '/');
          this.notifyStateChange();
          return;
        }

        this.config = {
          token,
          owner: project.githubConfig!.owner,
          repo: project.githubConfig!.repo,
          branch: project.githubConfig!.branch,
          baseDir: project.githubConfig!.folderPath,
          entriesDir: ENTRIES_DIR,
          resourcesDir: ASSETS_DIR
        };

        try {
          await this.loadGitHubWorkspace();
        } catch (error: unknown) {
          const err = error as { status?: number };
          console.error("Failed to load GitHub workspace:", error);
          this.disconnect();
          const msg = err.status === 401 ? "GitHub session expired. Please sign in again." :
                      err.status === 403 ? "You do not have access to this repository." :
                      err.status === 404 ? "Repository or folder not found." :
                      "Failed to connect to GitHub. Check your internet or token.";
          if (err.status === 401) {
            events.emit(EventNames.SHOW_GITHUB_LOGIN, { loginOnly: true, projectId: project.id });
          }
          events.emit(EventNames.SHOW_NOTIFICATION, { message: msg, type: "error" });
          window.history.replaceState({}, '', '/');
          this.notifyStateChange();
          return;
        }
      } else if (this.mode === "temporary") {
        this.metadata = EMPTY_METADATA;
        this.entries = [];
      }

      // Update URL to reflect the project selection
      const url = new URL(window.location.href);
      url.searchParams.set('project', id);
      if (url.pathname === '/') url.pathname = '/workspace/editor';
      if (window.location.href !== url.toString()) {
        window.history.pushState({}, '', url.toString());
      }

      events.emit(EventNames.PROJECT_LOADED, project);
      await this.refreshPending();

      // Update last opened timestamp only if successfully opened
      if (this.mode !== "none") {
        project.lastOpened = new Date().toISOString();
        await saveProject(project);
        await this.refreshProjects();
      }
    } finally {
      this.setLoading(false);
    }
  }

  private async reloadWorkspace() {
    if (this.mode === "local") {
      await this.loadLocalWorkspace();
    } else if (this.mode === "github") {
      await this.loadGitHubWorkspace();
    } else if (this.mode === "temporary") {
      // Re-populate entries from metadata for temporary mode
      this.entries = Object.values(this.metadata.entries).map(e => ({
        name: e.filename.split('/').pop() || '',
        path: e.filename
      })).sort((a, b) => {
        const metaA = this.metadata.entries[a.path.split('/').pop()?.replace('.json', '') || ''];
        const metaB = this.metadata.entries[b.path.split('/').pop()?.replace('.json', '') || ''];
        return new Date(metaB?.createdAt || 0).getTime() - new Date(metaA?.createdAt || 0).getTime();
      });
      this.notifyStateChange();
    }
  }

  private async loadLocalWorkspace() {
    if (!this.dirHandle) return;
    const files = await listLocalFiles(this.dirHandle, ENTRIES_DIR);
    this.entries = files;
    try {
      const metaStr = await readLocalFile(this.dirHandle, INDEX_PATH);
      const parsed = JSON.parse(metaStr);

      // Hydrate team assets
      const assetCache = new Map<string, string>();
      const fetchLocalAsset = async (path: string) => {
        if (!path || path.startsWith('data:')) return;
        try {
          const res = await getLocalFileContent(this.dirHandle!, path);
          if (res.base64) assetCache.set(path, res.base64);
        } catch { }
      };

      const tasks: Promise<void>[] = [];
      if (parsed.team?.logo) tasks.push(fetchLocalAsset(parsed.team.logo));
      if (parsed.team?.members) {
        for (const m of parsed.team.members) {
          if (m.image) tasks.push(fetchLocalAsset(m.image));
        }
      }
      await Promise.all(tasks);

      // Keep metadata clean, but update the global asset cache
      assetCache.forEach((v, k) => this.assetCache.set(k, v));
      this.metadata = { ...EMPTY_METADATA, ...parsed };
    } catch {
      this.metadata = EMPTY_METADATA;
    }
  }

  private async loadGitHubWorkspace() {
    if (!this.config) throw new Error("GitHub configuration missing");
    if (!this.config.token) throw new Error("GitHub token is required");

    const dbName = this.getDBName();
    const normalizedBase = this.config.baseDir ? this.config.baseDir.replace(/^\/+|\/+$/g, '') : '';
    const basePrefix = normalizedBase ? normalizedBase + '/' : '';
    const actualIndexPath = `${basePrefix}${INDEX_PATH}`;

    const files = await fetchDirectoryTree(this.config, `${basePrefix}${ENTRIES_DIR}`);
    const entryFiles = Array.isArray(files) ? files.map((f: GitHubFile) => ({ 
      name: f.name, 
      path: f.path.startsWith(basePrefix) ? f.path.slice(basePrefix.length) : f.path 
    })) : [];

    const pending = await getAllPending(dbName);
    const pendingMeta = pending.find(p => p.path === INDEX_PATH && p.operation === "upsert");

    if (pendingMeta?.content) {
      const parsed = JSON.parse(pendingMeta.content);
      this.metadata = { ...EMPTY_METADATA, ...parsed, projectId: this.currentProjectId || undefined, projectName: this.currentProject?.name || undefined };
    } else {
      try {
        const metaStr = await fetchFileContent(this.config, actualIndexPath);
        this.metadata = { ...EMPTY_METADATA, ...JSON.parse(metaStr) };
      } catch {
        this.metadata = EMPTY_METADATA;
      }
    }

    let mergedEntries = [...entryFiles];
    for (const p of pending) {
      if (p.path.startsWith(ENTRIES_DIR) && p.path.endsWith('.json')) {
        if (p.operation === "upsert" && !mergedEntries.some(e => e.path === p.path)) {
          mergedEntries.push({ name: p.path.split('/').pop() || '', path: p.path });
        } else if (p.operation === "delete") {
          mergedEntries = mergedEntries.filter(e => e.path !== p.path);
        }
      }
    }
    this.entries = mergedEntries;

    // Hydrate team assets for GitHub
    if (this.metadata.team) {
      const dbName = this.getDBName();
      const team = this.metadata.team;
      // Normalize baseDir: remove leading/trailing slashes and ensure a single trailing slash if not empty
      const normalizedBase = this.config.baseDir ? this.config.baseDir.replace(/^\/+|\/+$/g, '') : '';
      const basePrefix = normalizedBase ? normalizedBase + '/' : '';
      console.log(`[Store] Hydrating GitHub assets. baseDir: "${this.config.baseDir}", basePrefix: "${basePrefix}"`);

      const fetchAsset = async (path: string) => {
        if (!path || path.startsWith('data:')) return;
        try {
          // 1. Check if already in memory
          if (this.assetCache.has(path)) {
            console.log(`[Store] Asset already in memory: ${path}`);
            return;
          }

          // 2. Check pending changes store (for newly uploaded but uncommitted images)
          const pending = await getPending(dbName, path);
          if (pending?.content) {
            const dataUrl = `data:${getMimeTypeFromExtension(path)};base64,${pending.content}`;
            this.assetCache.set(path, dataUrl);
            console.log(`[Store] Hydrated GitHub asset from pending changes: ${path}`);
            return;
          }

          // 3. Check resource cache
          let cached = await getResource(dbName, path);
          if (cached) {
            // Fix legacy/corrupted image/* prefix from previous versions
            if (cached.startsWith('data:image/*;base64,')) {
              console.log(`[Store] Fixing legacy image/* prefix for: ${path}`);
              cached = cached.replace('data:image/*;base64,', `data:${getMimeTypeFromExtension(path)};base64,`);
              await putResource(dbName, { path, dataUrl: cached }); // Update cache with fix
            }
          }

          if (cached) {
            this.assetCache.set(path, cached);
            console.log(`[Store] Hydrated GitHub asset from resource cache: ${path}`);
            return;
          }

          // 4. Fetch from GitHub
          const actualPath = this.getFullPath(path);
          console.log(`[Store] Fetching asset from GitHub: ${actualPath}`);
          const base64 = await fetchRawFileContent(this.config!, actualPath);
          const dataUrl = `data:${getMimeTypeFromExtension(path)};base64,${base64}`;
          this.assetCache.set(path, dataUrl);
          await putResource(dbName, { path, dataUrl });
          console.log(`[Store] Hydrated GitHub asset from network: ${path}`);
        } catch (e) {
          console.warn(`[Store] Failed to hydrate GitHub asset: ${path}`, e);
        }
      };

      const tasks: Promise<void>[] = [];
      if (team.logo) tasks.push(fetchAsset(team.logo));
      if (team.members) {
        for (const m of team.members) {
          if (m.image) tasks.push(fetchAsset(m.image));
        }
      }
      await Promise.all(tasks);
    }
  }

  // ─── Entry Management ───────────────────────────────────────────────────────
  async openEntry(id: string) {
    const meta = this.metadata.entries[id];

    if (!meta) {
      this.navigateTo({ entry: null });
      events.emit(EventNames.SHOW_NOTIFICATION, {
        message: "Entry not found",
        type: "error"
      });
      return;
    }

    // Clear current file to show localized loading state in UI
    this.openFile = null;
    this.notifyStateChange();

    try {
      const dbName = this.getDBName();
      let entryJsonStr = "";

      // Fetch pending changes once to use for entry and assets
      const pending = await getAllPending(dbName);

      // 1. Check memory cache first (for immediate access to new/modified entries)
      entryJsonStr = this.#lastSavedContents.get(meta.filename) || "";

      // 2. Check pending changes if not in memory
      if (!entryJsonStr) {
        const stagedEntry = pending.find(p => p.path === meta.filename && p.operation === "upsert");
        if (stagedEntry?.content) {
          entryJsonStr = stagedEntry.content;
        }
      }

      // 3. Check disk/remote if still not found
      if (!entryJsonStr) {
        if (this.mode === "local" && this.dirHandle) {
          entryJsonStr = (await getLocalFileContent(this.dirHandle, meta.filename)).text || "";
        } else if (this.mode === "github" && this.config) {
          entryJsonStr = await fetchFileContent(this.config, this.getFullPath(meta.filename));
        }
      }

      if (!entryJsonStr) throw new Error("Entry not found");
      const rawData = JSON.parse(entryJsonStr);
      const content = rawData.content || rawData;

      // Hydrate assets
      const assetCache = new Map<string, string>();
      const images = extractImagePaths(content);
      for (const imgPath of images) {
        if (imgPath.startsWith('data:')) continue;
        const actualImgPath = this.getFullPath(imgPath);
        const staged = pending.find(p => p.path === imgPath && p.operation === "upsert");
        if (staged?.content) {
          const dataUrl = staged.content.startsWith('data:') ? staged.content : `data:${getMimeTypeFromExtension(imgPath)};base64,${staged.content}`;
          assetCache.set(imgPath, dataUrl);
        } else {
          let cached = await getResource(dbName, actualImgPath);
          if (cached) {
            if (cached.startsWith('data:image/*;base64,')) {
              cached = cached.replace('data:image/*;base64,', `data:${getMimeTypeFromExtension(imgPath)};base64,`);
              await putResource(dbName, { path: actualImgPath, dataUrl: cached });
            }
          }
          if (cached) {
            assetCache.set(imgPath, cached);
          } else if (this.mode === "local" && this.dirHandle) {
            try {
              const res = await getLocalFileContent(this.dirHandle, imgPath);
              if (res.base64) assetCache.set(imgPath, res.base64);
            } catch { }
          } else if (this.mode === "github" && this.config) {
            try {
              const base64 = await fetchRawFileContent(this.config, actualImgPath);
              const dataUrl = `data:${getMimeTypeFromExtension(imgPath)};base64,${base64}`;
              assetCache.set(imgPath, dataUrl);
              await putResource(dbName, { path: actualImgPath, dataUrl });
            } catch { }
          }
        }
      }

      const hydratedContent = hydrateAssets(content, assetCache);

      let latex = "";
      try {
        const texPath = `${LATEX_DIR}/${id}.tex`;
        if (this.mode === "local" && this.dirHandle) {
          latex = await readLocalFile(this.dirHandle, texPath);
        } else if (this.mode === "github" && this.config) {
          latex = await fetchFileContent(this.config, this.getFullPath(texPath));
        }
      } catch { }

      this.openFile = {
        path: meta.filename,
        name: meta.filename.split('/').pop() || "",
        id: id,
        tiptapContent: JSON.stringify(hydratedContent),
        latex,
        title: meta.title,
        author: meta.author,
        phase: meta.phase,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt
      };

      this.#lastSavedContents.set(meta.filename, JSON.stringify({ version: 3, content }, null, 2));
      events.emit(EventNames.ENTRY_LOADED, this.openFile);
      this.notifyStateChange();
    } catch (e) {
      console.error("Failed to open entry:", e);
      this.openFile = null;
      this.navigateTo({ entry: null });
      events.emit(EventNames.SHOW_NOTIFICATION, { message: "Failed to load entry.", type: "error" });
      this.notifyStateChange();
    } finally {
      // No global loading here
    }
  }

  async updateEntry(id: string, latex: string, tiptapContent: string, info: { title: string; author: string; phase: number | null }) {
    // 1. Update memory immediately (Source of Truth)
    if (this.openFile && this.openFile.id === id) {
      this.openFile = { ...this.openFile, ...info, tiptapContent, latex, updatedAt: new Date().toISOString() };
    }

    const existingEntry = this.metadata.entries[id];
    if (!existingEntry) return;

    let contentJson = JSON.parse(tiptapContent);
    // Handle double-stringification and wrapping
    if (typeof contentJson === 'string') {
      try { contentJson = JSON.parse(contentJson); } catch { }
    }
    if (contentJson && contentJson.content && !contentJson.type) {
      contentJson = contentJson.content;
    }

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

    this.metadata = validateNotebookIntegrity({
      ...this.metadata,
      entries: { ...this.metadata.entries, [id]: mergedEntry }
    });

    this.notifyStateChange();
    events.emit(EventNames.ENTRY_UPDATED, { id, ...info });

    if (info.author) {
      localStorage.setItem("nb-last-author", info.author);
    }

    // 2. Queue background persistence
    this.enqueue(async () => {
      let contentObj = JSON.parse(tiptapContent);
      // Handle potential double-stringification
      if (typeof contentObj === 'string') {
        try {
          contentObj = JSON.parse(contentObj);
        } catch { /* use as is */ }
      }

      const { cleanDoc, newAssets } = await dehydrateAssets(contentObj);
      const entryJsonStr = JSON.stringify({ version: 3, content: cleanDoc }, null, 2);

      // Save assets
      for (const asset of newAssets) {
        await this.persistFile(asset.path, asset.base64, `Asset: ${asset.path}`, true);
        if (this.mode === "github") {
          await putResource(this.getDBName(), { path: asset.path, dataUrl: `data:${getMimeTypeFromExtension(asset.path)};base64,${asset.base64}` });
        }
      }

      // Save Entry JSON
      if (this.#lastSavedContents.get(mergedEntry.filename) !== entryJsonStr) {
        await this.persistFile(mergedEntry.filename, entryJsonStr, `Auto-save: ${info.title}`);
        this.#lastSavedContents.set(mergedEntry.filename, entryJsonStr);
      }

      // Save LaTeX
      const latexPath = `${LATEX_DIR}/${id}.tex`;
      if (this.#lastSavedContents.get(latexPath) !== latex) {
        await this.persistFile(latexPath, latex, `Generate LaTeX: ${info.title}`);
        this.#lastSavedContents.set(latexPath, latex);
      }

      // Cleanup orphaned assets
      await this.reconcileAssetRefs(existingEntry.assets || [], mergedEntry.assets || []);

      // Save Metadata
      await this.persistFile(INDEX_PATH, JSON.stringify(this.metadata, null, 2), "Auto-save metadata");
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
      createdAt, updatedAt: createdAt, filename: path
    };

    const wrapper = { version: 3, content: { type: "doc", content: [{ type: "paragraph" }] } };
    const jsonStr = JSON.stringify(wrapper, null, 2);
    const initialLatex = `\\notebookentry{${newEntry.title}}{${createdAt.split('T')[0]}}{${newEntry.author}}{}\n\\label{${id}}\n\n`;

    this.#lastSavedContents.set(path, jsonStr);
    this.#lastSavedContents.set(latexPath, initialLatex);

    this.metadata = validateNotebookIntegrity({
      ...this.metadata,
      entries: { ...this.metadata.entries, [id]: newEntry }
    });
    this.entries = [{ name: `${id}.json`, path }, ...this.entries];
    this.notifyStateChange();

    this.enqueue(async () => {
      await this.persistFile(path, jsonStr, "New entry");
      await this.persistFile(latexPath, initialLatex, "Init LaTeX");
      await this.persistFile(INDEX_PATH, JSON.stringify(this.metadata, null, 2), "Create entry metadata");
      await this.updateLatexMetadata();
    });

    this.navigateTo({ entry: id });
    return id;
  }

  async refreshPending() {
    const dbName = this.getDBName();
    this.pendingChanges = await getAllPending(dbName);
    this.notifyStateChange();
    return this.pendingChanges;
  }

  setEntryValidity(id: string, isValid: boolean, validationErrors: string[] = []) {
    const existingEntry = this.metadata.entries[id];
    if (!existingEntry) return;

    if (existingEntry.isValid === isValid && JSON.stringify(existingEntry.validationErrors || []) === JSON.stringify(validationErrors)) {
      return;
    }

    this.metadata = {
      ...this.metadata,
      entries: {
        ...this.metadata.entries,
        [id]: {
          ...existingEntry,
          isValid,
          validationErrors
        }
      }
    };

    this.notifyStateChange();
  }

  async discardPendingChanges() {
    if (this.mode !== "github" && this.mode !== "temporary") {
      return;
    }

    const dbName = this.getDBName();
    const previousOpenId = this.openFile?.id ?? null;

    const { clearAllPending } = await import("./db");
    await clearAllPending(dbName);

    // Drop in-memory drafts so reload/openEntry can't resurrect discarded text.
    this.#lastSavedContents.clear();

    await this.reloadWorkspace();
    await this.refreshPending();

    if (previousOpenId) {
      if (this.metadata.entries[previousOpenId]) {
        await this.openEntry(previousOpenId);
        return;
      }

      this.openFile = null;
      this.selectedPaths = new Set();
      this.navigateTo({ entry: null, resource: null });
      return;
    }

    this.notifyStateChange();
  }

  async deleteEntry(file: ExplorerFile) {
    const id = file.path.split('/').pop()?.replace('.json', '') || "";
    const oldMeta = this.metadata;
    const updatedMeta = validateNotebookIntegrity(removeEntryFromMetadata(this.metadata, id));

    // Memory update
    this.metadata = updatedMeta;
    this.entries = this.entries.filter(e => e.path !== file.path);
    if (this.openFile?.id === id) {
      this.openFile = null;
      this.navigateTo({ entry: null });
    }

    this.notifyStateChange();

    // Background persistence
    this.enqueue(async () => {
      if (this.mode === "local" && this.dirHandle) {
        await deleteLocalFileAtPath(this.dirHandle, file.path);
        await deleteLocalFileAtPath(this.dirHandle, `${LATEX_DIR}/${id}.tex`);
      } else if (this.mode === "github" || this.mode === "temporary") {
        const dbName = this.getDBName();

        const stagedEntry = await getPending(dbName, file.path);
        const stagedLatex = await getPending(dbName, `${LATEX_DIR}/${id}.tex`);

        if (stagedEntry?.operation === "upsert") {
          await removeStaged(dbName, file.path);
        } else {
          await stageChange(dbName, { path: file.path, operation: "delete", label: "Delete entry", stagedAt: new Date().toISOString() });
        }

        if (stagedLatex?.operation === "upsert") {
          await removeStaged(dbName, `${LATEX_DIR}/${id}.tex`);
        } else {
          await stageChange(dbName, { path: `${LATEX_DIR}/${id}.tex`, operation: "delete", label: "Delete LaTeX", stagedAt: new Date().toISOString() });
        }
      }

      await this.reconcileAssetRefs(oldMeta.assetRefs || {}, this.metadata.assetRefs || {});
      await this.persistFile(INDEX_PATH, JSON.stringify(this.metadata, null, 2), "Delete entry");
      await this.updateLatexMetadata();
    });
  }

  private async updateLatexMetadata() {
    const teamLatex = generateTeamLatex(this.metadata.team || { teamName: "", teamNumber: "", startDate: "", endDate: "", organization: "", members: [] });
    const phasesLatex = generatePhasesLatex(this.metadata.phases || []);
    const allEntriesLatex = generateAllEntriesLatex(this.metadata);

    await this.persistFile(TEAM_PATH, teamLatex, "Update team.tex");
    await this.persistFile(PHASES_PATH, phasesLatex, "Update phases.tex");
    await this.persistFile(ENTRIES_INDEX_PATH, allEntriesLatex, "Update entries.tex");
  }

  async saveTeam(team: TeamMetadata, phases?: ProjectPhase[]) {
    const oldMeta = this.metadata;
    const { cleanTeam, newAssets } = await dehydrateTeamAssets(team);

    // Memory update
    const updatedMeta = validateNotebookIntegrity({
      ...this.metadata,
      team: cleanTeam,
      phases: phases || this.metadata.phases || []
    });

    const metaStr = JSON.stringify(updatedMeta, null, 2);

    // Update memory (we'll keep the hydrated version in memory for the UI)
    const assetCache = new Map<string, string>();
    for (const asset of newAssets) {
      const dataUrl = `data:${getMimeTypeFromExtension(asset.path)};base64,${asset.base64}`;
      assetCache.set(asset.path, dataUrl);
      this.assetCache.set(asset.path, dataUrl); // Update global cache
    }

    this.metadata = { ...updatedMeta, team: cleanTeam }; // Metadata stays CLEAN
    this.notifyStateChange();

    this.enqueue(async () => {
      for (const asset of newAssets) {
        await this.persistFile(asset.path, asset.base64, `Team asset`, true);
      }
      await this.reconcileAssetRefs(oldMeta.assetRefs || {}, updatedMeta.assetRefs || {});
      await this.persistFile(INDEX_PATH, metaStr, "Update team metadata");
      await this.updateLatexMetadata();
    });
  }

  async commitAll(config: GitHubConfig) {
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
      this.notifyStateChange();
      events.emit(EventNames.SHOW_NOTIFICATION, { message: "Nothing to sync to GitHub.", type: "info" });
      return;
    }

    await commitChanges(config, gitChanges, `Update notebook: ${gitChanges.length} changes`);
    await this.loadGitHubWorkspace();
    await clearAllPending(dbName);
    await this.refreshPending();
    this.notifyStateChange();
  }

  // ─── Persistence Helpers ────────────────────────────────────────────────────
  public async getFileContent(path: string): Promise<string | null> {
    const dbName = this.getDBName();
    const pending = await getAllPending(dbName);
    const staged = pending.find(p => p.path === path && p.operation === "upsert");
    if (staged?.content) return staged.content;

    try {
      if (this.mode === "local" && this.dirHandle) {
        const res = await getLocalFileContent(this.dirHandle, path);
        return res.text || null;
      } else if (this.mode === "github" && this.config) {
        return await fetchFileContent(this.config, this.getFullPath(path));
      } else if (this.mode === "temporary") {
        // Temporary mode only exists in pending changes
        return null;
      }
    } catch (e) {
      console.error(`Failed to get content for ${path}:`, e);
    }
    return null;
  }

  public async exportEntries(entryIds?: string[]) {
    this.setLoading(true);
    try {
      const targets = entryIds || Object.keys(this.metadata.entries);
      const assetsData: Record<string, string> = {};
      const entriesWithContent: Record<string, EntryMetadata & { content?: TipTapNode }> = {};
      const relevantAssetRefs: Record<string, string[]> = {};

      // 1. Process Entries and their content
      for (const id of targets) {
        const meta = this.metadata.entries[id];
        if (!meta) continue;

        const contentStr = await this.getFileContent(meta.filename);
        if (!contentStr) continue;

        let content;
        try {
          const contentObj = JSON.parse(contentStr);
          content = contentObj.content || contentObj;
        } catch (e) {
          console.error(`Failed to parse content for ${id}`, e);
          continue;
        }

        // Deep copy meta and add content
        entriesWithContent[id] = { ...JSON.parse(JSON.stringify(meta)), content };

        // Collect assets referenced by this entry
        const images = extractImagePaths(content);
        for (const assetPath of images) {
          if (!assetsData[assetPath] && !assetPath.startsWith('data:')) {
            const base64 = await this.getAssetBase64(assetPath);
            if (base64) assetsData[assetPath] = base64;
          }
        }
      }

      // 2. Identify relevant AssetRefs
      if (this.metadata.assetRefs) {
        for (const [assetPath, owners] of Object.entries(this.metadata.assetRefs)) {
          const filteredOwners = owners.filter(o =>
            targets.includes(o) || (!entryIds && o === "team")
          );
          if (filteredOwners.length > 0) {
            relevantAssetRefs[assetPath] = filteredOwners;
            // Ensure team assets are also hydrated if they haven't been yet
            if (!assetsData[assetPath] && !assetPath.startsWith('data:')) {
              const base64 = await this.getAssetBase64(assetPath);
              if (base64) assetsData[assetPath] = base64;
            }
          }
        }
      }

      // 3. Assemble Export following notebook.json schema (excluding project identity)
      const exportData: Record<string, unknown> = {
        assetRefs: relevantAssetRefs,
        entries: entriesWithContent,
        assets: assetsData
      };

      if (!entryIds) {
        exportData.phases = this.metadata.phases;
        exportData.team = this.metadata.team;
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const { saveAs } = await import("file-saver");
      const name = entryIds
        ? (entryIds.length === 1
          ? (this.metadata.entries[entryIds[0]]?.title || "entry").replace(/[^a-z0-9]/gi, '_').toLowerCase()
          : "entries")
        : "notebook";
      saveAs(blob, `${name}.json`);

    } catch (e) {
      console.error("Export failed", e);
      events.emit(EventNames.SHOW_NOTIFICATION, { message: "Export failed", type: "error" });
    } finally {
      this.setLoading(false);
    }
  }

  public async importNotebook(data: Record<string, unknown>) {
    this.setLoading(true, "Importing project data...");
    try {
      const { entries = {}, assets = {} } = data as { entries: Record<string, Record<string, unknown>>; assets: Record<string, unknown> };
      const idMap = new Map<string, string>();

      // 1. Map ALL IDs first (Entries and their internal Resources)
      const entryIdList = Object.keys(entries);
      for (const oldId of entryIdList) {
        idMap.set(oldId, generateUUID());
        const entryData = entries[oldId] as Record<string, unknown>;
        const resources = entryData.resources as Record<string, unknown> | undefined;
        if (resources) {
          for (const resId of Object.keys(resources)) {
            idMap.set(resId, generateUUID());
          }
        }
      }

      // 2. Save assets first
      for (const [path, base64] of Object.entries(assets as Record<string, string>)) {
        const dataUrl = `data:${getMimeTypeFromExtension(path)};base64,${base64}`;
        this.assetCache.set(path, dataUrl); // Immediate memory cache
        await this.persistFile(path, base64, `Import asset: ${path}`, true);
        if (this.mode === "github" || this.mode === "temporary") {
          await putResource(this.getDBName(), { path, dataUrl });
        }
      }

      // 3. Remap entries
      const newEntriesMap: Record<string, EntryMetadata> = {};
      for (const oldId of entryIdList) {
        const entryWithContent = entries[oldId] as Record<string, unknown> & { content?: TipTapNode };
        const { content, ...entryMetadata } = entryWithContent;
        const newId = idMap.get(oldId)!;

        // Remap content IDs
        const { doc: remappedDoc } = remapContentIds((content || {}) as TipTapNode, idMap);

        // Remap metadata IDs (resources, references)
        const remappedMeta = remapEntryMetadataIds(entryMetadata as unknown as EntryMetadata, idMap);
        remappedMeta.id = newId;
        remappedMeta.filename = `${ENTRIES_DIR}/${newId}.json`;

        const contentStr = JSON.stringify({ version: 3, content: remappedDoc }, null, 2);
        const localResources = extractResources(remappedDoc as TipTapNode);
        const resourceTypes = buildResourceTypeIndex({ ...this.metadata.entries, ...newEntriesMap, [newId]: remappedMeta }, localResources, newId);
        const latex = generateEntryLatex(remappedDoc as TipTapNode, remappedMeta.title, remappedMeta.author, remappedMeta.phase, remappedMeta.createdAt, newId, resourceTypes);

        // Save entry files
        await this.persistFile(remappedMeta.filename, contentStr, `Import entry: ${remappedMeta.title}`);
        await this.persistFile(`${LATEX_DIR}/${newId}.tex`, latex, `Import LaTeX: ${remappedMeta.title}`);

        newEntriesMap[newId] = remappedMeta;
      }

      // 4. Import Team and Phases if present
      const importedPhases = data.phases as ProjectPhase[] | undefined;
      const importedTeam = data.team as TeamMetadata | undefined;

      // 5. Update project metadata
      this.metadata = validateNotebookIntegrity({
        ...this.metadata,
        entries: { ...this.metadata.entries, ...newEntriesMap },
        phases: importedPhases || this.metadata.phases,
        team: importedTeam || this.metadata.team
      });

      // Save metadata
      await this.persistFile(INDEX_PATH, JSON.stringify(this.metadata, null, 2), "Import notebook metadata");
      await this.updateLatexMetadata();

      // Refresh project list
      await this.reloadWorkspace();

      // Select the newly imported entries
      const newPaths = new Set<string>(Object.values(newEntriesMap).map(m => m.filename));
      this.selectedPaths = newPaths;

      this.notifyStateChange();
      
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
      this.setLoading(false);
    }
  }

  private async getAssetBase64(path: string): Promise<string | null> {
    const dbName = this.getDBName();
    const cached = await getResource(dbName, path);
    if (cached) {
      return cached.includes(',') ? cached.split(',')[1] : cached;
    }

    try {
      if (this.mode === "local" && this.dirHandle) {
        const res = await getLocalFileContent(this.dirHandle, path);
        return res.base64 ? res.base64.split(',')[1] : null;
      } else if (this.mode === "github" && this.config) {
        return await fetchRawFileContent(this.config, this.getFullPath(path));
      }
    } catch (e) {
      console.error(`Failed to get asset base64 for ${path}`, e);
    }
    return null;
  }

  public async exportNotebook() {
    await this.exportEntries();
  }

  public getDBName() {
    if (this.currentProjectId) return `notebook-project-${this.currentProjectId}`;
    return "notebook-default";
  }

  private enqueue(op: () => Promise<void>) {
    this.#queue = this.#queue.then(async () => {
      try { await op(); } catch (e) { console.error("Background persistence error:", e); }
      if (this.#queue === Promise.resolve()) events.emit(EventNames.PERSISTENCE_SYNC);
    });
  }

  private async getCommittedFileContent(path: string, isBase64 = false): Promise<string | null> {
    if (this.mode !== "github" || !this.config) {
      return null;
    }

    try {
      const fullPath = this.getFullPath(path);
      return isBase64 ? await fetchRawFileContent(this.config, fullPath) : await fetchFileContent(this.config, fullPath);
    } catch {
      return null;
    }
  }

  private async persistFile(path: string, content: string, label: string, isBase64 = false) {
    if (this.mode === "local" && this.dirHandle) {
      await writeLocalFile(this.dirHandle, path, content, isBase64);
    } else if (this.mode === "github" || this.mode === "temporary") {
      const dbName = this.getDBName();
      const staged = await getPending(dbName, path);

      if (this.mode === "github") {
        const committed = await this.getCommittedFileContent(path, isBase64);

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

      await stageChange(dbName, { path, content, operation: "upsert", label, stagedAt: new Date().toISOString() });
      await this.refreshPending();
    }
  }

  private async reconcileAssetRefs(oldRefs: string[] | Record<string, string[]>, newRefs: string[] | Record<string, string[]>) {
    const removed: string[] = [];

    if (Array.isArray(oldRefs) && Array.isArray(newRefs)) {
      // Comparing specific entry assets
      for (const path of oldRefs) {
        // Only mark for deletion if it's not in the new set AND not used by ANY other entry/team
        if (!newRefs.includes(path) && (!this.metadata.assetRefs?.[path] || this.metadata.assetRefs[path].length === 0)) {
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
      if (this.mode === "local" && this.dirHandle) {
        await deleteLocalFileAtPath(this.dirHandle, path);
      } else if (this.mode === "github" || this.mode === "temporary") {
        await stageChange(this.getDBName(), { path, operation: "delete", label: `Cleanup orphan: ${path}`, stagedAt: new Date().toISOString() });
      }
      // Also remove from global cache to prevent hydration of dead paths
      this.assetCache.delete(path);
    }
  }

  // ─── State Helpers ──────────────────────────────────────────────────────────
  private setLoading(val: boolean, label: string = "Loading...") {
    this.isLoading = val;
    this.loadingLabel = label;
    this.notifyStateChange();
    events.emit(EventNames.LOADING_STATUS, val);
  }

  private notifyStateChange() {
    events.emit(EventNames.STATE_CHANGED, this);
  }

  async disconnect() {
    this.setLoading(true);
    try {
      // Ensure all pending I/O for the current project is finished before context is cleared
      await this.#queue;

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

  private getFullPath(path: string): string {
    if (this.mode !== "github" || !this.config) return path;
    const baseDir = this.config.baseDir ? this.config.baseDir.replace(/^\/+|\/+$/g, '') : '';
    if (!baseDir) return path;
    const prefix = baseDir + '/';
    if (path.startsWith(prefix)) return path;
    return `${prefix}${path}`;
  }

}

export const store = new WorkspaceStore();
