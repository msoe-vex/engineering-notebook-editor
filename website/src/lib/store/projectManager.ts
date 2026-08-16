import { Project, getProjects, getProject, saveProject, getProjectHandle, saveProjectHandle, getAllPending, getPending, putResource, getResource, stageChange } from "../db";
import { listLocalFiles, readLocalFile, writeLocalFile, getLocalFileContent, ensureLocalDirectory, checkLocalFileExists } from "../fs";
import { fetchFileContent, fetchDirectoryTree, fetchRawFileContent, checkGitHubFileExists, fetchGitHubUser, GitHubFile } from "../github";
import { EMPTY_METADATA, validateNotebookIntegrity } from "../metadata";
import { events, EventNames } from "../events";
import { generateDeterministicUUID, generateUUID, getMimeTypeFromExtension } from "../utils";
import { INDEX_PATH, ENTRIES_DIR, ASSETS_DIR, LATEX_DIR } from "../constants";
import { IWorkspaceStore, WorkspaceMode } from "./types";
import { isMobileDevice } from "@/hooks/useDevice";

export class ProjectManager {
  private store: IWorkspaceStore;

  constructor(store: IWorkspaceStore) {
    this.store = store;
  }

  async refreshProjects() {
    this.store.projects = await getProjects();
    // Sync currentProject if it was renamed
    if (this.store.currentProjectId && this.store.currentProject) {
      const updated = this.store.projects.find(p => p.id === this.store.currentProjectId);
      if (updated && updated.name !== this.store.currentProject.name) {
        this.store.currentProject = { ...updated };
      }
    }
    this.store.notifyStateChange();
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
    for (const p of this.store.projects) {
      if (p.type === "local") {
        try {
          const existingHandle = await getProjectHandle(p.id);
          if (existingHandle && await handle.isSameEntry(existingHandle)) {
            return p.id;
          }
        } catch { }
      }
    }

    const id = generateUUID();

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
    const { clearAllPending, clearAllResources } = await import("../db");
    const dbName = "notebook-project-temporary";
    await clearAllPending(dbName);
    await clearAllResources(dbName);
    return "temporary";
  }

  async selectProject(id: string) {
    if (this.store.currentProjectId === id && id !== "temporary" && this.store.isInitialized && !this.store.isLoading) return;

    this.store.debouncedPersist.flush();

    // For temporary workspaces, if this is the initial load of the session, clear the DB
    // to fulfill the UI promise of "Lost on reload".
    if (id === "temporary" && this.store.mode === "none") {
      const { clearAllPending, clearAllResources } = await import("../db");
      const dbName = "notebook-project-temporary";
      await clearAllPending(dbName);
      await clearAllResources(dbName);
    }

    this.store.workspaceVersion++;
    // Ensure all pending I/O for the current project is finished before switching
    await this.store.queue;

    this.store.selectedPaths = new Set();
    this.store.setLoading(true, "Loading workspace...");
    try {
      if (id === "temporary") {
        if (this.store.currentProjectId !== "temporary") {
          this.store.currentProject = { id: "temporary", name: "Temporary Project", type: "temporary", lastOpened: new Date().toISOString() };
          this.store.currentProjectId = "temporary";
          this.store.mode = "temporary";
          this.store.metadata = EMPTY_METADATA;
          this.store.entries = [];

          // Persist initial LaTeX metadata files for temporary projects so exports include them
          try {
            await this.store.updateLatexMetadata();
          } catch (err) {
            console.warn("Failed to generate initial LaTeX files for temporary workspace:", err);
          }

          // Update URL for temporary project
          const url = new URL(window.location.href);
          url.searchParams.set('project', "temporary");
          if (url.pathname === '/') url.pathname = '/workspace/editor';
          if (window.location.href !== url.toString()) {
            window.history.pushState({}, '', url.toString());
          }
        }
        this.store.notifyStateChange();
        return;
      }

      const project = await getProject(id);
      if (!project) {
        this.store.disconnect();
        window.history.replaceState({}, '', '/');
        this.store.notifyStateChange();
        events.emit(EventNames.SHOW_NOTIFICATION, { message: "Project not found", type: "error" });
        return;
      }

      this.store.currentProject = project;
      this.store.currentProjectId = id;
      const projectType = project.type as WorkspaceMode;

      if (projectType === "local") {
        if (typeof window !== "undefined" && (!("showDirectoryPicker" in window) || isMobileDevice())) {
          this.store.disconnect();
          events.emit(EventNames.SHOW_NOTIFICATION, {
            message: "Local folder workspaces are only supported on desktop browsers. Please use a GitHub workspace on mobile.",
            type: "error"
          });
          window.history.replaceState({}, '', '/');
          this.store.notifyStateChange();
          return;
        }

        this.store.mode = "local";
        const handle = await getProjectHandle(id);
        if (handle) {
          this.store.dirHandle = handle;
          let hasPermission = false;
          try {
            if (typeof handle.queryPermission === "function") {
              const status = await handle.queryPermission({ mode: "readwrite" });
              hasPermission = status === "granted";
            }
          } catch (e) {
            console.warn("Could not query handle permission:", e);
          }

          if (hasPermission) {
            try {
              await this.loadLocalWorkspace();
              this.store.needsPermission = false;
            } catch (err) {
              console.warn("Failed to load local workspace despite permission query:", err);
              this.store.needsPermission = true;
            }
          } else {
            this.store.needsPermission = true;
          }
        } else {
          this.store.dirHandle = null;
          this.store.needsPermission = true;
        }
      } else if (projectType === "github") {
        const token = localStorage.getItem("nb-github-token");
        if (!token) {
          this.store.disconnect();
          events.emit(EventNames.SHOW_GITHUB_LOGIN, { loginOnly: true, projectId: project.id });
          window.history.replaceState({}, '', '/');
          this.store.notifyStateChange();
          return;
        }

        this.store.config = {
          token,
          owner: project.githubConfig!.owner,
          repo: project.githubConfig!.repo,
          branch: project.githubConfig!.branch,
          baseDir: project.githubConfig!.folderPath,
          entriesDir: ENTRIES_DIR,
          resourcesDir: ASSETS_DIR
        };

        try {
          // Verify token before transitioning to workspace view
          await fetchGitHubUser(token);

          await this.loadGitHubWorkspace();
          this.store.mode = "github";
        } catch (error: unknown) {
          const err = error as { status?: number };
          console.error("Failed to load GitHub workspace:", error);
          this.store.disconnect();
          const msg = err.status === 401 ? "GitHub session expired. Please sign in again." :
            err.status === 403 ? "You do not have access to this repository." :
              err.status === 404 ? "Repository or folder not found." :
                "Failed to connect to GitHub. Check your internet or token.";
          if (err.status === 401) {
            events.emit(EventNames.SHOW_GITHUB_LOGIN, { loginOnly: true, projectId: project.id });
            events.emit(EventNames.GITHUB_SESSION_EXPIRED);
          } else {
            events.emit(EventNames.SHOW_NOTIFICATION, { message: msg, type: "error" });
          }
          window.history.replaceState({}, '', '/');
          this.store.notifyStateChange();
          return;
        }
      } else if (this.store.mode === "temporary") {
        this.store.metadata = EMPTY_METADATA;
        this.store.entries = [];
      }

      // Update URL to reflect the project selection
      const url = new URL(window.location.href);
      url.searchParams.set('project', id);
      if (url.pathname === '/') url.pathname = '/workspace/editor';
      if (window.location.href !== url.toString()) {
        window.history.pushState({}, '', url.toString());
      }

      events.emit(EventNames.PROJECT_LOADED, project);
      await this.store.refreshPending();

      // Update last opened timestamp only if successfully opened
      if (this.store.mode !== "none") {
        project.lastOpened = new Date().toISOString();
        await saveProject(project);
        await this.refreshProjects();
      }
    } finally {
      this.store.setLoading(false);
    }
  }

  async loadLocalWorkspace() {
    if (!this.store.dirHandle) return;

    // Ensure core directories exist
    await ensureLocalDirectory(this.store.dirHandle, ENTRIES_DIR);
    await ensureLocalDirectory(this.store.dirHandle, ASSETS_DIR);
    await ensureLocalDirectory(this.store.dirHandle, LATEX_DIR);

    const files = await listLocalFiles(this.store.dirHandle, ENTRIES_DIR);
    this.store.entries = files;
    let isNew = false;
    try {
      const metaStr = await readLocalFile(this.store.dirHandle, INDEX_PATH);
      const parsed = JSON.parse(metaStr);

      // Hydrate team assets
      const assetCache = new Map<string, string>();
      const fetchLocalAsset = async (path: string) => {
        if (!path || path.startsWith('data:')) return;
        try {
          const res = await getLocalFileContent(this.store.dirHandle!, path);
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
      assetCache.forEach((v, k) => this.store.assetCache.set(k, v));
      this.store.metadata = validateNotebookIntegrity({ ...EMPTY_METADATA, ...parsed });
    } catch {
      this.store.metadata = validateNotebookIntegrity(EMPTY_METADATA);
      isNew = true;
      // Initialize notebook.json
      await writeLocalFile(this.store.dirHandle, INDEX_PATH, JSON.stringify(this.store.metadata, null, 2));
    }
    this.store.isMainTexPresent = await checkLocalFileExists(this.store.dirHandle, "main.tex");

    if (isNew) {
      await this.store.updateLatexMetadata();
    }
  }

  async grantLocalPermission(): Promise<boolean> {
    if (!this.store.dirHandle) return false;
    try {
      const mode = "readwrite";
      let status: PermissionState = "denied";
      if (typeof this.store.dirHandle.requestPermission === "function") {
        status = await this.store.dirHandle.requestPermission({ mode });
      }
      if (status === "granted") {
        this.store.needsPermission = false;
        await this.loadLocalWorkspace();
        if (this.store.currentProjectId) {
          const project = await getProject(this.store.currentProjectId);
          if (project) {
            project.lastOpened = new Date().toISOString();
            await saveProject(project);
            await this.refreshProjects();
          }
        }
        this.store.notifyStateChange();
        events.emit(EventNames.SHOW_NOTIFICATION, { message: "Folder access granted.", type: "success" });
        return true;
      }
    } catch (err) {
      console.error("Failed to request permission:", err);
      events.emit(EventNames.SHOW_NOTIFICATION, { message: "Permission not granted. Please re-select the folder.", type: "error" });
    }
    return false;
  }

  async reselectLocalFolder(): Promise<boolean> {
    if (typeof window === "undefined" || !("showDirectoryPicker" in window) || isMobileDevice()) {
      events.emit(EventNames.SHOW_NOTIFICATION, {
        message: "Local folder workspaces are only supported on desktop browsers.",
        type: "error"
      });
      return false;
    }
    try {
      const newHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      const currentId = this.store.currentProjectId;
      if (currentId && currentId !== "temporary") {
        await saveProjectHandle(currentId, newHandle);
        const project = await getProject(currentId);
        if (project) {
          project.name = newHandle.name;
          project.lastOpened = new Date().toISOString();
          await saveProject(project);
          this.store.currentProject = project;
          await this.refreshProjects();
        }
      }
      this.store.dirHandle = newHandle;
      this.store.needsPermission = false;
      await this.loadLocalWorkspace();
      this.store.notifyStateChange();
      events.emit(EventNames.SHOW_NOTIFICATION, { message: `Connected to ${newHandle.name}.`, type: "success" });
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return false;
      console.error("Failed to reselect folder:", err);
      events.emit(EventNames.SHOW_NOTIFICATION, { message: "Failed to open selected folder.", type: "error" });
      return false;
    }
  }

  async loadGitHubWorkspace() {
    if (!this.store.config) throw new Error("GitHub configuration missing");
    if (!this.store.config.token) throw new Error("GitHub token is required");

    const dbName = this.store.getDBName();
    const normalizedBase = this.store.config.baseDir ? this.store.config.baseDir.replace(/^\/+|\/+$/g, '') : '';
    const basePrefix = normalizedBase ? normalizedBase + '/' : '';
    const actualIndexPath = `${basePrefix}${INDEX_PATH}`;
    let isNew = false;

    const files = await fetchDirectoryTree(this.store.config, `${basePrefix}${ENTRIES_DIR}`);
    const entryFiles = Array.isArray(files) ? files.map((f: GitHubFile) => ({
      name: f.name,
      path: f.path.startsWith(basePrefix) ? f.path.slice(basePrefix.length) : f.path
    })) : [];

    const pending = await getAllPending(dbName);
    const pendingMeta = pending.find(p => p.path === INDEX_PATH && p.operation === "upsert");

    if (pendingMeta?.content) {
      const parsed = JSON.parse(pendingMeta.content);
      this.store.metadata = validateNotebookIntegrity({ ...EMPTY_METADATA, ...parsed });
    } else {
      try {
        const metaStr = await fetchFileContent(this.store.config, actualIndexPath);
        this.store.metadata = validateNotebookIntegrity({ ...EMPTY_METADATA, ...JSON.parse(metaStr) });
      } catch {
        this.store.metadata = validateNotebookIntegrity(EMPTY_METADATA);
        isNew = true;
        // Stage default metadata
        await stageChange(dbName, {
          path: INDEX_PATH,
          operation: "upsert",
          content: JSON.stringify(this.store.metadata, null, 2),
          label: "Initialize notebook.json",
          stagedAt: new Date().toISOString()
        });
        await this.store.refreshPending();
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
    this.store.entries = mergedEntries;

    // Hydrate team assets for GitHub
    if (this.store.metadata.team) {
      const dbName = this.store.getDBName();
      const team = this.store.metadata.team;

      const fetchAsset = async (path: string) => {
        if (!path || path.startsWith('data:')) return;
        try {
          // 1. Check if already in memory
          if (this.store.assetCache.has(path)) {
            return;
          }

          // 2. Check pending changes store (for newly uploaded but uncommitted images)
          const pending = await getPending(dbName, path);
          if (pending?.content) {
            const dataUrl = `data:${getMimeTypeFromExtension(path)};base64,${pending.content}`;
            this.store.assetCache.set(path, dataUrl);
            return;
          }

          // 3. Check resource cache
          let cached = await getResource(dbName, path);
          if (cached) {
            // Fix legacy/corrupted image/* prefix from previous versions
            if (cached.startsWith('data:image/*;base64,')) {
              cached = cached.replace('data:image/*;base64,', `data:${getMimeTypeFromExtension(path)};base64,`);
              await putResource(dbName, { path, dataUrl: cached }); // Update cache with fix
            }
          }

          if (cached) {
            this.store.assetCache.set(path, cached);
            return;
          }

          // 4. Fetch from GitHub
          const actualPath = this.store.getFullPath(path);
          const base64 = await fetchRawFileContent(this.store.config!, actualPath);
          const dataUrl = `data:${getMimeTypeFromExtension(path)};base64,${base64}`;
          this.store.assetCache.set(path, dataUrl);
          await putResource(dbName, { path, dataUrl });
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

    this.store.isMainTexPresent = await checkGitHubFileExists(this.store.config, `${basePrefix}main.tex`);
    if (isNew) {
      await this.store.updateLatexMetadata();
    }
  }

  async reloadWorkspace() {
    if (this.store.mode === "local") {
      await this.loadLocalWorkspace();
    } else if (this.store.mode === "github") {
      await this.loadGitHubWorkspace();
    } else if (this.store.mode === "temporary") {
      // Re-populate entries from metadata for temporary mode
      this.store.entries = Object.values(this.store.metadata.entries).map(e => ({
        name: e.filename.split('/').pop() || '',
        path: e.filename
      })).sort((a, b) => {
        const metaA = this.store.metadata.entries[a.path.split('/').pop()?.replace('.json', '') || ''];
        const metaB = this.store.metadata.entries[b.path.split('/').pop()?.replace('.json', '') || ''];
        const timeA = metaA?.updatedAt || metaA?.createdAt || 0;
        const timeB = metaB?.updatedAt || metaB?.createdAt || 0;
        return new Date(timeB).getTime() - new Date(timeA).getTime();
      });
      this.store.notifyStateChange();
    }
  }
}
