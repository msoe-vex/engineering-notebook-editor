"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import {
  GitHubConfig, fetchFileContent, fetchRawFileContent,
  commitChanges, GitChange, fetchGitHubUser
} from "@/lib/github";
import { ExplorerFile } from "@/lib/types";
import {
  Project, saveProject, deleteProject, deleteProjectHandle, deleteProjectDatabase,
  getProjectDBName
} from "@/lib/db";
import {
  NotebookMetadata, EMPTY_METADATA, EntryMetadata, EntryWrapper,
  TipTapNode, TeamMetadata, TeamMember, ProjectPhase
} from "@/lib/metadata";
import Settings from "./Settings";
import Editor from "./Editor";
import Preview from "./Preview";
import WelcomePage from "./WelcomePage";
import Sidebar from "./Sidebar";
import TeamEditor from "./TeamEditor";
import ProjectHeader from "./ProjectHeader";
import ConfirmationDialog from "./ConfirmationDialog";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { HardDrive, ArrowLeftRight, X, BookOpen, Download, Loader2 } from "lucide-react";
import { ImperativePanelHandle } from "react-resizable-panels";
import { saveAs } from "file-saver";
import { generateUUID } from "@/lib/utils";
import { generateAllEntriesLatex } from "@/lib/latex";
import { ENTRIES_DIR, INDEX_PATH, ASSETS_DIR } from "@/lib/constants";
import { useWorkspace } from "@/hooks/useWorkspace";
import { events, EventNames } from "@/lib/events";
import { Toaster } from "react-hot-toast";
import { showNotification } from "./Notification";

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = "entry";
type TeamTab = "identity" | "members" | "phases";
export interface FileMetadata {
  content: string;
  title?: string;
  author?: string;
  phase?: number | null;
  createdAt?: string;
}

interface OpenFileState {
  path: string;
  name: string;
  id: string;
  viewMode: ViewMode;
  rawLatex: string;
  tiptapContent: string;
  title: string;
  author: string;
  phase: number | null;
  metadataMissing: boolean;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  isLegacyRaw: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isoTimestamp = () => new Date().toISOString();

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
    entries,
    metadata,
    currentProjectId,
    isLoading,
    isInitialized,
    projects,
    openFile,
    refreshProjects,
    selectProject,
    createEntry,
    updateEntry,
    disconnect,
    createGithubProject,
    createLocalProject,
    createTemporaryProject,
    dirHandle,
    navigateTo
  } = useWorkspace();

  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [githubToken, setGithubToken] = useState<string | null>(null);
  const [githubUser, setGithubUser] = useState<string | null>(null);
  const notify = useCallback((message: string, type: "error" | "success" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: "danger" | "warning" | "info";
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => { },
  });

  const showConfirm = (title: string, message: string, onConfirm: () => void, variant: "danger" | "warning" | "info" = "danger") => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        onConfirm();
      },
      variant
    });
  };

  const [mounted, setMounted] = useState(false);
  const isMobile = useIsMobile();
  const [userSidebarPreference, setUserSidebarPreference] = useState<boolean | null>(null);
  const isSidebarOpen = userSidebarPreference ?? !isMobile;
  const [mobileTab, setMobileTab] = useState<"editor" | "preview">("editor");
  const [desktopViewMode, setDesktopViewMode] = useState<"editor" | "split" | "preview">("editor");
  const [showTeamEditor, setShowTeamEditor] = useState(false);
  const [teamTab, setTeamTab] = useState<TeamTab>("identity");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [hasEntryInUrl, setHasEntryInUrl] = useState(false);

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
  const [latexContent, setLatexContent] = useState("");
  const [targetResourceId, setTargetResourceId] = useState<string | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);

  // Listen for notifications
  useEffect(() => {
    return events.on(EventNames.SHOW_NOTIFICATION, (data: { message: string; type?: "success" | "error" | "loading" | "info" }) => {
      showNotification(data.message, data.type || "info");
    });
  }, []);

  useEffect(() => {
    setMounted(true);
    setGithubToken(localStorage.getItem("nb-github-token"));
    setGithubUser(localStorage.getItem("nb-github-user"));

    const syncView = () => {
      const path = window.location.pathname;
      if (path.startsWith('/workspace/team')) {
        setShowTeamEditor(true);
        const tab = path.split('/').pop() as TeamTab;
        setTeamTab(["identity", "members", "phases"].includes(tab) ? tab : "identity");
      } else {
        setShowTeamEditor(false);
      }

      const params = new URLSearchParams(window.location.search);
      setTargetResourceId(params.get("resource"));
      setHasEntryInUrl(params.has("entry"));
    };

    syncView();
    window.addEventListener('popstate', syncView);
    const unsub = events.on(EventNames.STATE_CHANGED, syncView);

    return () => {
      window.removeEventListener('popstate', syncView);
      unsub();
    };
  }, []);

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
    if (isMobile) {
      if (mobileTab === "editor") {
        editorPanelRef.current.expand();
        previewPanelRef.current.collapse();
      } else {
        editorPanelRef.current.collapse();
        previewPanelRef.current.expand();
      }
    } else {
      if (desktopViewMode === "editor") {
        editorPanelRef.current.expand();
        previewPanelRef.current.collapse();
      } else if (desktopViewMode === "preview") {
        editorPanelRef.current.collapse();
        previewPanelRef.current.expand();
      } else {
        editorPanelRef.current.resize(50);
        previewPanelRef.current.resize(50);
      }
    }
  }, [isMobile, mobileTab, desktopViewMode]);

  const handleNewEntry = async () => {
    try {
      const id = await createEntry();
      const path = `${ENTRIES_DIR}/${id}.json`;
      setSelectedPaths(new Set([path]));
      lastSelectedPathRef.current = path;
    } catch (e) {
      notify("Failed to create entry.", "error");
    }
  };

  const handleOpenEntry = (file: ExplorerFile) => {
    const entryId = file.name.replace('.json', '');
    navigateTo({ entry: entryId }, '/workspace/editor');
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
      setSelectedPaths(prev => {
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

  const handleOpenTeamEditor = (tab: TeamTab = "identity") => {
    navigateTo({}, `/workspace/team/${tab}`);
  };

  const navigateToHome = () => {
    navigateTo({ project: null, entry: null, resource: null }, '/');
  };

  const handleDisconnect = () => {
    if (mode === "temporary") {
      showConfirm(
        "Leave Temporary Workspace?",
        "All changes in this temporary workspace will be lost forever if you disconnect. Are you sure you want to leave?",
        () => {
          disconnect();
          navigateToHome();
        },
        "warning"
      );
    } else {
      disconnect();
      navigateToHome();
    }
  };

  if (!mounted) return null;
  const handleCreateGithub = async (config: any) => {
    try {
      // Settings.tsx passes GitHubConfig, but createGithubProject in store expects a simpler object with 'name'
      // We'll adapt it here.
      const storeConfig = {
        owner: config.owner,
        repo: config.repo,
        branch: config.branch,
        folderPath: config.baseDir || "",
        name: config.repo // Default name to repo name
      };
      const id = await createGithubProject(storeConfig);
      selectProject(id);
    } catch (e) {
      notify("Failed to create GitHub project.", "error");
    }
  };

  const handleCreateLocal = async (handle: FileSystemDirectoryHandle) => {
    try {
      const id = await createLocalProject(handle, handle.name);
      selectProject(id);
    } catch (e) {
      notify("Failed to create Local project.", "error");
    }
  };

  const handleCreateTemporary = async () => {
    try {
      const id = await createTemporaryProject();
      selectProject(id);
    } catch (e) {
      notify("Failed to create Temporary project.", "error");
    }
  };

  const handleRenameProject = async (id: string, name: string) => {
    const p = projects.find(pr => pr.id === id);
    if (p) {
      p.name = name;
      await saveProject(p);
      refreshProjects();
    }
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
    // TODO: Implement in store
    notify("Exporting notebook...");
  };

  const processImportFile = async (file: File) => {
    // TODO: Implement in store
    notify("Importing entry...");
  };

  const requestPermission = async () => {
    if (dirHandle) {
      const mode = 'readwrite';
      // @ts-ignore
      if ((await dirHandle.requestPermission({ mode })) === 'granted') {
        setNeedsPermission(false);
        selectProject(currentProjectId!);
      }
    }
  };

  const currentProject = projects.find(p => p.id === currentProjectId) || (currentProjectId === "temporary" ? { id: "temporary", name: "Temporary Workspace" } as Project : null);
  const workspaceLabel = mode === "github" ? `${config?.owner}/${config?.repo}` : (mode === "local" ? (currentProject?.name ?? "Local Folder") : "Memory");
  const appConfig = config ?? { owner: "Local", repo: "Workspace", token: "", entriesDir: ENTRIES_DIR, resourcesDir: ASSETS_DIR };

  const sidebar = (
    <div className="flex flex-col h-full overflow-hidden bg-nb-surface-low">
      <div className="flex items-center gap-3 px-4 h-14 border-b border-nb-outline-variant shrink-0 bg-nb-surface">
        <div className="w-6 h-6 rounded-md bg-nb-primary flex items-center justify-center shadow-sm shadow-nb-primary/20">
          <BookOpen size={14} className="text-white" />
        </div>
        <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-nb-on-surface truncate">Notebook</p></div>
        <div className="flex items-center gap-1">
          <button onClick={handleExportNotebook} title="Export Entire Notebook" className="p-1.5 cursor-pointer rounded-lg hover:bg-nb-surface-low text-nb-on-surface-variant hover:text-nb-on-surface transition-colors"><Download size={16} /></button>
          <button onClick={handleDisconnect} title="Switch Workspace" className="p-1.5 cursor-pointer rounded-lg hover:bg-nb-surface-low text-nb-on-surface-variant hover:text-nb-on-surface transition-colors"><ArrowLeftRight size={16} /></button>
          {isMobile && <button onClick={() => setUserSidebarPreference(false)} className="p-1.5 cursor-pointer rounded-lg hover:bg-nb-surface-low text-nb-on-surface-variant transition-colors"><X size={18} /></button>}
        </div>
      </div>
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <Sidebar
          selectedPaths={selectedPaths}
          onSelectEntry={handleSelectEntry}
          onOpenTeam={handleOpenTeamEditor}
          showConfirm={showConfirm}
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
        mobileTab={mobileTab}
        onSetMobileTab={setMobileTab}
        desktopViewMode={desktopViewMode}
        onSetDesktopViewMode={setDesktopViewMode}
        isRenamingProject={isRenamingProject}
        projectRenameValue={projectRenameValue}
        onSetProjectRenameValue={setProjectRenameValue}
        onStartRename={() => { if (currentProject) { setProjectRenameValue(currentProject.name); setIsRenamingProject(true); } }}
        onEndRename={(save) => { if (save && currentProjectId) handleRenameProject(currentProjectId, projectRenameValue); setIsRenamingProject(false); }}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setTheme(isDarkMode ? "light" : "dark")}
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
          <TeamEditor
            key={`${currentProjectId}-team`}
            onClose={() => navigateTo({}, '/workspace/editor')}
            initialTab={teamTab}
          />
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
            <PanelGroup direction="horizontal" className="h-full" id="editor-preview-group">
              <Panel
                id="editor-panel" order={1} ref={editorPanelRef} collapsible={true} minSize={isMobile ? 0 : 30}
                defaultSize={isMobile ? (mobileTab === "editor" ? 100 : 0) : (desktopViewMode === "editor" ? 100 : (desktopViewMode === "preview" ? 0 : 50))}
                onCollapse={() => { if (!isMobile && desktopViewMode !== "preview") setDesktopViewMode("preview"); }}
                onExpand={() => { if (!isMobile && desktopViewMode === "preview") setDesktopViewMode("split"); }}
                className={`flex flex-col h-full transition-all duration-300 ease-out ${(isMobile ? mobileTab === "preview" : desktopViewMode === "preview") ? "opacity-0 pointer-events-none" : "opacity-100"}`}
              >
                {openFile && (
                  <Editor
                    key={openFile.path}
                    onClose={() => navigateTo({ entry: null, resource: null })}
                    targetResourceId={targetResourceId}
                    showConfirm={showConfirm}
                  />
                )}
              </Panel>
              <PanelResizeHandle id="editor-preview-resizer" className={`w-1.5 bg-nb-surface-mid hover:bg-nb-tertiary/40 transition-colors ${(isMobile || desktopViewMode !== 'split') ? 'hidden' : ''}`} />
              <Panel
                id="preview-panel" order={2} ref={previewPanelRef} collapsible={true} minSize={isMobile ? 0 : 30}
                defaultSize={isMobile ? (mobileTab === "preview" ? 100 : 0) : (desktopViewMode === "preview" ? 100 : (desktopViewMode === "editor" ? 0 : 50))}
                onCollapse={() => { if (!isMobile && desktopViewMode !== "editor") setDesktopViewMode("editor"); }}
                onExpand={() => { if (!isMobile && desktopViewMode === "editor") setDesktopViewMode("split"); }}
                className={`flex flex-col h-full bg-nb-surface-low transition-all duration-300 ease-out ${(isMobile ? mobileTab === "editor" : desktopViewMode === "editor") ? "opacity-0 pointer-events-none" : "opacity-100"}`}
              >
                <Preview latexContent={openFile?.latex || ""} />
              </Panel>
            </PanelGroup>
          </div>
        ) : (
          <WelcomePage
            workspace={{ mode: mode as "local" | "github" | "temporary", label: workspaceLabel }}
            onNewEntry={createEntry}
            onImportEntry={() => importEntryInputRef.current?.click()}
            onDisconnect={handleDisconnect}
            onOpenSidebar={() => { isToggleFromButton.current = true; setUserSidebarPreference(true); }}
            onOpenTeam={handleOpenTeamEditor}
          />
        )}
      </div>
    </div>
  );


  return (
    <div className="flex flex-col h-screen w-full bg-nb-bg font-sans overflow-hidden">
      <input type="file" ref={importEntryInputRef} accept=".json" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; if (file) processImportFile(file); e.target.value = ""; }} />

      {mode === "none" ? (
        <Settings
          projects={projects}
          onSelectProject={selectProject}
          onDeleteProject={handleDeleteProject}
          onRenameProject={handleRenameProject}
          onCreateGithub={handleCreateGithub}
          onCreateLocal={handleCreateLocal}
          onCreateTemporary={handleCreateTemporary}
          onSignOutGithub={() => {
            localStorage.removeItem("nb-github-token");
            localStorage.removeItem("nb-github-user");
            setGithubToken(null);
            setGithubUser(null);
          }}
          githubToken={githubToken}
          githubUser={githubUser}
        />
      ) : (
        isMobile ? (
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
        )
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

      <ConfirmationDialog
        isOpen={confirmDialog.isOpen} title={confirmDialog.title} message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm} onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        variant={confirmDialog.variant}
      />

      {(!isInitialized || isLoading) && (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-md flex flex-col items-center justify-center font-sans animate-in fade-in duration-300">
          <div className="flex flex-col items-center gap-6">
            <div className="w-20 h-20 rounded-[2.5rem] bg-nb-primary flex items-center justify-center shadow-2xl shadow-nb-primary/30 animate-pulse">
              <BookOpen size={40} className="text-white" />
            </div>
            <div className="text-center space-y-2">
              <h1 className="text-xl font-black tracking-tight text-white">Notebook</h1>
              <p className="text-[10px] font-black tracking-[0.2em] text-white/40 uppercase">Engineering Editor</p>
            </div>
            <div className="flex items-center gap-1 mt-4">
              <div className="w-1.5 h-1.5 rounded-full bg-nb-primary animate-bounce [animation-delay:-0.3s]" />
              <div className="w-1.5 h-1.5 rounded-full bg-nb-primary animate-bounce [animation-delay:-0.15s]" />
              <div className="w-1.5 h-1.5 rounded-full bg-nb-primary animate-bounce" />
            </div>
          </div>
        </div>
      )}
      {/* Toast Container */}
      <Toaster position="bottom-right" />
    </div>
  );
}
