"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "next-themes";
import {
  fetchGitHubUser, initiateGitHubLogin, checkGitHubFileExists
} from "@/lib/github";
import { checkLocalFileExists } from "@/lib/fs";
import GitHubConnectionDialog from "./GitHubConnectionDialog";
import { ExplorerFile, TeamTab, GitHubConfig } from "@/lib/types";
import {
  Project, deleteProject, deleteProjectHandle, deleteProjectDatabase,
  getProjectDBName
} from "@/lib/db";
import Home from "./Home";
import Editor from "./Editor";
import WelcomePage from "./WelcomePage";
import Sidebar from "./Sidebar";
import TeamEditor from "./TeamEditor";
import NotebookCompiler from "./NotebookCompiler";
import HelpPage from "./HelpPage";
import ProjectHeader from "./ProjectHeader";
import AboutPage from "./AboutPage";
import LoadingOverlay from "./LoadingOverlay";
import Logo from "./ui/Logo";
import { ViewMode } from "./ViewToggle";
import ConfirmationDialog from "./ConfirmationDialog";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { HardDrive, X, Loader2 } from "lucide-react";
import { ImperativePanelHandle } from "react-resizable-panels";
import { ENTRIES_DIR, } from "@/lib/constants";
import { useWorkspace } from "@/hooks/useWorkspace";
import { events, EventNames } from "@/lib/events";
import { Toaster } from "react-hot-toast";
import { showNotification } from "./Notification";

// ─── Types ────────────────────────────────────────────────────────────────────


export interface FileMetadata {
  content: string;
  title?: string;
  author?: string;
  phase?: number | null;
  createdAt?: string;
}



// ─── Helpers ──────────────────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

export default function App() {
  const {
    mode,
    config,
    currentProjectId,
    isLoading,
    loadingLabel,
    isInitialized,
    projects,
    openFile,
    refreshProjects,
    renameProject,
    selectProject,
    createEntry,
    disconnect,
    createGithubProject,
    createLocalProject,
    createTemporaryProject,
    dirHandle,
    navigateTo,
    exportNotebook,
    importNotebook,
    selectedPaths,
    setSelectedPaths,
    hasEntryInUrl,
    showTeamEditor,
    teamTab,
    showCompiler,
    showHelp,
    showAbout,
    helpPath,
    getCompiledPdfUrl,
    isSaving,
    isPendingSave,
  } = useWorkspace();

  // Global loading overlay for background operations (like importing/exporting)
  const isGlobalLoading = isLoading && loadingLabel && loadingLabel !== "Loading team..." && loadingLabel !== "Opening entry...";

  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [githubToken, setGithubToken] = useState<string | null>(null);
  const [githubUser, setGithubUser] = useState<string | null>(null);
  const [isExchangingCode, setIsExchangingCode] = useState(false);
  const authCheckStarted = useRef(false);
  const [autoOpenGithubModal, setAutoOpenGithubModal] = useState(false);
  const [showGitHubLoginOnly, setShowGitHubLoginOnly] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);





  const notify = useCallback((message: string, type: "error" | "success" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
    variant?: "danger" | "warning" | "info";
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => { },
  });

  const showConfirm = useCallback((title: string, message: string, onConfirm: () => void, variant: "danger" | "warning" | "info" = "danger", onCancel?: () => void) => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        onConfirm();
      },
      onCancel: () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        onCancel?.();
      },
      variant
    });
  }, []);

  const [mounted, setMounted] = useState(false);
  const isMobile = useIsMobile();
  const [userSidebarPreference, setUserSidebarPreference] = useState<boolean | null>(null);
  const isSidebarOpen = userSidebarPreference ?? !isMobile;
  const [viewMode, setViewMode] = useState<ViewMode>("editor");

  const editorPanelRef = useRef<ImperativePanelHandle>(null);
  const previewPanelRef = useRef<ImperativePanelHandle>(null);

  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
  const isToggleFromButton = useRef(false);
  const lastSelectedPathRef = useRef<string | null>(null);
  const { theme, setTheme } = useTheme();
  const isDarkMode = theme === "dark";
  const [isRenamingProject, setIsRenamingProject] = useState(false);
  const [projectRenameValue, setProjectRenameValue] = useState("");
  const importEntryInputRef = useRef<HTMLInputElement>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const navigateToHome = useCallback(() => {
    navigateTo({ project: null, entry: null, resource: null }, "/");
  }, [navigateTo]);

  const checkUnsaved = useCallback(
    (action: () => void) => {
      if (isSaving || isPendingSave) {
        showConfirm(
          "Unsaved Changes",
          "You have changes that are currently being saved. If you leave now, some changes might be lost. Are you sure you want to proceed?",
          action,
          "warning"
        );
      } else {
        action();
      }
    },
    [isSaving, isPendingSave, showConfirm]
  );

  const handleGoHome = useCallback(() => {
    checkUnsaved(navigateToHome);
  }, [checkUnsaved, navigateToHome]);

  const handleCloseHelp = useCallback(() => {
    if (currentProjectId) {
      navigateTo({}, '/workspace/editor');
    } else {
      handleGoHome();
    }
  }, [currentProjectId, navigateTo, handleGoHome]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isSaving || isPendingSave) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes that are currently being saved. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isSaving, isPendingSave]);

  const onSignOutGithub = useCallback(() => {
    localStorage.removeItem("nb-github-token");
    localStorage.removeItem("nb-github-user");
    setGithubToken(null);
    setGithubUser(null);
  }, []);


  // Listen for global events
  useEffect(() => {
    const unsubNotification = events.on(EventNames.SHOW_NOTIFICATION, (data: unknown) => {
      if (typeof data === 'object' && data !== null && 'message' in data) {
        const notification = data as { message: string; type?: "success" | "error" | "loading" | "info" };
        showNotification(notification.message, notification.type || "info");
      }
    });

    const unsubLogin = events.on(EventNames.SHOW_GITHUB_LOGIN, (data: unknown) => {
      const options = data as { loginOnly?: boolean; projectId?: string } | undefined;
      if (options?.projectId) {
        setPendingProjectId(options.projectId);
      }
      if (options?.loginOnly) {
        setShowGitHubLoginOnly(true);
      } else {
        setAutoOpenGithubModal(true);
      }
    });

    const unsubSessionExpired = events.on(EventNames.GITHUB_SESSION_EXPIRED, () => {
      onSignOutGithub();
    });

    return () => {
      unsubNotification();
      unsubLogin();
      unsubSessionExpired();
    };
  }, [onSignOutGithub]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (authCheckStarted.current) return;
    authCheckStarted.current = true;

    const checkAuth = async () => {
      const storedToken = localStorage.getItem("nb-github-token");
      const storedUser = localStorage.getItem("nb-github-user");

      if (storedToken) {
        setGithubToken(storedToken);
        setGithubUser(storedUser);
      }

      // Handle OAuth callback
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code) {
        setIsExchangingCode(true);
        try {
          const response = await fetch("/api/auth/github", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code }),
          });

          const data = await response.json();
          if (data.access_token) {
            localStorage.setItem("nb-github-token", data.access_token);
            setGithubToken(data.access_token);

            const user = await fetchGitHubUser(data.access_token);
            localStorage.setItem("nb-github-user", user.login);
            setGithubUser(user.login);

            showNotification("Successfully signed in with GitHub!", "success");
          } else {
            throw new Error(data.error || "Failed to exchange code");
          }
        } catch (e) {
          console.error("GitHub auth error:", e);
          showNotification("GitHub authentication failed.", "error");
        } finally {
          setIsExchangingCode(false);

          // Clean up URL and recover state
          const url = new URL(window.location.href);
          const state = params.get("state");

          // Remove OAuth specific params
          url.searchParams.delete("code");
          url.searchParams.delete("state");

          // Restore original search params from state if they exist
          if (state) {
            const stateParams = new URLSearchParams(state);
            stateParams.forEach((val, key) => {
              url.searchParams.set(key, val);
            });
          }

          window.history.replaceState({}, "", url.toString());

          // If we have a project in the URL and we are not in a workspace, try selecting it now
          const projectInUrl = url.searchParams.get("project");
          if (projectInUrl && mode === "none") {
            selectProject(projectInUrl);
          }
          setPendingProjectId(null);
        }
      }
    };

    checkAuth();
  }, [mode, disconnect, navigateToHome, selectProject]);

  // Separate effect for syncing view mode from URL (including back button support)
  useEffect(() => {
    const syncView = () => {
      const params = new URLSearchParams(window.location.search);

      const view = params.get("view") || "editor";
      if (view === "editor" || view === "split" || view === "latex") {
        setViewMode(view === "latex" ? "preview" : view);
      }
    };

    syncView();
    window.addEventListener('popstate', syncView);
    const unsub = events.on(EventNames.STATE_CHANGED, syncView);

    return () => {
      window.removeEventListener('popstate', syncView);
      unsub();
    };
  }, []);

  // Load last compiled PDF URL when project changes or app initializes
  useEffect(() => {
    if (isInitialized && currentProjectId) {
      const loadPdf = async () => {
        const url = await getCompiledPdfUrl();
        if (url) setPdfUrl(url);
      };
      loadPdf();
    }
  }, [isInitialized, currentProjectId, getCompiledPdfUrl]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (mode === "temporary") {
        e.preventDefault();
        return "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [mode]);

  useEffect(() => {
    if (!sidebarPanelRef.current || isMobile) return;
    if (isSidebarOpen) {
      if (isToggleFromButton.current) {
        sidebarPanelRef.current.expand();
        sidebarPanelRef.current.resize(20);
      } else {
        sidebarPanelRef.current.expand();
      }
    } else {
      sidebarPanelRef.current.collapse();
    }
    isToggleFromButton.current = false;
  }, [isSidebarOpen, isMobile]);

  useEffect(() => {
    if (!editorPanelRef.current || !previewPanelRef.current) return;
    const effectiveView = (isMobile && viewMode === "split") ? "editor" : viewMode;

    if (effectiveView === "editor") {
      editorPanelRef.current.expand();
      previewPanelRef.current.collapse();
    } else if (effectiveView === "preview") {
      editorPanelRef.current.collapse();
      previewPanelRef.current.expand();
    } else { // split
      editorPanelRef.current.resize(50);
      previewPanelRef.current.resize(50);
    }
  }, [isMobile, viewMode]);

  // Auto-close sidebar on mobile during navigation
  const [lastNavKey, setLastNavKey] = useState<string | null>(null);
  const currentNavKey = `${isMobile}-${openFile?.id || ''}-${currentProjectId || ''}`;

  if (isMobile && currentNavKey !== lastNavKey) {
    setLastNavKey(currentNavKey);
    if (openFile?.id || currentProjectId) {
      setUserSidebarPreference(false);
    }
  }

  const handleSetViewMode = (mode: ViewMode) => {
    const viewParam = mode === "preview" ? "latex" : mode;
    navigateTo({ view: viewParam });
  };

  const handleNewEntry = async () => {
    try {
      const id = await createEntry();
      const path = `${ENTRIES_DIR}/${id}.json`;
      setSelectedPaths(new Set([path]));
      lastSelectedPathRef.current = path;
      navigateTo({ entry: id }, '/workspace/editor');
      if (isMobile) setUserSidebarPreference(false);
    } catch {
      notify("Failed to create entry.", "error");
    }
  };

  const handleSelectEntry = (file: ExplorerFile, multi: boolean, range: boolean, visiblePaths: string[]) => {
    if (range && lastSelectedPathRef.current) {
      const start = visiblePaths.indexOf(lastSelectedPathRef.current);
      const end = visiblePaths.indexOf(file.path);
      if (start !== -1 && end !== -1) {
        const [min, max] = [Math.min(start, end), Math.max(start, end)];
        const newSelection = new Set(selectedPaths);
        for (let i = min; i <= max; i++) {
          newSelection.add(visiblePaths[i]);
        }
        setSelectedPaths(newSelection);
        lastSelectedPathRef.current = file.path;
        return;
      }
    }

    if (multi) {
      const id = file.path;
      setSelectedPaths((prev: Set<string>) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      lastSelectedPathRef.current = file.path;
    } else {
      setSelectedPaths(new Set([file.path]));
      lastSelectedPathRef.current = file.path;
    }
  };

  const handleOpenEntry = useCallback((file: ExplorerFile) => {
    const id = file.name.replace('.json', '');
    navigateTo({ entry: id, resource: null }, '/workspace/editor');
    if (isMobile) setUserSidebarPreference(false);
  }, [isMobile, navigateTo]);

  const handleOpenTeamEditor = (tab: TeamTab = "identity") => {
    navigateTo({}, `/workspace/team/${tab}`);
  };

  const handleDisconnect = async () => {
    const proceed = async () => {
      await disconnect();
      navigateToHome();
    };

    if (mode === "temporary") {
      showConfirm(
        "Leave Temporary Workspace?",
        "All changes in this temporary workspace will be lost forever if you disconnect. Are you sure you want to leave?",
        proceed,
        "warning"
      );
    } else {
      checkUnsaved(proceed);
    }
  };


  if (!mounted) return null;
  const handleCreateGithub = async (config: GitHubConfig) => {
    try {
      const normalizedBase = config.baseDir ? config.baseDir.replace(/^\/+|\/+$/g, '') : '';
      const basePrefix = normalizedBase ? normalizedBase + '/' : '';
      const hasMain = await checkGitHubFileExists(config, `${basePrefix}main.tex`);

      const proceed = async () => {
        const storeConfig = {
          owner: config.owner,
          repo: config.repo,
          branch: config.branch,
          folderPath: config.baseDir || "",
          name: config.baseDir ? `${config.repo}/${config.baseDir.replace(/^\/+|\/+$/g, '')}` : config.repo
        };
        const id = await createGithubProject(storeConfig);
        selectProject(id);
      };

      if (!hasMain) {
        showConfirm(
          "Verify Project Root",
          "This location doesn't appear to have a main.tex file in the root. Are you sure this is the correct project folder?",
          proceed,
          "warning"
        );
      } else {
        await proceed();
      }
    } catch {
      notify("Failed to create GitHub project.", "error");
    }
  };

  const handleCreateLocal = async (handle: FileSystemDirectoryHandle) => {
    try {
      const hasMain = await checkLocalFileExists(handle, "main.tex");

      const proceed = async () => {
        const id = await createLocalProject(handle, handle.name);
        selectProject(id);
      };

      if (!hasMain) {
        showConfirm(
          "Verify Project Root",
          "This folder doesn't appear to have a main.tex file in the root. Are you sure you've selected the correct project folder?",
          proceed,
          "warning"
        );
      } else {
        await proceed();
      }
    } catch {
      notify("Failed to create Local project.", "error");
    }
  };

  const handleCreateTemporary = async () => {
    try {
      const id = await createTemporaryProject();
      selectProject(id);
    } catch {
      notify("Failed to create Temporary project.", "error");
    }
  };

  const handleRenameProject = async (id: string, name: string) => {
    await renameProject(id, name);
  };

  const handleDeleteProject = async (id: string) => {
    showConfirm("Delete Project?", "Are you sure? This will delete the project from your list.", async () => {
      await deleteProject(id);
      await deleteProjectHandle(id);
      const p = projects.find(pr => pr.id === id);
      if (p) await deleteProjectDatabase(getProjectDBName(p));
      refreshProjects();
      if (currentProjectId === id) handleDisconnect();
    });
  };

  const handleExportNotebook = async () => {
    await exportNotebook();
  };

  const importNotebookFromFile = async (file: File) => {
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const data = JSON.parse(reader.result as string);
          await importNotebook(data);
        } catch (error) {
          console.error("Import failed", error);
          showNotification(error instanceof Error ? error.message : "Invalid import file", "error");
        }
      };
      reader.onerror = () => {
        showNotification("Failed to read file", "error");
      };
      reader.readAsText(file);
    } catch {
      showNotification("Import failed", "error");
    }
  };

  const handleImportNotebook = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) importNotebookFromFile(file);
    };
    input.click();
  };

  const processImportFile = async (file: File) => {
    await importNotebookFromFile(file);
  };

  const requestPermission = async () => {
    if (dirHandle) {
      const mode = 'readwrite';
      if ((await dirHandle.requestPermission({ mode })) === 'granted') {
        setNeedsPermission(false);
        selectProject(currentProjectId!);
      }
    }
  };

  const currentProject = projects.find(p => p.id === currentProjectId) || (currentProjectId === "temporary" ? { id: "temporary", name: "Temporary Workspace" } as Project : null);
  const workspaceLabel = mode === "github" ? `${config?.owner}/${config?.repo}` : (mode === "local" ? (currentProject?.name ?? "Local Folder") : "Memory");

  if (!mounted) return null;

  const sidebar = (
    <div className="flex flex-col h-full overflow-hidden bg-nb-surface-low">
      <div
        className="flex items-center gap-3 px-4 h-14 border-b border-nb-outline-variant shrink-0 bg-nb-surface"
      >
        <div
          onClick={handleGoHome}
          className="flex items-center gap-3 cursor-pointer group flex-1 min-w-0"
        >
          <div className="w-7 h-7 rounded-lg bg-nb-primary flex items-center justify-center shadow-sm shadow-nb-primary/20 group-hover:scale-110 transition-transform">
            <Logo className="text-white" size={18} strokeWidth={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-nb-on-surface truncate tracking-tight group-hover:text-nb-primary transition-colors">ENGen</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isMobile && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setUserSidebarPreference(false);
              }}
              className="p-1.5 cursor-pointer rounded-lg hover:bg-nb-surface-low text-nb-on-surface-variant transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <Sidebar
          selectedPaths={selectedPaths}
          onSelectEntry={handleSelectEntry}
          onOpenEntry={handleOpenEntry}
          onOpenTeam={handleOpenTeamEditor}
          showConfirm={showConfirm}
          onNewEntry={handleNewEntry}
          onSelectAll={(paths) => setSelectedPaths(new Set(paths))}
        />
      </div>
    </div>
  );

  const main = (
    <div className="flex flex-col h-full overflow-hidden">
      <ProjectHeader
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => { isToggleFromButton.current = true; setUserSidebarPreference(!isSidebarOpen); }}
        isMobile={isMobile}
        viewMode={viewMode}
        onSetViewMode={handleSetViewMode}
        isRenamingProject={isRenamingProject}
        projectRenameValue={projectRenameValue}
        onSetProjectRenameValue={setProjectRenameValue}
        onStartRename={() => { if (currentProject) { setProjectRenameValue(currentProject.name); setIsRenamingProject(true); } }}
        onEndRename={(save) => { if (save && currentProjectId) handleRenameProject(currentProjectId, projectRenameValue); setIsRenamingProject(false); }}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setTheme(isDarkMode ? "light" : "dark")}
        onOpenHelp={() => navigateTo({}, '/workspace/help')}
        onOpenTeam={handleOpenTeamEditor}
        onOpenCompiler={() => navigateTo({}, '/workspace/compile')}
        onImport={handleImportNotebook}
        onExport={handleExportNotebook}
        onDisconnect={handleDisconnect}
        onGoHome={handleGoHome}
        mounted={mounted}
      />

      <div className="flex-1 overflow-hidden relative bg-nb-bg">
        {((needsPermission && mode === "local")) && (
          <div className="absolute inset-0 z-[200] bg-nb-bg/80 backdrop-blur-md flex items-center justify-center p-8">
            <div className="max-w-md w-full bg-nb-surface border border-nb-outline-variant rounded-3xl p-8 shadow-2xl text-center animate-in fade-in zoom-in duration-300">
              <div className="w-20 h-20 rounded-2xl bg-nb-primary/10 text-nb-primary flex items-center justify-center mx-auto mb-8"><HardDrive size={40} /></div>
              <h2 className="text-2xl font-bold text-nb-on-surface mb-4">Connect to Workspace</h2>
              <p className="text-sm text-nb-on-surface-variant mb-10 leading-relaxed px-4">Browser needs permission to access <strong>{dirHandle?.name || "the local folder"}</strong>.</p>
              <div className="flex flex-col gap-3">
                <button onClick={requestPermission} className="w-full bg-nb-primary hover:bg-nb-primary-dim text-white font-bold py-4 rounded-xl shadow-lg shadow-nb-primary/20 transition-all active:scale-[0.98]">Grant Access</button>
                <button onClick={handleDisconnect} className="w-full bg-nb-surface-low text-nb-on-surface-variant hover:text-nb-on-surface font-bold py-4 rounded-xl transition-all">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {(showTeamEditor) ? (
          <div className="flex-1 flex flex-col min-h-0 relative h-full">
            {isLoading ? (
              <div className="absolute inset-0 bg-nb-bg flex items-center justify-center z-50 animate-in fade-in duration-300">
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="w-8 h-8 text-nb-primary animate-spin" />
                  <span className="text-sm text-nb-text-secondary animate-pulse tracking-wide uppercase font-bold text-[10px]">Loading team...</span>
                </div>
              </div>
            ) : (
              <TeamEditor
                key={`${currentProjectId}-team`}
                onClose={() => navigateTo({}, '/workspace/editor')}
                initialTab={teamTab}
                onTabChange={(tab) => navigateTo({}, `/workspace/team/${tab}`)}
              />
            )}
          </div>
        ) : (showCompiler) ? (
          <div className="flex-1 flex flex-col min-h-0 relative h-full">
            <NotebookCompiler
              onClose={() => navigateTo({}, '/workspace/editor')}
            />
          </div>
        ) : (openFile || hasEntryInUrl) ? (
          <div className="flex-1 flex flex-col min-h-0 relative h-full">
            {!openFile && (
              <div className="absolute inset-0 bg-nb-bg flex items-center justify-center z-50 animate-in fade-in duration-300">
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="w-8 h-8 text-nb-primary animate-spin" />
                  <span className="text-sm text-nb-text-secondary animate-pulse tracking-wide uppercase font-bold text-[10px]">Opening entry...</span>
                </div>
              </div>
            )}
            {openFile && (
              <Editor
                key={openFile.path}
                onClose={() => navigateTo({ entry: null, resource: null })}
                showConfirm={showConfirm}
                viewMode={viewMode}
                onSetViewMode={handleSetViewMode}
                pdfUrl={pdfUrl || undefined}
                onOpenHelp={() => navigateTo({}, '/workspace/help/editor')}
              />
            )}
          </div>
        ) : (
          <div className="flex-1 h-full overflow-y-auto custom-scrollbar bg-nb-bg">
            <WelcomePage
              workspace={{ mode: mode as "local" | "github" | "temporary", label: workspaceLabel }}
              onNewEntry={handleNewEntry}
              onImportEntry={() => importEntryInputRef.current?.click()}
              onDisconnect={handleDisconnect}
              onOpenSidebar={() => { isToggleFromButton.current = true; setUserSidebarPreference(true); }}
              onOpenTeam={handleOpenTeamEditor}
              onOpenCompiler={() => navigateTo({}, '/workspace/compile')}
              onOpenHelp={() => navigateTo({}, '/help')}
            />
          </div>
        )}
      </div>
    </div>
  );


  return (
    <div className="flex flex-col h-screen w-full bg-nb-bg font-sans overflow-hidden">
      <input type="file" ref={importEntryInputRef} accept=".json" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; if (file) processImportFile(file); e.target.value = ""; }} />

      {mode === "none" ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <Home
            projects={projects}
            onSelectProject={selectProject}
            onDeleteProject={handleDeleteProject}
            onRenameProject={handleRenameProject}
            onCreateGithub={handleCreateGithub}
            onCreateLocal={handleCreateLocal}
            onCreateTemporary={handleCreateTemporary}
            onSignOutGithub={onSignOutGithub}

            githubToken={githubToken}
            githubUser={githubUser}
            isExchangingGithubCode={isExchangingCode}
            autoOpenGithubModal={autoOpenGithubModal}
            onCloseGithubModal={() => setAutoOpenGithubModal(false)}
            onOpenHelp={() => navigateTo({}, '/help')}
            onOpenAbout={() => navigateTo({}, '/about')}
          />
        </div>
      ) : (
        <div className="flex w-full h-full relative overflow-hidden">
          {isMobile ? (
            <div className="flex w-full h-full relative overflow-hidden">
              <div className="flex-1 w-full h-full">{main}</div>
              <div className={`fixed inset-0 z-[500] transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                <div className="absolute inset-0 bg-black/40" onClick={() => setUserSidebarPreference(false)} />
                <div className={`absolute top-0 bottom-0 left-0 w-[85%] max-w-[300px] bg-nb-surface-low border-r border-nb-outline-variant flex flex-col shadow-2xl transition-transform duration-300 ease-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                  {sidebar}
                </div>
              </div>
            </div>
          ) : (
            <PanelGroup direction="horizontal" className="w-full h-full" id="main-layout-group">
              <Panel
                id="sidebar-panel" order={1} ref={sidebarPanelRef} defaultSize={20} minSize={15} maxSize={40} collapsible={true}
                onCollapse={() => setUserSidebarPreference(false)} onExpand={() => setUserSidebarPreference(true)}
                className="flex flex-col transition-all duration-300 ease-out"
              >
                <div className={`flex-1 flex flex-col min-h-0 transition-all duration-300 ease-out ${!isSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                  {sidebar}
                </div>
              </Panel>
              <PanelResizeHandle id="sidebar-resizer" className={`w-1.5 bg-nb-surface-mid hover:bg-nb-tertiary/40 transition-colors ${!isSidebarOpen ? 'hidden' : ''}`} />
              <Panel id="main-panel" order={2} defaultSize={isSidebarOpen ? 80 : 100} minSize={30} className="flex flex-col">
                {main}
              </Panel>
            </PanelGroup>
          )}
        </div>
      )}

      {/* Help Page Overlay */}
      {showHelp && helpPath && (
        <HelpPage
          path={helpPath}
          onClose={handleCloseHelp}
          navigateTo={navigateTo}
        />
      )}

      {/* Notifications */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-[200] animate-in slide-in-from-right-10 duration-300">
          <div className={`px-5 py-4 rounded-2xl shadow-nb-lg border flex items-center gap-4 ${notification.type === 'error' ? 'bg-nb-primary/5 border-nb-primary/30 text-nb-primary' : 'bg-nb-tertiary/5 border-nb-tertiary/30 text-nb-tertiary'} backdrop-blur-xl bg-white/80 dark:bg-nb-dark-surface/80`}>
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">{notification.type === 'error' ? 'Error' : 'Success'}</p>
              <p className="text-xs font-medium">{notification.message}</p>
            </div>
            <button onClick={() => setNotification(null)} className="p-1 hover:bg-black/5 rounded transition-colors"><X size={14} /></button>
          </div>
        </div>
      )}

      <GitHubConnectionDialog
        isOpen={showGitHubLoginOnly}
        onClose={() => { setShowGitHubLoginOnly(false); setPendingProjectId(null); }}
        mode="login"
        githubToken={githubToken}
        githubUser={githubUser}
        onLogin={() => {
          const state = pendingProjectId ? `?project=${pendingProjectId}` : window.location.search;
          initiateGitHubLogin(process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID, window.location.origin, state);
        }}
        onSignOut={onSignOutGithub}
        onConnect={() => {
          // This mode is for re-auth, so we just close the dialog
          // The project load will continue automatically because checkAuth will see the token
          setShowGitHubLoginOnly(false);
        }}
        isExchangingCode={isExchangingCode}
        projects={projects}
      />

      <ConfirmationDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={confirmDialog.onCancel || (() => setConfirmDialog(prev => ({ ...prev, isOpen: false })))}
        variant={confirmDialog.variant}
      />

      {/* Global Loading Overlay */}
      {(!isInitialized || (isLoading && mode === "none") || isGlobalLoading) && (
        <LoadingOverlay
          label={isGlobalLoading ? loadingLabel : "ENGen"}
          subtitle={isGlobalLoading ? "Please wait..." : "Engineering Notebook Generator"}
        />
      )}
      {/* Toast Container */}
      <Toaster position="bottom-right" />
      {/* About Page Overlay */}
      {showAbout && (
        <AboutPage
          onClose={() => {
            if (currentProjectId) navigateTo({}, '/workspace/editor');
            else navigateToHome();
          }}
          onTryIt={() => {
            navigateToHome();
          }}
        />
      )}
    </div>
  );
}
