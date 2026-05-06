"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import {
  GitHubConfig, fetchDirectoryTree, fetchFileContent, GitHubFile,
  saveFile, deleteFile as githubDeleteFile, commitChanges, GitChange, fetchGitHubUser
} from "@/lib/github";
import {
  stageChange, getAllPending, clearAllPending, removeStaged, PendingChange,
  putResource, getResource, saveWorkspaceHandle, getWorkspaceHandle, clearWorkspaceHandle,
  Project, getProjects, getProject, saveProject, deleteProject, getProjectHandle, saveProjectHandle, deleteProjectHandle, deleteProjectDatabase,
  getProjectDBName
} from "@/lib/db";
import {
  NotebookMetadata, EMPTY_METADATA, EntryMetadata, EntryWrapper,
  updateEntryInIndex, renameEntryInMetadata, removeEntryFromMetadata,
  dehydrateAssets, hydrateAssets, remapContentIds, isEntryValid,
} from "@/lib/metadata";
import Settings from "./Settings";
import Editor from "./Editor";
import Preview from "./Preview";
import WelcomePage from "./WelcomePage";
import FileExplorer, { ExplorerFile } from "./FileExplorer";
import ImagePreview from "./ImagePreview";
import ConfirmationDialog from "./ConfirmationDialog";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { GitBranch, HardDrive, ArrowLeftRight, GitCommitVertical, Loader2, Menu, Sun, Moon, X, BookOpen, Check, AlertTriangle, ChevronDown } from "lucide-react";
import { ImperativePanelHandle } from "react-resizable-panels";
import { saveAs } from "file-saver";
import { generateUUID, hashContent } from "@/lib/utils";
import { generateEntryLatex, generateAllEntriesLatex } from "@/lib/latex";
import { extractImagePaths, extractResources, extractReferences, validateNotebookIntegrity } from "@/lib/metadata";
import { ENTRIES_DIR, ASSETS_DIR, LATEX_DIR, INDEX_PATH, ALL_ENTRIES_PATH } from "@/lib/constants";
import ReferenceSearch from "./ReferenceSearch";

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkspaceMode = "github" | "local" | "temporary";
type ViewMode = "welcome" | "entry" | "raw-latex" | "image" | "none";

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
};

export interface FileMetadata {
  content: string;
  title?: string;
  author?: string;
  phase?: string;
  createdAt?: string;
}

interface OpenFileState {
  path: string;
  name: string;
  id: string; // Persistent ID
  viewMode: ViewMode;
  // Entry editor fields
  rawLatex: string;
  tiptapContent: string;
  title: string;
  author: string;
  phase: string;
  metadataMissing: boolean;
  // Image preview
  imageSrc: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  // Raw latex: is it a legacy (no metadata) file?
  isLegacyRaw: boolean;
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

const isoTimestamp = () => new Date().toISOString();

const getFilenameTimestamp = () =>
  new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");

const isImage = (name: string) =>
  /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)$/i.test(name);

/** Validate that all header fields and all component captions are filled. */
const validateEntry = (tiptapJson: string, title: string, author: string, phase: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  if (!title.trim()) errors.push("Project Title is required.");
  if (!author.trim()) errors.push("Author is required.");
  if (!phase || phase === "Select Phase") errors.push("Project Phase is required.");

  try {
    const doc = JSON.parse(tiptapJson);
    const checkCaptions = (node: any) => {
      if (node.type === "image" && !node.attrs?.alt?.trim()) errors.push("All images must have a caption.");
      if (node.type === "table" && !node.attrs?.caption?.trim()) errors.push("All tables must have a caption.");
      if (node.type === "codeBlock" && !node.attrs?.caption?.trim()) errors.push("All code blocks must have a caption.");
      (node.content ?? []).forEach(checkCaptions);
    };
    checkCaptions(doc);
  } catch {
    // Ignore parse errors here
  }

  return { valid: errors.length === 0, errors };
};



// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getLocalFileContent = async (rootHandle: any, path: string): Promise<{ text?: string; base64?: string; isImage: boolean }> => {
  try {
    const parts = path.split('/');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let currentHandle: any = rootHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
    }
    const fileHandle = await currentHandle.getFileHandle(parts[parts.length - 1]);
    const file = await fileHandle.getFile();
    if (file.type.startsWith('image/')) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ base64: reader.result as string, isImage: true });
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
    const text = await file.text();
    return { text, isImage: false };
  } catch (e: any) {
    if (e.name !== 'NotFoundError') {
      console.error(`Local read failed for ${path}`, e);
    }
    throw e;
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const writeLocalFile = async (rootHandle: any, path: string, content: string | Uint8Array) => {
  const parts = path.split('/');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let currentHandle: any = rootHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    currentHandle = await currentHandle.getDirectoryHandle(parts[i], { create: true });
  }
  const fileHandle = await currentHandle.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const deleteLocalFileAtPath = async (rootHandle: any, path: string) => {
  const parts = path.split('/');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let currentHandle: any = rootHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
  }
  await currentHandle.removeEntry(parts[parts.length - 1]);
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function App() {
  // Workspace state
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectPendingCounts, setProjectPendingCounts] = useState<Record<string, number>>({});
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [config, setConfig] = useState<GitHubConfig | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [dirHandle, setDirHandle] = useState<any>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [githubToken, setGithubToken] = useState<string | null>(null);
  const [githubUser, setGithubUser] = useState<string | null>(null);

  // Explorer file lists
  const [entries, setEntries] = useState<ExplorerFile[]>([]);
  const [resources, setResources] = useState<ExplorerFile[]>([]);

  // In-memory content cache: path -> content string (for GitHub mode, content loaded on open)
  const [contentCache, setContentCache] = useState<Map<string, string>>(new Map());


  // Pending changes (GitHub mode) — summary driven from IndexedDB
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [isCommitting, setIsCommitting] = useState(false);

  // Background saving state
  const [savingPaths, setSavingPaths] = useState<Set<string>>(new Set());

  const [isRenamingProject, setIsRenamingProject] = useState(false);
  const [projectRenameValue, setProjectRenameValue] = useState("");

  // Serialized queue for local file system operations to prevent InvalidStateError
  const localWriteQueueRef = useRef<Promise<any>>(Promise.resolve());
  const queueLocalOp = useCallback(async (op: () => Promise<any>) => {
    const next = localWriteQueueRef.current.then(op).catch(e => {
      console.error("Local FS operation failed in queue", e);
    });
    localWriteQueueRef.current = next;
    return next;
  }, []);

  // Current open file
  const [openFile, setOpenFile] = useState<OpenFileState | null>(null);
  const [showReferenceSearch, setShowReferenceSearch] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [isConnectingLocal, setIsConnectingLocal] = useState(false);
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const [isPendingCollapsed, setIsPendingCollapsed] = useState(true);

  // metadata.json contents
  const [notebookMetadata, setNotebookMetadata] = useState<NotebookMetadata>(EMPTY_METADATA);
  const notebookMetadataRef = useRef(notebookMetadata);
  const metadataSyncTimeoutRef = useRef<any>(null);
  useEffect(() => { notebookMetadataRef.current = notebookMetadata; }, [notebookMetadata]);

  // Notifications
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // URL-based navigation state
  const [targetResourceId, setTargetResourceId] = useState<string | null>(null);

  // Confirmation Dialog
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
    setConfirmDialog({ isOpen: true, title, message, onConfirm, variant });
  };

  const refreshProjectList = useCallback(async () => {
    const p = await getProjects();
    setProjects(p);

    const counts: Record<string, number> = {};
    for (const proj of p) {
      const dbName = getProjectDBName(proj);
      const pending = await getAllPending(dbName);
      counts[proj.id] = pending.length;
      if (pending.length > 0) {
        console.log(`[DASHBOARD] Found ${pending.length} pending changes for ${proj.name} in DB: ${dbName}`);
      }
    }
    setProjectPendingCounts(counts);
  }, []);

  /** Get a unique DB name for the current workspace to isolate changes. */
  const getDBName = useCallback(() => {
    if (currentProjectId) {
      return `notebook-project-${currentProjectId}`;
    }
    return "notebook-volatile";
  }, [currentProjectId]);

  const checkPermission = async (handle: any) => {
    if (!handle) return false;
    try {
      const status = await (handle as any).queryPermission({ mode: 'readwrite' });
      if (status === 'granted') {
        setNeedsPermission(false);
        return true;
      } else {
        setNeedsPermission(true);
        return false;
      }
    } catch (e) {
      console.error("Permission check failed", e);
      setNeedsPermission(true);
      return false;
    }
  };

  const requestPermission = async () => {
    const handle = dirHandle || (pendingProjectId ? await getProjectHandle(pendingProjectId) : null);
    if (!handle) return;
    try {
      const status = await (handle as any).requestPermission({ mode: 'readwrite' });
      if (status === 'granted') {
        setNeedsPermission(false);
        setIsConnectingLocal(false);
        if (pendingProjectId) {
          const id = pendingProjectId;
          setPendingProjectId(null);
          handleSelectProject(id);
        } else if (workspaceMode === "local") {
          loadLocalExplorer();
        }
      }
    } catch (e) {
      console.error("Permission request failed", e);
      notify("Failed to get folder access", "error");
    }
  };

  // URL Sync Effect

  // Refresh project list (including pending counts) whenever the homepage
  // becomes visible — i.e. every time isInitializing settles to false.
  // This replaces the old on-mount-only call and eliminates the race where
  // stale counts were left over after project switches.
  useEffect(() => {
    if (!isInitializing) {
      refreshProjectList();
    }
  }, [isInitializing, refreshProjectList]);

  // Warning for Temporary Workspace
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (workspaceMode === "temporary") {
        e.preventDefault();
        e.returnValue = "You have unsaved changes in your Temporary Workspace. Reloading will lose all data.";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [workspaceMode]);

  // Load initial author from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("nb-last-author");
    if (saved && openFile && !openFile.author) {
      setOpenFile(prev => prev ? { ...prev, author: saved } : null);
    }
  }, [!!openFile]);

  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [entrySearch, setEntrySearch] = useState("");
  const [entrySort, setEntrySort] = useState<"created" | "updated" | "title">("created");
  const [entrySortDirection, setEntrySortDirection] = useState<"asc" | "desc">("desc");
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const [mobileTab, setMobileTab] = useState<"editor" | "preview">("editor");
  const [desktopViewMode, setDesktopViewMode] = useState<"editor" | "split" | "preview">("editor");

  const editorPanelRef = useRef<ImperativePanelHandle>(null);
  const previewPanelRef = useRef<ImperativePanelHandle>(null);
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);

  useEffect(() => {
    if (!sidebarPanelRef.current) return;
    if (isSidebarOpen) {
      // If we are opening it, reset to default size
      sidebarPanelRef.current.resize(20);
    } else {
      sidebarPanelRef.current.collapse();
    }
  }, [isSidebarOpen]);

  useEffect(() => {
    if (editorPanelRef.current && previewPanelRef.current) {
      if (desktopViewMode === "editor") {
        editorPanelRef.current.resize(100);
      } else if (desktopViewMode === "preview") {
        previewPanelRef.current.resize(100);
      } else {
        editorPanelRef.current.resize(50);
      }
    }
  }, [desktopViewMode]);
  const isMobile = useIsMobile();

  const showPreview = desktopViewMode === "split" || desktopViewMode === "preview";

  const isExchangingCode = useRef(false);

  useEffect(() => {
    setMounted(true);
    setGithubToken(localStorage.getItem("nb-github-token"));
    setGithubUser(localStorage.getItem("nb-github-user"));

    // Handle GitHub OAuth callback
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code && !isExchangingCode.current) {
      isExchangingCode.current = true;
      setIsInitializing(true);
      fetch("/api/auth/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.access_token) {
            localStorage.setItem("nb-github-token", data.access_token);
            setGithubToken(data.access_token);

            // Fetch user info to show who is signed in
            fetchGitHubUser(data.access_token)
              .then(user => {
                if (user.login) {
                  localStorage.setItem("nb-github-user", user.login);
                  setGithubUser(user.login);
                  notify(`Signed in as ${user.login}`, "success");
                }
              })
              .catch(e => console.error("Failed to fetch GitHub user info", e));

            // Clean up URL
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete("code");
            window.history.replaceState({}, "", newUrl.toString());
          } else if (data.error) {
            notify(`GitHub sign-in error: ${data.error}`, "error");
          }
        })
        .catch(err => {
          console.error(err);
          notify("GitHub sign-in failed connection.", "error");
        })
        .finally(() => {
          isExchangingCode.current = false;
        });
    }
  }, []);
  // ── Dynamic Paths ──────────────────────────────────────────────────────────
  const currentEntriesDir = useMemo(() => (workspaceMode === "github" && config) ? config.entriesDir : ENTRIES_DIR, [workspaceMode, config]);
  const currentAssetsDir = useMemo(() => (workspaceMode === "github" && config) ? config.resourcesDir : ASSETS_DIR, [workspaceMode, config]);

  const getGitBasePrefix = useCallback(() => {
    if (workspaceMode === "github" && config?.baseDir) {
      return config.baseDir.endsWith('/') ? config.baseDir : config.baseDir + '/';
    }
    return "";
  }, [workspaceMode, config]);

  const currentIndexPath = useMemo(() => `${getGitBasePrefix()}${INDEX_PATH}`, [getGitBasePrefix]);
  const currentLatexDir = useMemo(() => `${getGitBasePrefix()}${LATEX_DIR}`, [getGitBasePrefix]);
  const currentAllEntriesPath = useMemo(() => `${getGitBasePrefix()}${ALL_ENTRIES_PATH}`, [getGitBasePrefix]);

  const isDarkMode = resolvedTheme === "dark";

  // Theme effect handled by next-themes via layout.tsx


  // Auto-close sidebar on mobile initial load
  useEffect(() => {
    if (isMobile) setIsSidebarOpen(false);
    else setIsSidebarOpen(true);
  }, [isMobile]);

  const notify = (message: string, type: "error" | "success" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Latex preview content (kept in sync by Editor)
  const [latexContent, setLatexContent] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [styContent, setStyContent] = useState("");

  const lastRemoteMetadataRef = useRef<string>("");
  const lastRemoteAllEntriesRef = useRef<string>("");

  // ── Computed display lists ───────────────────────────────────────────────────

  const displayEntries = useMemo(() => {
    let list = entries.map(e => {
      const id = e.name.replace('.json', '');
      const meta = notebookMetadata.entries[id];
      return {
        ...e,
        title: meta?.title || "",
        author: meta?.author || "",
        timestamp: meta?.createdAt || "",
        updatedAt: meta?.updatedAt || meta?.createdAt || "",
        id,
        isSaving: savingPaths.has(e.path),
        isValid: meta?.isValid !== false, // Default to true if not present, but check if explicitly false
        validationErrors: meta?.validationErrors
      };
    });

    // Merge pending upserts that aren't in the list yet
    const existingPaths = new Set(list.map(e => e.path));
    const deletedPaths = new Set(pendingChanges.filter(p => p.operation === "delete").map(p => p.path));
    
    // Filter out deleted items from the main list first
    list = list.filter(e => !deletedPaths.has(e.path));

    pendingChanges.forEach(p => {
      if (p.operation === "upsert" && p.path.startsWith(currentEntriesDir) && p.path.endsWith(".json") && !existingPaths.has(p.path)) {
        const id = p.path.split('/').pop()?.replace('.json', '') || "";
        const meta = notebookMetadata.entries[id];
        list.push({
          name: p.path.split('/').pop() || "",
          path: p.path,
          title: meta?.title || "",
          author: meta?.author || "",
          timestamp: meta?.createdAt || "",
          updatedAt: meta?.updatedAt || meta?.createdAt || "",
          id,
          isSaving: savingPaths.has(p.path),
          isValid: meta?.isValid !== false,
          validationErrors: meta?.validationErrors
        });
        existingPaths.add(p.path);
      }
    });

    if (entrySearch) {
      const q = entrySearch.toLowerCase();
      list = list.filter(e =>
        (e.title || "").toLowerCase().includes(q) ||
        (e.author || "").toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q)
      );
    }

    if (dateRange) {
      const start = dateRange.start ? new Date(dateRange.start).getTime() : 0;
      const end = dateRange.end ? new Date(dateRange.end).getTime() + (24 * 60 * 60 * 1000) - 1 : Infinity;

      list = list.filter(e => {
        const ts = new Date(e.timestamp || 0).getTime();
        return ts >= start && ts <= end;
      });
    }

    list.sort((a, b) => {
      let comparison = 0;
      if (entrySort === 'updated') {
        const timeA = new Date(a.updatedAt || a.timestamp || 0).getTime();
        const timeB = new Date(b.updatedAt || b.timestamp || 0).getTime();
        comparison = timeA - timeB;
      } else if (entrySort === 'created') {
        const timeA = new Date(a.timestamp || 0).getTime();
        const timeB = new Date(b.timestamp || 0).getTime();
        comparison = timeA - timeB;
      } else if (entrySort === 'title') {
        comparison = (a.title || "").localeCompare(b.title || "");
      }
      return entrySortDirection === "asc" ? comparison : -comparison;
    });

    return list;
  }, [entries, notebookMetadata, entrySearch, entrySort, entrySortDirection, dateRange, openFile, savingPaths, pendingChanges, currentEntriesDir]);

  const displayResources = useMemo(() => {
    let list = [...resources];
    const deletedPaths = new Set(pendingChanges.filter(p => p.operation === "delete").map(p => p.path));
    
    // Filter out deleted items from the main list first
    list = list.filter(e => !deletedPaths.has(e.path));

    const existingPaths = new Set(list.map(e => e.path));
    pendingChanges.forEach(p => {
      if (p.operation === "upsert" && p.path.startsWith(currentAssetsDir) && isImage(p.path) && !existingPaths.has(p.path)) {
        list.push({
          name: p.path.split('/').pop() || "",
          path: p.path,
          timestamp: new Date().toISOString()
        });
        existingPaths.add(p.path);
      }
    });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [resources, pendingChanges, currentAssetsDir]);

  // ── Pending helpers ──────────────────────────────────────────────────────────

  const refreshPending = useCallback(async () => {
    const dbName = getDBName();
    const all = await getAllPending(dbName);
    setPendingChanges(all);
  }, [getDBName]);

  const stage = useCallback(async (change: Omit<PendingChange, "stagedAt">) => {
    const dbName = getDBName();
    console.log(`[STAGING] ${change.path} (${change.label}) in ${dbName}`);
    // If you see many changes, check the caller:
    // console.trace();
    await stageChange(dbName, { ...change, stagedAt: new Date().toISOString() });
    await refreshPending();
  }, [refreshPending, getDBName]);

  useEffect(() => {
    setPendingChanges([]); // Reset UI during DB switch
    refreshPending();
  }, [refreshPending]);

  // Auto-save effect
  const handleContentChange = useCallback(async (changedPath: string, latex: string, tiptapContent: string, info: { title: string; author: string; phase: string }) => {
    // 1. Update Preview & Internal state tracking
    setLatexContent(latex);
    const entryId = changedPath.split('/').pop()?.replace('.json', '') || "";

    setOpenFile(prev => {
      if (prev && prev.path === changedPath) {
        return { ...prev, rawLatex: latex, tiptapContent, updatedAt: isoTimestamp() };
      }
      return prev;
    });

    setSavingPaths(prev => new Set(prev).add(changedPath));

    const parseContent = (raw: any): any => {
      if (!raw) return raw;
      if (typeof raw === 'object') return raw;
      if (typeof raw !== 'string') return raw;
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'string') return parseContent(parsed);
        return parsed;
      } catch {
        return raw;
      }
    };

    const contentObj = parseContent(tiptapContent);
    const resources = contentObj ? extractResources(contentObj) : {};
    const references = contentObj ? extractReferences(contentObj) : [];

    const entryMeta: EntryMetadata = {
      id: entryId,
      ...info,
      createdAt: openFile?.path === changedPath ? openFile.createdAt : (notebookMetadataRef.current.entries?.[entryId]?.createdAt || isoTimestamp()),
      updatedAt: isoTimestamp(),
      filename: changedPath,
      resources,
      references
    };

    if (info.author) {
      localStorage.setItem("nb-last-author", info.author);
    }

    // 2. Dehydrate Assets & Prepare Entry
    let assetsToSave: { path: string; base64: string }[] = [];
    let finalDoc = contentObj;

    if (contentObj) {
      try {
        const { cleanDoc, newAssets } = await dehydrateAssets(contentObj);
        assetsToSave = newAssets;
        finalDoc = cleanDoc;
      } catch (e) {
        console.error("Failed to dehydrate assets", e);
      }
    }

    // 3. Persist everything
    try {
      const entryJsonObj = {
        version: 3,
        content: finalDoc,
      };
      const entryJsonStr = JSON.stringify(entryJsonObj, null, 2);

      if (workspaceMode !== "github" && dirHandle) {
        await queueLocalOp(async () => {
          // Save assets
          for (const asset of assetsToSave) {
            const binary = atob(asset.base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            await writeLocalFile(dirHandle, asset.path, bytes);
          }

          // Save Entry JSON
          await writeLocalFile(dirHandle, changedPath, entryJsonStr);

          // Save LaTeX (in latex/ directory)
          const latexPath = `${LATEX_DIR}/${entryId}.tex`;
          await writeLocalFile(dirHandle, latexPath, latex);

          // Update notebook.json
          const meta = notebookMetadataRef.current;
          const updatedMeta = updateEntryInIndex(meta, entryId, entryMeta);

          // Ensure projectId/Name are in meta
          if (currentProjectId && !updatedMeta.projectId) {
            updatedMeta.projectId = currentProjectId;
            const p = projects.find(pr => pr.id === currentProjectId);
            if (p) updatedMeta.projectName = p.name;
          }

          await writeLocalFile(dirHandle, INDEX_PATH, JSON.stringify(updatedMeta, null, 2));

          notebookMetadataRef.current = updatedMeta;

          // Sync to state with debounce to avoid excessive re-renders during typing
          if (metadataSyncTimeoutRef.current) clearTimeout(metadataSyncTimeoutRef.current);
          metadataSyncTimeoutRef.current = setTimeout(() => {
            setNotebookMetadata(updatedMeta);
          }, 500);
        });
      } else if (workspaceMode === "github" || workspaceMode === "temporary") {
        const dbName = getDBName();

        // Save assets
        for (const asset of assetsToSave) {
          console.log(`[STAGING ASSET] ${asset.path} in ${dbName}`);
          await stageChange(dbName, {
            path: asset.path, operation: "upsert", content: asset.base64,
            label: `Asset: ${asset.path.split('/').pop()}`, stagedAt: isoTimestamp()
          });
          await putResource(dbName, { path: asset.path, dataUrl: `data:image/*;base64,${asset.base64}` });
        }

        // Save Entry JSON
        console.log(`[STAGING ENTRY] ${changedPath} in ${dbName}`);
        await stageChange(dbName, {
          path: changedPath, operation: "upsert", content: entryJsonStr,
          label: `Auto-save: ${info.title}`, stagedAt: isoTimestamp()
        });

        // Save LaTeX
        const latexPath = `${currentLatexDir}/${entryId}.tex`;
        console.log(`[STAGING LATEX] ${latexPath} in ${dbName}`);
        await stageChange(dbName, {
          path: latexPath, operation: "upsert", content: latex,
          label: `Generate LaTeX: ${info.title}`, stagedAt: isoTimestamp()
        });

        // Update notebook.json
        const meta = notebookMetadataRef.current;
        const updatedMeta = updateEntryInIndex(meta, entryId, entryMeta);
        const metaStr = JSON.stringify(updatedMeta, null, 2);

        if (metaStr === lastRemoteMetadataRef.current) {
          await removeStaged(dbName, currentIndexPath);
        } else {
          console.log(`[STAGING METADATA] ${currentIndexPath} in ${dbName}`);
          await stageChange(dbName, {
            path: currentIndexPath, operation: "upsert", content: metaStr,
            label: "Auto-save metadata", stagedAt: isoTimestamp()
          });
        }

        const allEntriesTex = generateAllEntriesLatex(updatedMeta, "data/");
        if (allEntriesTex === lastRemoteAllEntriesRef.current) {
          await removeStaged(dbName, currentAllEntriesPath);
        } else {
          console.log(`[STAGING ALL_ENTRIES] ${currentAllEntriesPath} in ${dbName}`);
          await stageChange(dbName, {
            path: currentAllEntriesPath, operation: "upsert", content: allEntriesTex,
            label: "Update entry list", stagedAt: isoTimestamp()
          });
        }

        notebookMetadataRef.current = updatedMeta;

        // Sync to state with debounce to avoid excessive re-renders during typing
        if (metadataSyncTimeoutRef.current) clearTimeout(metadataSyncTimeoutRef.current);
        metadataSyncTimeoutRef.current = setTimeout(() => {
          setNotebookMetadata(updatedMeta);
        }, 500);

        await refreshPending();
      }

      if (assetsToSave.length > 0) {
        // Refresh resources list if new assets were added
        setResources(prev => {
          const existingPaths = new Set(prev.map(r => r.path));
          const newResources = assetsToSave
            .filter(a => !existingPaths.has(a.path))
            .map(a => ({ name: a.path.split('/').pop() || "", path: a.path }));
          return [...prev, ...newResources];
        });
      }
    } finally {
      // Cleanup saving status
      setSavingPaths(prev => {
        const next = new Set(prev);
        next.delete(changedPath);
        return next;
      });
    }
  }, [workspaceMode, dirHandle, getDBName, openFile?.path, openFile?.createdAt, openFile?.id, notebookMetadata]);

  // ── Content cache helpers ────────────────────────────────────────────────────

  const cacheContent = (path: string, content: string) => {
    setContentCache(prev => new Map(prev).set(path, content));
  };

  // ── Explorer loaders ─────────────────────────────────────────────────────────

  const loadLocalExplorer = useCallback(async () => {
    if (!dirHandle) return;
    setIsLoading(true);
    try {
      const entryFiles: ExplorerFile[] = [];
      const resourceFiles: ExplorerFile[] = [];

      try {
        let entriesDir: any = dirHandle;
        for (const part of ENTRIES_DIR.split('/')) {
          entriesDir = await entriesDir.getDirectoryHandle(part, { create: true });
        }
        for await (const entry of entriesDir.values()) {
          if (entry.kind === "file" && entry.name.endsWith(".json")) {
            entryFiles.push({ name: entry.name, path: `${ENTRIES_DIR}/${entry.name}` });
          }
        }
      } catch { /* entries dir missing */ }

      try {
        let assetsDir: any = dirHandle;
        for (const part of ASSETS_DIR.split('/')) {
          assetsDir = await assetsDir.getDirectoryHandle(part, { create: true });
        }
        for await (const entry of assetsDir.values()) {
          if (entry.kind === "file" && isImage(entry.name)) {
            resourceFiles.push({ name: entry.name, path: `${ASSETS_DIR}/${entry.name}` });
          }
        }
      } catch { /* assets dir missing */ }

      // Load notebook.json independently
      try {
        const result = await getLocalFileContent(dirHandle, INDEX_PATH);
        if (result.text) {
          const parsed = JSON.parse(result.text);
          setNotebookMetadata(parsed);
        }
      } catch { /* not found */ }

      // Load sty
      try {
        const result = await getLocalFileContent(dirHandle, "vex_notebook.sty");
        if (result.text) setStyContent(result.text);
      } catch { /* not found */ }

      setEntries(entryFiles);
      setResources(resourceFiles);
    } finally {
      setIsLoading(false);
    }
  }, [dirHandle]);

  const loadGitHubExplorer = useCallback(async () => {
    if (!config) return;
    setIsLoading(true);
    try {
      const [entryItems, resourceItems] = await Promise.all([
        fetchDirectoryTree(config, currentEntriesDir, false).catch(() => [] as GitHubFile[]),
        fetchDirectoryTree(config, currentAssetsDir, false).catch(() => [] as GitHubFile[]),
      ]);

      const entryFiles = entryItems
        .filter(f => f.type === "file" && f.name.endsWith(".json"))
        .map(f => ({ name: f.name, path: f.path }));
      const resourceFiles = resourceItems
        .filter(f => f.type === "file" && isImage(f.name))
        .map(f => ({ name: f.name, path: f.path }));

      // Load notebook.json from pending or GitHub
      const dbName = getDBName();
      const pending = await getAllPending(dbName);
      const pendingMeta = pending.find(p => p.path === currentIndexPath && p.operation === "upsert");
      if (pendingMeta?.content) {
        try {
          const parsed = JSON.parse(pendingMeta.content);
          setNotebookMetadata(parsed);
        } catch { /* ignore */ }
      } else {
        try {
          const metaStr = await fetchFileContent(config, currentIndexPath);
          lastRemoteMetadataRef.current = metaStr;
          const parsed = JSON.parse(metaStr);
          setNotebookMetadata(parsed);
        } catch { /* not found yet */ }
      }

      // Also load all_entries.tex for comparison
      try {
        const allEntries = await fetchFileContent(config, currentAllEntriesPath);
        lastRemoteAllEntriesRef.current = allEntries;
      } catch { /* not found */ }

      // Load sty
      try {
        const styStr = await fetchFileContent(config, "vex_notebook.sty");
        setStyContent(styStr);
      } catch { /* not found */ }

      setEntries(entryFiles);
      setResources(resourceFiles);
    } finally {
      setIsLoading(false);
    }
  }, [config, getDBName]);

  useEffect(() => {
    if (workspaceMode === "local" && dirHandle && notebookMetadata !== EMPTY_METADATA) {
      const save = async () => {
        await queueLocalOp(async () => {
          try {
            await writeLocalFile(dirHandle, INDEX_PATH, JSON.stringify(notebookMetadata, null, 2));
            const allEntriesTex = generateAllEntriesLatex(notebookMetadata, "data/");
            await writeLocalFile(dirHandle, ALL_ENTRIES_PATH, allEntriesTex);
          } catch (e) {
            console.error("Failed to auto-save metadata", e);
          }
        });
      };
      const timeout = setTimeout(save, 1000);
      return () => clearTimeout(timeout);
    }
  }, [notebookMetadata, workspaceMode, dirHandle, queueLocalOp]);

  useEffect(() => {
    if (workspaceMode === "local" && dirHandle) loadLocalExplorer();
    else if (workspaceMode === "github" && config) loadGitHubExplorer();
    else if (workspaceMode === "temporary") {
      setEntries([]);
      setResources([]);
      setNotebookMetadata({ ...EMPTY_METADATA });
      setIsLoading(false);
    }
  }, [workspaceMode, dirHandle, config, loadLocalExplorer, loadGitHubExplorer]);

  const handleValidationChange = useCallback((isValid: boolean) => {
    if (!openFile) return;
    setNotebookMetadata(prev => {
      const entry = prev.entries[openFile.id];
      if (!entry || entry.isValid === isValid) return prev;
      return {
        ...prev,
        entries: {
          ...prev.entries,
          [openFile.id]: { ...entry, isValid }
        }
      };
    });
  }, [openFile]);

  // ── New Entry ────────────────────────────────────────────────────────────────

  const handleNewEntry = useCallback(async () => {
    const createdAt = isoTimestamp();
    const entryId = generateUUID();
    const filename = `${entryId}.json`;
    const path = `${currentEntriesDir}/${filename}`;

    const defaultTitle = "";
    const defaultAuthor = localStorage.getItem("nb-last-author") || "";

    const entryMeta: EntryMetadata = {
      id: entryId,
      title: defaultTitle,
      author: defaultAuthor,
      phase: "",
      createdAt: createdAt,
      updatedAt: createdAt,
      filename: path,
      resources: {}
    };

    const wrapper = {
      version: 3,
      content: { type: "doc", content: [{ type: "paragraph" }] }
    };
    const jsonStr = JSON.stringify(wrapper, null, 2);

    const initialLatex = `\\notebookentry{${defaultTitle}}{${createdAt.split('T')[0]}}{${defaultAuthor}}{}\n\\label{${entryId}}\n\n`;

    const newMetadata = updateEntryInIndex(notebookMetadata, entryId, entryMeta);
    const metaStr = JSON.stringify(newMetadata, null, 2);

    // Optimistic UI updates
    setOpenFile({
      path, name: filename, id: entryId,
      viewMode: "entry",
      rawLatex: initialLatex,
      tiptapContent: JSON.stringify(wrapper.content),
      title: defaultTitle, author: defaultAuthor, phase: "",
      metadataMissing: false,
      imageSrc: "",
      createdAt: createdAt,
      updatedAt: createdAt,
      lastOpenedAt: createdAt,
      isLegacyRaw: false,
    });
    setLatexContent(initialLatex);
    setEntries(prev => [{ name: filename, path }, ...prev]);
    setNotebookMetadata(newMetadata);

    // Update URL for new entry
    const params = new URLSearchParams(window.location.search);
    params.set('entry', entryId);
    params.delete('resource');
    window.history.pushState({}, '', `?${params.toString()}`);
    window.dispatchEvent(new Event('locationchange'));
    setSavingPaths(prev => new Set(prev).add(path));

    // Background save
    const saveOp = async () => {
      try {
        const dbName = getDBName();
        if (workspaceMode === "local" && dirHandle) {
          await queueLocalOp(async () => {
            await writeLocalFile(dirHandle, path, jsonStr);
            await writeLocalFile(dirHandle, INDEX_PATH, metaStr);
            await writeLocalFile(dirHandle, `${LATEX_DIR}/${entryId}.tex`, initialLatex);
            // No need to call loadLocalExplorer anymore since we updated state optimistically
          });
        } else if (workspaceMode === "github" || workspaceMode === "temporary") {
          await stage({ path, content: jsonStr, operation: "upsert", label: "New entry" });
          if (metaStr === lastRemoteMetadataRef.current) {
            await removeStaged(dbName, currentIndexPath);
          } else {
            await stage({ path: currentIndexPath, content: metaStr, operation: "upsert", label: "Update index" });
          }
          const allEntriesTex = generateAllEntriesLatex(newMetadata, "data/");
          if (allEntriesTex === lastRemoteAllEntriesRef.current) {
            await removeStaged(dbName, currentAllEntriesPath);
          } else {
            await stage({ path: currentAllEntriesPath, content: allEntriesTex, operation: "upsert", label: "Update entry list" });
          }
          await stage({ path: `${currentLatexDir}/${entryId}.tex`, content: initialLatex, operation: "upsert", label: "Init LaTeX" });
        }
      } finally {
        setSavingPaths(prev => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      }
    };

    saveOp();
  }, [workspaceMode, dirHandle, stage, notebookMetadata]);

  // ── Select entry ─────────────────────────────────────────────────────────────

  const handleSelectEntry = useCallback(async (file: ExplorerFile, silent: boolean = false) => {
    setIsLoading(true);
    if (isMobile) setIsSidebarOpen(false);
    setMobileTab("editor");

    try {
      const dbName = getDBName();
      let entryJsonStr = "";
      let latexStr = "";

      // Update URL
      const entryId = file.name.replace('.json', '');
      const params = new URLSearchParams(window.location.search);
      if (params.get('entry') !== entryId) {
        params.set('entry', entryId);
        params.delete('resource'); // Reset resource ID when switching entries manually
        window.history.pushState({}, '', `?${params.toString()}`);
        window.dispatchEvent(new Event('locationchange'));
      }

      // 1. Load Entry JSON
      const stagedEntry = (await getAllPending(dbName)).find(p => p.path === file.path && p.operation === "upsert");
      if (stagedEntry?.content) {
        entryJsonStr = stagedEntry.content;
      } else if (workspaceMode === "local" && dirHandle) {
        const res = await getLocalFileContent(dirHandle, file.path);
        entryJsonStr = res.text || "";
      } else if (workspaceMode === "github" && config) {
        entryJsonStr = await fetchFileContent(config, file.path);
      }

      if (!entryJsonStr) throw new Error("Entry not found");
      const rawData = JSON.parse(entryJsonStr);
      const content = rawData.content || rawData;

      const meta = notebookMetadataRef.current.entries[entryId];

      const title = meta?.title || "";
      const author = meta?.author || "";
      const phase = meta?.phase || "";
      const createdAt = meta?.createdAt || isoTimestamp();
      const updatedAt = meta?.updatedAt || createdAt;

      // 2. Load LaTeX for preview
      const latexPath = `${currentLatexDir}/${entryId}.tex`;
      const stagedLatex = (await getAllPending(dbName)).find(p => p.path === latexPath && p.operation === "upsert");
      if (stagedLatex?.content) {
        latexStr = stagedLatex.content;
      } else if (workspaceMode === "local" && dirHandle) {
        try { latexStr = (await getLocalFileContent(dirHandle, latexPath)).text || ""; } catch { /* ignore */ }
      } else if (workspaceMode === "github" && config) {
        try { latexStr = await fetchFileContent(config, latexPath); } catch { /* ignore */ }
      }

      // 3. Hydrate Assets
      const assetCache = new Map<string, string>();
      const images = extractImagePaths(content);
      for (const imgPath of images) {
        const staged = (await getAllPending(dbName)).find(p => p.path === imgPath && p.operation === "upsert");
        if (staged?.content) {
          assetCache.set(imgPath, staged.content.startsWith('data:') ? staged.content : `data:image/*;base64,${staged.content}`);
        } else {
          const cached = await getResource(dbName, imgPath);
          if (cached) {
            assetCache.set(imgPath, cached);
          } else if (workspaceMode === "local" && dirHandle) {
            try {
              const res = await getLocalFileContent(dirHandle, imgPath);
              if (res.base64) assetCache.set(imgPath, res.base64);
            } catch { /* ignore */ }
          }
          // Note: GitHub hydration handled by construct URL in ImageNodeView fallback if needed
        }
      }

      const hydratedContent = hydrateAssets(content, assetCache);

      setOpenFile({
        path: file.path, name: file.name, id: entryId,
        viewMode: "entry",
        rawLatex: latexStr,
        tiptapContent: JSON.stringify(hydratedContent),
        title: title,
        author: author,
        phase: phase,
        metadataMissing: false,
        imageSrc: "",
        createdAt: createdAt,
        updatedAt: updatedAt,
        lastOpenedAt: updatedAt,
        isLegacyRaw: false,
      });
      setLatexContent(latexStr);
    } catch (e) {
      if (!silent) {
        console.error("Failed to open entry", e);
        notify("Failed to open entry.", "error");
      }
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [workspaceMode, dirHandle, config, getDBName, isMobile]);

  // ── Select resource ───────────────────────────────────────────────────────────

  const handleSelectResource = useCallback(async (file: ExplorerFile) => {
    setIsLoading(true);
    setIsSidebarOpen(false); // Hide sidebar on selection
    try {
      let imageSrc = "";

      // Check pending IndexedDB
      const dbName = getDBName();
      const allPending = await getAllPending(dbName);
      const staged = allPending.find(p => p.path === file.path && p.operation === "upsert");
      if (staged?.content) {
        // content is base64 data URL
        imageSrc = staged.content.startsWith("data:") ? staged.content : `data:image/*;base64,${staged.content}`;
      } else {
        // Check persistent resource cache
        const cached = await getResource(dbName, file.path);
        if (cached) {
          imageSrc = cached;
        } else if (contentCache.has(file.path)) {
          imageSrc = contentCache.get(file.path)!;
        } else if (workspaceMode === "local" && dirHandle) {
          const result = await getLocalFileContent(dirHandle, file.path);
          imageSrc = result.base64 ?? "";
          cacheContent(file.path, imageSrc);
        } else if (workspaceMode === "github" && config) {
          // For images on GitHub, construct raw URL as fallback or fetch base64
          imageSrc = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/HEAD/${file.path}`;
        }
      }

      setOpenFile({
        path: file.path, name: file.name, id: file.name,
        viewMode: "image",
        rawLatex: "", tiptapContent: "",
        title: file.name, author: "", phase: "",
        metadataMissing: false,
        imageSrc,
        createdAt: file.timestamp || new Date().toISOString(),
        updatedAt: file.updatedAt || file.timestamp || new Date().toISOString(),
        lastOpenedAt: file.updatedAt || file.timestamp || new Date().toISOString(),
        isLegacyRaw: false,
      });
      setMobileTab("editor");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceMode, dirHandle, config, contentCache, getDBName]);

  // ── URL synchronization ──────────────────────────────────────────────────────

  useEffect(() => {
    let active = true;

    const handleUrlChange = async () => {
      const params = new URLSearchParams(window.location.search);
      const entryId = params.get('entry');
      const resourceId = params.get('resource');
      const projectId = params.get('project');

      // 1. Sync Project
      if (projectId && projectId !== currentProjectId) {
        setIsInitializing(true);
        setIsLoading(true);
        setNotebookMetadata(EMPTY_METADATA); // Clear old metadata to ensure loader stays up
        const p = await getProject(projectId);
        if (!active) return;
        if (p) {
          setCurrentProjectId(p.id);
          if (p.type === "github" && p.githubConfig) {
            setConfig(p.githubConfig);
            setWorkspaceMode("github");
            // Clear volatile DB when switching to a real project
            deleteProjectDatabase("notebook-volatile").catch(() => { });
          } else if (p.type === "local") {
            const handle = await getProjectHandle(p.id);
            if (handle) {
              setDirHandle(handle);
              setWorkspaceMode("local");
              await checkPermission(handle);
              // Clear volatile DB when switching to a real project
              deleteProjectDatabase("notebook-volatile").catch(() => { });
            } else {
              setWorkspaceMode(null);
              setCurrentProjectId(null);
            }
          } else if (p.type === "temporary") {
            setWorkspaceMode("temporary");
          }
        } else if (projectId === "temporary") {
          setCurrentProjectId("temporary");
          setWorkspaceMode("temporary");
        }
      }

      // If we have a project but no workspace mode yet, wait.
      if (projectId && !workspaceMode) return;

      // 2. Sync Resources
      if (resourceId !== targetResourceId) {
        setTargetResourceId(resourceId);
      }

      // 3. Sync Entry Selection
      if (entryId && entryId !== openFile?.id) {
        // If metadata isn't loaded yet, wait for it.
        if (notebookMetadata === EMPTY_METADATA) return;

        if (notebookMetadata.entries[entryId]) {
          const filename = `${currentEntriesDir}/${entryId}.json`;
          handleSelectEntry({ name: `${entryId}.json`, path: filename }, true).catch(() => {
            setOpenFile(null);
          });
          if (!active) return;
        }
      } else if (!entryId && openFile) {
        setOpenFile(null);
      }

      // 4. Settle initialization
      if (active) {
        // Requirements for a project to be considered "ready":
        // 1. URL project matches current state project
        // 2. Not currently loading network data
        // 3. Workspace mode is established (github/local/temporary)
        // 4. Necessary config (github) or handle (local) is present
        // 5. Metadata index is loaded
        const projectMatches = projectId === currentProjectId;
        const configReady = workspaceMode === "github" ? !!config : (workspaceMode === "local" ? !!dirHandle : true);
        const metaReady = notebookMetadata !== EMPTY_METADATA;

        const isSettleable = projectId
          ? (projectMatches && !isLoading && !!workspaceMode && configReady && metaReady)
          : (!isLoading && !currentProjectId); // If no project in URL, we can only settle if we aren't loading one and have no current project

        if (projectId && !isSettleable) {
          return;
        }

        // If we have a project in state but not in URL yet, wait for sync
        if (!projectId && currentProjectId) {
          return;
        }

        setIsInitializing(false);
      }
    };

    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('locationchange', handleUrlChange);
    handleUrlChange();

    return () => {
      active = false;
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('locationchange', handleUrlChange);
    };
  }, [workspaceMode, currentProjectId, dirHandle, handleSelectEntry, targetResourceId, openFile?.id, notebookMetadata, needsPermission, isLoading]);

  const handleDiscardAll = async () => {
    const dbName = getDBName();
    showConfirm(
      "Discard Changes?",
      "Are you sure you want to discard all uncommitted changes? This cannot be undone.",
      async () => {
        await clearAllPending(dbName);
        await refreshPending();
        notify("All pending changes discarded.", "success");

        // Reset any open file state if it was a pending new file
        if (openFile) {
          const allPending = await getAllPending(dbName);
          const isNew = allPending.some(p => p.path === openFile.path && p.operation === "upsert");
          if (isNew) setOpenFile(null);
        }

        // Refresh the explorer to show current remote state
        if (workspaceMode === "github") await loadGitHubExplorer();
        else if (workspaceMode === "local") await loadLocalExplorer();

        // Re-select current entry if it's still open to revert to remote version
        if (openFile) {
          const params = new URLSearchParams(window.location.search);
          const entryId = params.get('entry');
          if (entryId && openFile.id === entryId) {
            const filename = `${currentEntriesDir}/${entryId}.json`;
            handleSelectEntry({ name: `${entryId}.json`, path: filename }, true).catch(() => {
              setOpenFile(null);
            });
          }
        }
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      },
      "danger"
    );
  };

  // Sync Project to URL
  useEffect(() => {
    if (isInitializing) return;

    const params = new URLSearchParams(window.location.search);
    if (currentProjectId) {
      if (params.get('project') !== currentProjectId) {
        params.set('project', currentProjectId);
        window.history.replaceState({}, '', `?${params.toString()}`);
        window.dispatchEvent(new Event('locationchange'));
      }
    } else {
      if (params.has('project')) {
        params.delete('project');
        window.history.replaceState({}, '', `?${params.toString()}`);
        window.dispatchEvent(new Event('locationchange'));
      }
    }
  }, [currentProjectId]);

  // ── Save entry ───────────────────────────────────────────────────────────────

  // ── Metadata rebuild (called after entry save) ───────────────────────────────

  const handleImportEntry = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const content = reader.result as string;
            const rawData = JSON.parse(content);

            // Portable entries MUST have metadata to be imported correctly
            const isWrapper = (rawData.content !== undefined && rawData.metadata !== undefined);
            if (!isWrapper) {
              notify("Import failed: Selected file is not a portable entry (missing metadata).", "error");
              return;
            }

            const wrapper = rawData as EntryWrapper;

            // Generate a new UUID for the imported entry to avoid collisions
            const newId = generateUUID();
            const filename = `${newId}.json`;
            const path = `${currentEntriesDir}/${filename}`;

            // Remap IDs within the document to prevent collisions and update internal links
            const remappedContent = remapContentIds(wrapper.content);
            const { cleanDoc, newAssets } = await dehydrateAssets(remappedContent);

            // New entries are saved in the simplified format (content-only)
            const newEntryFileObj = {
              version: 3,
              content: cleanDoc
            };
            const jsonStr = JSON.stringify(newEntryFileObj, null, 2);

            const newEntryMeta: EntryMetadata = {
              id: newId,
              title: wrapper.metadata.title,
              author: wrapper.metadata.author,
              phase: wrapper.metadata.phase,
              createdAt: wrapper.metadata.createdAt || isoTimestamp(),
              updatedAt: isoTimestamp(),
              filename: path,
              resources: extractResources(cleanDoc)
            };
            newEntryMeta.isValid = isEntryValid(newEntryMeta);

            // Save everything
            if (workspaceMode === "local" && dirHandle) {
              await queueLocalOp(async () => {
                for (const asset of newAssets) {
                  const binary = atob(asset.base64);
                  const bytes = new Uint8Array(binary.length);
                  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                  await writeLocalFile(dirHandle, asset.path, bytes);
                }
                await writeLocalFile(dirHandle, path, jsonStr);
                const latex = generateEntryLatex(JSON.stringify(cleanDoc), newEntryMeta.title, newEntryMeta.author, newEntryMeta.phase, newEntryMeta.createdAt, newId);
                await writeLocalFile(dirHandle, `${LATEX_DIR}/${newId}.tex`, latex);

                setNotebookMetadata(prev => updateEntryInIndex(prev, newId, newEntryMeta));
                await loadLocalExplorer();
              });
            } else if (workspaceMode === "github" || workspaceMode === "temporary") {
              const dbName = getDBName();
              for (const asset of newAssets) {
                await stageChange(dbName, { path: asset.path, operation: "upsert", content: asset.base64, label: `Import asset`, stagedAt: isoTimestamp() });
              }
              await stage({ path, content: jsonStr, operation: "upsert", label: "Import entry" });
              const latex = generateEntryLatex(JSON.stringify(cleanDoc), newEntryMeta.title, newEntryMeta.author, newEntryMeta.phase, newEntryMeta.createdAt, newId);
              await stage({ path: `${currentLatexDir}/${newId}.tex`, content: latex, operation: "upsert", label: "Import LaTeX" });

              const updatedMeta = updateEntryInIndex(notebookMetadata, newId, newEntryMeta);
              const allEntriesTex = generateAllEntriesLatex(updatedMeta, "data/");
              await stage({ path: currentIndexPath, content: JSON.stringify(updatedMeta, null, 2), operation: "upsert", label: "Update index" });
              await stage({ path: currentAllEntriesPath, content: allEntriesTex, operation: "upsert", label: "Update entry list" });

              setNotebookMetadata(updatedMeta);
            }

            notify("Entry imported successfully.", "success");
          } catch (e) {
            console.error("Import failed", e);
            notify("Import failed. Invalid format.", "error");
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, [workspaceMode, dirHandle, stage, getDBName]);

  // ── Image upload from editor ─────────────────────────────────────────────────

  const handleImageUploaded = useCallback(async (imagePath: string, base64: string) => {
    const dataUrl = `data:image/*;base64,${base64}`;
    cacheContent(imagePath, dataUrl);

    // Save to persistent resource cache
    const dbName = getDBName();
    await putResource(dbName, { path: imagePath, dataUrl });

    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    if (workspaceMode === "local" && dirHandle) {
      await queueLocalOp(async () => {
        await writeLocalFile(dirHandle, imagePath, bytes);
        await loadLocalExplorer();
      });
    } else if (workspaceMode === "github" || workspaceMode === "temporary") {
      await stage({ path: imagePath, content: dataUrl, operation: "upsert", label: "Image upload" });
      const imgName = imagePath.split("/").pop()!;
      setResources(prev => [...prev, { name: imgName, path: imagePath }].sort((a, b) => a.name.localeCompare(b.name)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceMode, dirHandle, loadLocalExplorer, stage, getDBName]);

  // ── Upload resource from FileExplorer ────────────────────────────────────────

  const handleUploadResource = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];
        const ext = file.name.split(".").pop() || "png";
        const ts = getFilenameTimestamp();
        const imgPath = `${currentAssetsDir}/${ts}.${ext}`;
        await handleImageUploaded(imgPath, base64);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [handleImageUploaded]);

  // ── Entry delete ─────────────────────────────────────────────────────────────

  const handleDeleteEntry = useCallback(async (file: ExplorerFile) => {
    // Update metadata
    const entryId = file.path.split('/').pop()?.replace('.json', '') || "";
    const updatedMeta = removeEntryFromMetadata(notebookMetadata, entryId);
    setNotebookMetadata(updatedMeta);
    const metaStr = JSON.stringify(updatedMeta, null, 2);

    if (workspaceMode === "local" && dirHandle) {
      await queueLocalOp(async () => {
        await writeLocalFile(dirHandle, INDEX_PATH, metaStr);
        await deleteLocalFileAtPath(dirHandle, file.path);
        const entryId = file.path.split('/').pop()?.replace('.json', '') || "";
        try {
          await deleteLocalFileAtPath(dirHandle, `${LATEX_DIR}/${entryId}.tex`);
        } catch { /* ignore if not found */ }
        await loadLocalExplorer();
      });
    } else if (workspaceMode === "github" || workspaceMode === "temporary") {
      const dbName = getDBName();
      const entryId = file.path.split('/').pop()?.replace('.json', '') || "";
      const latexPath = `${currentLatexDir}/${entryId}.tex`;

      // Check if it was brand new (not on GitHub yet)
      const allPending = await getAllPending(dbName);
      const stagedEntry = allPending.find(p => p.path === file.path && p.operation === "upsert");
      const isNew = stagedEntry?.label?.includes("New") || stagedEntry?.label?.includes("Import");

      await removeStaged(dbName, file.path);
      await removeStaged(dbName, latexPath);

      if (!isNew) {
        await stage({ path: file.path, content: undefined, operation: "delete", label: "Entry deleted" });
        await stage({ path: latexPath, content: undefined, operation: "delete", label: "LaTeX deleted" });
      }

      if (metaStr === lastRemoteMetadataRef.current) {
        await removeStaged(dbName, currentIndexPath);
      } else {
        await stage({ path: currentIndexPath, content: metaStr, operation: "upsert", label: "Metadata update" });
      }

      const allEntriesTex = generateAllEntriesLatex(updatedMeta, "data/");
      if (allEntriesTex === lastRemoteAllEntriesRef.current) {
        await removeStaged(dbName, currentAllEntriesPath);
      } else {
        await stage({ path: currentAllEntriesPath, content: allEntriesTex, operation: "upsert", label: "Update entry list" });
      }

      setEntries(prev => prev.filter(e => e.path !== file.path));
      refreshPending();
    }

    if (openFile?.path === file.path) {
      setOpenFile(null);
      setLatexContent("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceMode, dirHandle, loadLocalExplorer, stage, openFile, notebookMetadata]);

  // ── Resource delete (cascades to entries) ────────────────────────────────────

  const handleDeleteResource = useCallback(async (file: ExplorerFile) => {
    // When a resource is deleted, we just need to re-validate everything
    // because entries might have been pointing to it.
    const updatedMeta = validateNotebookIntegrity(notebookMetadata);
    setNotebookMetadata(updatedMeta);
    const metaStr = JSON.stringify(updatedMeta, null, 2);

    if (workspaceMode === "local" && dirHandle) {
      await queueLocalOp(async () => {
        await writeLocalFile(dirHandle, INDEX_PATH, metaStr);
        await deleteLocalFileAtPath(dirHandle, file.path);
        await loadLocalExplorer();
      });
    } else if (workspaceMode === "github") {
      const dbName = getDBName();
      const allPending = await getAllPending(dbName);
      const staged = allPending.find(p => p.path === file.path && p.operation === "upsert");
      const isNew = !!staged; // For resources, if it's staged as upsert, it's likely new or updated

      await removeStaged(dbName, file.path);

      // Only stage delete if it wasn't just a new upload
      // Note: This is simpler than entries because resources aren't "updated" in place as often
      if (!isNew) {
        await stage({ path: file.path, operation: "delete", label: "Resource deleted" });
      }

      await stage({ path: currentIndexPath, content: metaStr, operation: "upsert", label: "Metadata update" });
      setResources(prev => prev.filter(r => r.path !== file.path));
      refreshPending();
    } else {
      setResources(prev => prev.filter(r => r.path !== file.path));
    }

    if (openFile?.path === file.path) {
      setOpenFile(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceMode, dirHandle, loadLocalExplorer, stage, entries, contentCache, notebookMetadata, openFile]);

  const handleDownloadPortable = useCallback(async (filename: string, content: string, info: { title: string; author: string; phase: string, createdAt: string, updatedAt?: string }) => {
    try {
      const parsed = JSON.parse(content);
      // Hydrate all assets into Base64 for the export
      const dbName = getDBName();
      const assetCache = new Map<string, string>();
      const images = extractImagePaths(parsed);
      for (const imgPath of images) {
        const staged = (await getAllPending(dbName)).find(p => p.path === imgPath && p.operation === "upsert");
        if (staged?.content) {
          assetCache.set(imgPath, staged.content.startsWith('data:') ? staged.content : `data:image/*;base64,${staged.content}`);
        } else {
          const cached = await getResource(dbName, imgPath);
          if (cached) {
            assetCache.set(imgPath, cached);
          } else if (workspaceMode === "local" && dirHandle) {
            try {
              const res = await getLocalFileContent(dirHandle, imgPath);
              if (res.base64) assetCache.set(imgPath, res.base64);
            } catch { /* ignore */ }
          }
        }
      }

      const hydratedDoc = hydrateAssets(parsed, assetCache);
      const wrapper: EntryWrapper = {
        version: 2,
        metadata: {
          id: openFile?.id || "entry",
          filename: filename,
          resources: {},
          updatedAt: info.updatedAt || info.createdAt,
          ...info
        },
        content: hydratedDoc
      };

      const cleanFilename = (info.title || "entry").replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json";
      const blob = new Blob([JSON.stringify(wrapper, null, 2)], { type: "application/json" });
      saveAs(blob, cleanFilename);
      notify("Entry exported with embedded assets.", "success");
    } catch (e) {
      console.error("Failed to download portable entry", e);
      notify("Failed to export entry.", "error");
    }
  }, [workspaceMode, dirHandle, getDBName, openFile?.id]);



  // ── GitHub commit all ─────────────────────────────────────────────────────────

  const handleCommitAll = useCallback(async () => {
    if (!config || isCommitting) return;
    setIsCommitting(true);
    try {
      const dbName = getDBName();
      const all = await getAllPending(dbName);
      const upserts = all.filter(p => p.operation === "upsert");
      const deletes = all.filter(p => p.operation === "delete");
      const total = all.length;

      const gitChanges: GitChange[] = all.map(change => {
        let content = change.content;
        if (content && content.startsWith("data:")) {
          content = content.split(",")[1];
        }
        return {
          path: change.path,
          content: change.operation === "delete" ? null : (content ?? ""),
          isBinary: change.path.includes("resources/") || /\.(png|jpg|jpeg|gif|webp|pdf)$/i.test(change.path)
        };
      });

      const fileList = all.map(p => {
        const op = p.operation === "delete" ? "Deleted" : "Updated";
        return `- ${op}: ${p.path}`;
      }).join("\n");
      const message = `Update notebook: ${total} file${total !== 1 ? "s" : ""} changed\n\nSummary:\n${fileList}`;

      await commitChanges(config, gitChanges, message);

      // Load from GitHub first so new entries appear in the real list
      await loadGitHubExplorer();

      // Then clear the staged changes
      await clearAllPending(dbName);
      lastRemoteMetadataRef.current = all.find(p => p.path === currentIndexPath)?.content || lastRemoteMetadataRef.current;
      lastRemoteAllEntriesRef.current = all.find(p => p.path === currentAllEntriesPath)?.content || lastRemoteAllEntriesRef.current;
      await refreshPending();
      
      notify("Successfully committed all changes to GitHub.", "success");
    } catch (e: any) {
      console.error("Commit failed", e);
      if (e.message?.includes("Resource not accessible by integration")) {
        notify("Commit failed: The GitHub App may not be installed on this repository or lacks 'Contents' permissions. Please check your GitHub App settings.", "error");
      } else {
        notify(`Commit failed: ${e.message || "Check console for details."}`, "error");
      }
    } finally {
      setIsCommitting(false);
      setIsLoading(false);
    }
  }, [config, isCommitting, refreshPending, loadGitHubExplorer, notify]);

  // ── Project Actions ─────────────────────────────────────────────────────────

  const handleSelectProject = async (id: string) => {
    setIsInitializing(true);
    setIsLoading(true);
    const p = await getProject(id);
    if (p) {
      p.lastOpened = isoTimestamp();
      await saveProject(p);
      await refreshProjectList();
      setNotebookMetadata(EMPTY_METADATA);
      setCurrentProjectId(p.id);

      // Update URL immediately so handleUrlChange doesn't settle early
      const params = new URLSearchParams(window.location.search);
      params.set('project', p.id);
      window.history.pushState({}, '', `?${params.toString()}`);
      window.dispatchEvent(new Event('locationchange'));

      if (p.type === "github" && p.githubConfig) {
        setConfig(p.githubConfig);
        setWorkspaceMode("github");
      } else if (p.type === "local") {
        const handle = await getProjectHandle(p.id);
        if (handle) {
          const hasPermission = await checkPermission(handle);
          if (!hasPermission) {
            setPendingProjectId(p.id);
            setIsConnectingLocal(true);
            setDirHandle(handle);
            return;
          }
          setDirHandle(handle);
          setWorkspaceMode("local");
        } else {
          notify("Local folder handle not found. Please re-open.", "error");
        }
      } else if (p.type === "temporary") {
        setWorkspaceMode("temporary");
      }
    }
  };

  const handleDeleteProject = async (id: string) => {
    const p = await getProject(id);
    if (!p) return;

    showConfirm(
      "Delete Project?",
      `Are you sure you want to delete "${p.name}"? This will permanently remove all local staged changes and cached data for this project.`,
      async () => {
        // Resolve DB name using standard helper
        const dbName = getProjectDBName(p);

        await deleteProject(id);
        await deleteProjectHandle(id);
        await deleteProjectDatabase(dbName);

        // Clear project-specific localStorage if it matches
        if (p.type === "github" && p.githubConfig) {
          if (localStorage.getItem("nb-github-repo-url")?.includes(p.githubConfig.repo)) {
            localStorage.removeItem("nb-github-repo-url");
            localStorage.removeItem("nb-github-folder");
          }
        }

        await refreshProjectList();
        if (currentProjectId === id) {
          handleDisconnect();
        }
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      }
    );
  };

  const handleRenameProject = async (id: string, name: string) => {
    const p = await getProject(id);
    if (p) {
      p.name = name;
      await saveProject(p);
      await refreshProjectList();
    }
  };

  const handleCreateGithub = async (githubConfig: GitHubConfig) => {
    setIsInitializing(true);
    setIsLoading(true);
    const fullHash = await hashContent(`github:${githubConfig.owner.toLowerCase()}/${githubConfig.repo.toLowerCase()}`);
    const id = fullHash.slice(0, 32);
    const p: Project = {
      id,
      name: `${githubConfig.owner}/${githubConfig.repo}`,
      type: "github",
      lastOpened: isoTimestamp(),
      githubConfig
    };
    await saveProject(p);
    await refreshProjectList();
    setCurrentProjectId(id);

    // Update URL immediately so handleUrlChange doesn't settle early
    const params = new URLSearchParams(window.location.search);
    params.set('project', id);
    window.history.pushState({}, '', `?${params.toString()}`);
    window.dispatchEvent(new Event('locationchange'));

    setConfig(githubConfig);
    setWorkspaceMode("github");
  };

  const handleCreateLocal = async (handle: FileSystemDirectoryHandle) => {
    // Explicitly request readwrite permission to trigger the browser's persistent permission prompt if available
    try {
      await (handle as any).requestPermission({ mode: "readwrite" });
    } catch (e) {
      console.error("Initial permission request failed", e);
    }

    // 1. Check for existing notebook.json
    let existingMeta: NotebookMetadata | null = null;
    try {
      const data = await getLocalFileContent(handle, INDEX_PATH);
      if (data && !data.isImage && data.text) {
        existingMeta = JSON.parse(data.text);
      }
    } catch (e) {
      // Doesn't exist or failed, ignore
    }

    let id = existingMeta?.projectId;
    let name = existingMeta?.projectName || handle.name;

    // 2. Check if we already have this project in DB
    if (id) {
      const p = await getProject(id);
      if (p && p.type === "local") {
        // Just select it if it matches the type
        return handleSelectProject(id);
      }
      // If it's a different type (e.g. GitHub project backup), ignore the ID and generate a new local one
      const fullHash = await hashContent(`local:${handle.name}`);
      id = fullHash.slice(0, 32);
    } else {
      const fullHash = await hashContent(`local:${handle.name}`);
      id = fullHash.slice(0, 32);
    }

    const p: Project = {
      id,
      name,
      type: "local",
      lastOpened: isoTimestamp(),
      folderName: handle.name
    };

    // 3. Save to DB
    await saveProject(p);
    await saveProjectHandle(id, handle);

    // 4. Update notebook.json if needed
    const meta = existingMeta || { ...EMPTY_METADATA };
    if (!meta.projectId || !meta.projectName) {
      meta.projectId = id;
      meta.projectName = name;
      const metaStr = JSON.stringify(meta, null, 2);
      await writeLocalFile(handle, INDEX_PATH, metaStr);
    }

    await refreshProjectList();
    setCurrentProjectId(id);

    // Update URL immediately so handleUrlChange doesn't settle early
    const params = new URLSearchParams(window.location.search);
    params.set('project', id);
    window.history.pushState({}, '', `?${params.toString()}`);
    window.dispatchEvent(new Event('locationchange'));

    setDirHandle(handle);
    setWorkspaceMode("local");
    checkPermission(handle);
  };

  const handleCreateTemporary = async () => {
    setIsInitializing(true);
    setCurrentProjectId("temporary");

    // Update URL
    const params = new URLSearchParams(window.location.search);
    params.set('project', 'temporary');
    window.history.pushState({}, '', `?${params.toString()}`);
    window.dispatchEvent(new Event('locationchange'));

    setWorkspaceMode("temporary");
  };

  // ── Disconnect ────────────────────────────────────────────────────────────────

  const handleDisconnect = () => {
    const performDisconnect = () => {
      const params = new URLSearchParams(window.location.search);
      params.delete('project');
      params.delete('entry');
      params.delete('resource');
      window.history.pushState({}, '', `?${params.toString()}`);
      window.dispatchEvent(new Event('locationchange'));

      setCurrentProjectId(null);
      setWorkspaceMode(null);
      setConfig(null);
      setDirHandle(null);
      setEntries([]);
      setResources([]);
      setOpenFile(null);
      setLatexContent("");
      setContentCache(new Map());
      setNotebookMetadata(EMPTY_METADATA);
      // refreshProjectList is triggered by the isInitializing effect once settled
    };

    if (workspaceMode === "temporary") {
      showConfirm(
        "Leave Temporary Workspace?",
        "You are in a Temporary Workspace. All unsaved changes will be lost. Are you sure you want to leave?",
        () => {
          performDisconnect();
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        },
        "warning"
      );
    } else {
      performDisconnect();
    }
  };

  // ── Workspace setup ───────────────────────────────────────────────────────────
  let pageContent: React.ReactNode = null;

  if (isInitializing) {
    pageContent = (
      <div className="min-h-screen bg-nb-bg flex flex-col items-center justify-center font-sans animate-in fade-in duration-500">
        <div className="flex flex-col items-center gap-6">
          <div className="w-20 h-20 rounded-[2.5rem] bg-nb-primary flex items-center justify-center shadow-2xl shadow-nb-primary/30 animate-pulse">
            <BookOpen size={40} className="text-white" />
          </div>
          <div className="text-center space-y-2">
            <h1 className="text-xl font-black tracking-tight text-nb-on-surface">Notebook</h1>
            <p className="text-[10px] font-black tracking-[0.2em] text-nb-on-surface-variant uppercase opacity-40">Engineering Editor</p>
          </div>
          <div className="flex items-center gap-1 mt-4">
            <div className="w-1.5 h-1.5 rounded-full bg-nb-primary animate-bounce [animation-delay:-0.3s]" />
            <div className="w-1.5 h-1.5 rounded-full bg-nb-primary animate-bounce [animation-delay:-0.15s]" />
            <div className="w-1.5 h-1.5 rounded-full bg-nb-primary animate-bounce" />
          </div>
        </div>
      </div>
    );
  } else if (!workspaceMode) {
    pageContent = (
      <Settings
        projects={projects}
        pendingCounts={projectPendingCounts}
        onSelectProject={handleSelectProject}
        onDeleteProject={handleDeleteProject}
        onRenameProject={handleRenameProject}
        onCreateGithub={handleCreateGithub}
        onCreateLocal={handleCreateLocal}
        onCreateTemporary={handleCreateTemporary}
        githubToken={githubToken}
        githubUser={githubUser}
        onSignOutGithub={() => {
          setGithubToken(null);
          setGithubUser(null);
          localStorage.removeItem("nb-github-token");
          localStorage.removeItem("nb-github-user");
        }}
      />
    );
  }

  // ── Pending change summary ─────────────────────────────────────────────────────

  const upserted = pendingChanges.filter(p => p.operation === "upsert");
  const deleted = pendingChanges.filter(p => p.operation === "delete");

  // ── Workspace label ───────────────────────────────────────────────────────────

  const currentProject = projects.find(p => p.id === currentProjectId);
  const workspaceLabel =
    workspaceMode === "github" ? `${config?.owner}/${config?.repo}` :
      workspaceMode === "local" ? (currentProject?.name ?? "Local Folder") : "Temporary";

  const ModeIcon = ArrowLeftRight;

  // ── Pending path sets for FileExplorer ────────────────────────────────────────

  const pendingPathSet = new Set(pendingChanges.filter(p => p.operation === "upsert").map(p => p.path));
  const deletedPathSet = new Set(pendingChanges.filter(p => p.operation === "delete").map(p => p.path));

  const appConfig = config ?? { owner: "Local", repo: "Workspace", token: "", entriesDir: currentEntriesDir, resourcesDir: currentAssetsDir };

  // ── Render ────────────────────────────────────────────────────────────────────

  const sidebarContent = (
    <div className="flex flex-col h-full overflow-hidden bg-nb-surface-low">
      {/* Sidebar header */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-nb-outline-variant shrink-0 bg-nb-surface">
        <div className="w-6 h-6 rounded-md bg-nb-primary flex items-center justify-center shadow-sm shadow-nb-primary/20">
          <BookOpen size={14} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-nb-on-surface truncate">Notebook</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleDisconnect}
            title="Switch Workspace"
            className="p-1.5 rounded-lg hover:bg-nb-surface-low text-nb-on-surface-variant hover:text-nb-on-surface transition-colors"
          >
            <ModeIcon size={16} />
          </button>
          {isMobile && (
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-1.5 rounded-lg hover:bg-nb-surface-low text-nb-on-surface-variant transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Explorer */}
      <div className="flex-1 overflow-y-auto">
        <FileExplorer
          entries={displayEntries}
          resources={displayResources}
          onSelectEntry={handleSelectEntry}
          onSelectResource={handleSelectResource}
          activePath={openFile?.path ?? null}
          pendingPaths={pendingPathSet}
          deletedPaths={deletedPathSet}
          onNewEntry={handleNewEntry}
          onUploadResource={handleUploadResource}
          search={entrySearch}
          onSearchChange={setEntrySearch}
          sortBy={entrySort}
          onSortChange={setEntrySort}
          sortDirection={entrySortDirection}
          onSortDirectionToggle={() => setEntrySortDirection(prev => prev === "asc" ? "desc" : "asc")}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        />
      </div>

      {/* Footer */}
      <div className="p-4 bg-nb-surface border-t border-nb-outline-variant">
        {workspaceMode === "github" && (pendingChanges.length > 0 || isCommitting) && (
          <div className="mb-4">
            <div className="bg-nb-tertiary/5 rounded-xl p-3 border border-nb-tertiary/10 mb-3 space-y-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsPendingCollapsed(!isPendingCollapsed)}
                  className="flex items-center gap-2 flex-1 group cursor-pointer"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-nb-tertiary animate-pulse" />
                  <span className="text-[9px] font-black tracking-widest text-nb-tertiary uppercase flex-1 text-left">Pending Changes ({pendingChanges.length})</span>
                  <ChevronDown size={12} className={`text-nb-tertiary transition-transform duration-200 ${isPendingCollapsed ? "-rotate-90" : ""}`} />
                </button>
                {!isCommitting && (
                  <button
                    onClick={handleDiscardAll}
                    className="text-[8px] font-bold text-nb-on-surface-variant hover:text-red-500 transition-colors uppercase tracking-widest px-2 py-1 rounded hover:bg-red-50 cursor-pointer"
                  >
                    Discard
                  </button>
                )}
              </div>
              {!isPendingCollapsed && (
                <div className="max-h-24 overflow-y-auto scrollbar-hide space-y-1.5 pl-4.5 border-l border-nb-tertiary/10 ml-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
                  {pendingChanges.slice(0, 5).map(p => (
                    <div key={p.path} className="text-[8px] font-mono text-nb-on-surface-variant/60 truncate flex gap-2">
                      <span className={`uppercase font-bold ${p.operation === 'delete' ? 'text-red-500/60' : 'text-nb-tertiary/60'}`}>
                        {p.operation === 'delete' ? 'del' : 'upd'}
                      </span>
                      <span className="truncate">{p.path.split('/').pop()}</span>
                    </div>
                  ))}
                  {pendingChanges.length > 5 && (
                    <div className="text-[8px] italic opacity-40 pl-2">+{pendingChanges.length - 5} more files...</div>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={handleCommitAll}
              disabled={isCommitting || (upserted.length === 0 && deleted.length === 0)}
              className="w-full bg-nb-tertiary hover:bg-nb-tertiary-dim text-white text-[9px] font-bold tracking-widest py-3 rounded-lg transition-all active:scale-[0.98] shadow-lg shadow-nb-tertiary/20 disabled:opacity-30"
            >
              {isCommitting ? "Syncing..." : "Sync to GitHub"}
            </button>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`} />
            <span className="text-[9px] font-bold tracking-widest text-nb-on-surface-variant">{isLoading ? 'Syncing' : 'Connected'}</span>
          </div>
          <span className="text-[9px] font-mono text-nb-on-surface-variant/40 truncate max-w-[120px]">{workspaceLabel}</span>
        </div>
      </div>
    </div>
  );

  const mainContent = pageContent || (

    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 bg-nb-surface border-b border-nb-outline-variant shrink-0">
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 rounded-lg bg-nb-surface-low text-nb-on-surface-variant hover:text-nb-primary transition-colors"
          title={isSidebarOpen ? "Close Sidebar" : "Open Sidebar"}
        >
          <Menu size={18} />
        </button>

        {openFile?.viewMode === "entry" && isMobile ? (
          <div className="flex bg-nb-surface-low rounded-lg p-0.5 border border-nb-outline-variant/30">
            <button
              onClick={() => setMobileTab("editor")}
              className={`px-3 py-1 rounded-md text-[9px] font-bold tracking-widest transition-all ${mobileTab === 'editor' ? 'bg-nb-surface text-nb-primary shadow-sm' : 'text-nb-on-surface-variant/60'}`}
            >
              Editor
            </button>
            <button
              onClick={() => setMobileTab("preview")}
              className={`px-3 py-1 rounded-md text-[9px] font-bold tracking-widest transition-all ${mobileTab === 'preview' ? 'bg-nb-surface text-nb-primary shadow-sm' : 'text-nb-on-surface-variant/60'}`}
            >
              Preview
            </button>
          </div>
        ) : (
          <div className="flex-1 flex justify-center min-w-0 px-4">
            {isRenamingProject && currentProjectId !== "temporary" ? (
              <input
                autoFocus
                type="text"
                value={projectRenameValue}
                onChange={(e) => setProjectRenameValue(e.target.value)}
                onBlur={() => setIsRenamingProject(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (currentProjectId) handleRenameProject(currentProjectId, projectRenameValue);
                    setIsRenamingProject(false);
                  }
                  if (e.key === 'Escape') setIsRenamingProject(false);
                }}
                className="bg-nb-surface-low border border-nb-primary/30 px-3 py-1 rounded-lg text-sm font-bold text-nb-on-surface outline-none focus:ring-2 focus:ring-nb-primary/30 w-full max-w-[300px]"
              />
            ) : (
              <span
                onClick={() => {
                  if (currentProjectId === "temporary") return;
                  const p = projects.find(p => p.id === currentProjectId);
                  if (p) {
                    setProjectRenameValue(p.name);
                    setIsRenamingProject(true);
                  }
                }}
                className={`text-sm font-bold text-nb-on-surface truncate max-w-[300px] transition-colors px-2 py-1 rounded-md ${currentProjectId === "temporary" ? "" : "cursor-pointer hover:text-nb-primary hover:bg-nb-surface-low"}`}
                title={currentProjectId === "temporary" ? "" : "Click to rename project"}
              >
                {currentProjectId === "temporary" ? "Temporary Workspace" : (projects.find(p => p.id === currentProjectId)?.name || "Engineering Notebook")}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          {openFile?.viewMode === "entry" && !isMobile && (
            <div className="flex bg-nb-surface-low rounded-lg p-0.5 border border-nb-outline-variant/30 mr-2 shadow-sm">
              <button
                onClick={() => setDesktopViewMode("editor")}
                className={`px-3 py-1.5 rounded-md text-[9px] font-bold tracking-widest transition-all ${desktopViewMode === "editor" ? 'bg-nb-surface text-nb-primary shadow-sm' : 'text-nb-on-surface-variant/60 hover:text-nb-primary'}`}
              >
                Editor
              </button>
              <button
                onClick={() => setDesktopViewMode("split")}
                className={`px-3 py-1.5 rounded-md text-[9px] font-bold tracking-widest transition-all ${desktopViewMode === "split" ? 'bg-nb-surface text-nb-primary shadow-sm' : 'text-nb-on-surface-variant/60 hover:text-nb-primary'}`}
              >
                Split
              </button>
              <button
                onClick={() => setDesktopViewMode("preview")}
                className={`px-3 py-1.5 rounded-md text-[9px] font-bold tracking-widest transition-all ${desktopViewMode === "preview" ? 'bg-nb-surface text-nb-primary shadow-sm' : 'text-nb-on-surface-variant/60 hover:text-nb-primary'}`}
              >
                LaTeX
              </button>
            </div>
          )}
          <button
            onClick={() => setTheme(isDarkMode ? "light" : "dark")}
            className="p-2 rounded-lg bg-nb-surface-low text-nb-on-surface-variant hover:text-nb-on-surface transition-colors"
          >
            {!mounted ? <div className="w-4 h-4" /> : isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative bg-nb-bg">
        {/* Permission / Connection Modals */}
        {(isConnectingLocal || (needsPermission && workspaceMode === "local")) && (
          <div className="absolute inset-0 z-[200] bg-nb-bg/80 backdrop-blur-md flex items-center justify-center p-8">
            <div className="max-w-md w-full bg-nb-surface border border-nb-outline-variant rounded-3xl p-8 shadow-2xl text-center animate-in fade-in zoom-in duration-300">
              <div className="w-20 h-20 rounded-2xl bg-nb-primary/10 text-nb-primary flex items-center justify-center mx-auto mb-8">
                <HardDrive size={40} />
              </div>
              <h2 className="text-2xl font-bold text-nb-on-surface mb-4">Connect to Workspace</h2>
              <p className="text-sm text-nb-on-surface-variant mb-10 leading-relaxed px-4">
                The browser needs your permission to access <strong>{dirHandle?.name || "the local folder"}</strong>.
                This is a standard security requirement for local file access.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={requestPermission}
                  className="w-full bg-nb-primary hover:bg-nb-primary-dim text-white font-bold py-4 rounded-xl shadow-lg shadow-nb-primary/20 transition-all active:scale-[0.98]"
                >
                  Grant Folder Access
                </button>
                <button
                  onClick={() => { setIsConnectingLocal(false); setPendingProjectId(null); }}
                  className="w-full bg-nb-surface-low text-nb-on-surface-variant hover:text-nb-on-surface font-bold py-4 rounded-xl transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {openFile === null ? (
          !isConnectingLocal && (
            <WelcomePage
              workspace={{ mode: workspaceMode as any, label: workspaceLabel }}
              onNewEntry={handleNewEntry}
              onImportEntry={handleImportEntry}
              onDisconnect={handleDisconnect}
              onOpenSidebar={() => setIsSidebarOpen(true)}
            />
          )
        ) : openFile.viewMode === "image" ? (
          <ImagePreview
            filename={openFile.name}
            src={openFile.imageSrc}
            onDelete={() => handleDeleteResource({ name: openFile.name, path: openFile.path })}
          />
        ) : openFile.viewMode === "raw-latex" ? (
          <Preview latexContent={openFile.rawLatex} />
        ) : isMobile ? (
          <div className="h-full relative overflow-hidden bg-nb-surface-low">
            {/* Editor Tab */}
            <div
              className={`absolute inset-0 transition-transform duration-300 ease-out ${mobileTab === 'editor' ? 'translate-x-0' : '-translate-x-full'}`}
              aria-hidden={mobileTab !== 'editor'}
            >
              <Editor
                key={openFile.path}
                config={appConfig}
                isLocalMode={workspaceMode !== "github"}
                initialTitle={openFile.title}
                initialAuthor={openFile.author}
                initialPhase={openFile.phase}
                initialContent={openFile.tiptapContent}
                initialCreatedAt={openFile.createdAt}
                initialUpdatedAt={openFile.updatedAt}
                metadataMissing={openFile.metadataMissing}
                isValid={notebookMetadata.entries[openFile.id]?.isValid}
                onValidationChange={handleValidationChange}
                filename={openFile.path}
                onDeleted={(path) => handleDeleteEntry({ name: openFile.name, path })}
                onContentChange={handleContentChange}
                onTitleChange={(title) => {
                  if (!openFile) return;
                  const entryId = openFile.id;
                  setOpenFile(prev => prev ? { ...prev, title } : null);
                  setNotebookMetadata(prev => updateEntryInIndex(prev, entryId, {
                    ...prev.entries[entryId],
                    title,
                    id: entryId,
                    author: openFile.author,
                    phase: openFile.phase,
                    createdAt: openFile.createdAt,
                    updatedAt: isoTimestamp(),
                    filename: openFile.path
                  }));
                }}
                onAuthorChange={(author) => {
                  if (!openFile) return;
                  const entryId = openFile.id;
                  setOpenFile(prev => prev ? { ...prev, author } : null);
                  setNotebookMetadata(prev => updateEntryInIndex(prev, entryId, {
                    ...prev.entries[entryId],
                    author,
                    id: entryId,
                    title: openFile.title,
                    phase: openFile.phase,
                    createdAt: openFile.createdAt,
                    updatedAt: isoTimestamp(),
                    filename: openFile.path
                  }));
                }}
                onPhaseChange={(phase) => {
                  if (!openFile) return;
                  const entryId = openFile.id;
                  setOpenFile(prev => prev ? { ...prev, phase } : null);
                  setNotebookMetadata(prev => updateEntryInIndex(prev, entryId, {
                    ...prev.entries[entryId],
                    phase,
                    id: entryId,
                    title: openFile.title,
                    author: openFile.author,
                    createdAt: openFile.createdAt,
                    updatedAt: isoTimestamp(),
                    filename: openFile.path
                  }));
                }}
                onImageUpload={handleImageUploaded}
                onDownloadPortable={handleDownloadPortable}
                onClose={() => {
                  const params = new URLSearchParams(window.location.search);
                  params.delete('entry');
                  params.delete('resource');
                  window.history.pushState({}, '', `?${params.toString()}`);
                  window.dispatchEvent(new Event('locationchange'));
                  setOpenFile(null);
                }}
                dbName={getDBName()}
                isSaving={savingPaths.has(openFile.path)}
                notebookMetadata={notebookMetadata}
                targetResourceId={targetResourceId}
              />
            </div>
            {/* Preview Tab */}
            <div
              className={`absolute inset-0 transition-transform duration-300 ease-out bg-nb-bg ${mobileTab === 'preview' ? 'translate-x-0' : 'translate-x-full'}`}
              aria-hidden={mobileTab !== 'preview'}
            >
              <Preview latexContent={latexContent} />
            </div>
          </div>
        ) : (
          <PanelGroup direction="horizontal" className="h-full" id="editor-preview-group">
            <Panel
              id="editor-panel"
              order={1}
              ref={editorPanelRef}
              collapsible={true}
              minSize={30}
              defaultSize={desktopViewMode === "editor" ? 100 : (desktopViewMode === "preview" ? 0 : 50)}
              onCollapse={() => { if (desktopViewMode !== "preview") setDesktopViewMode("preview"); }}
              onExpand={() => { if (desktopViewMode === "preview") setDesktopViewMode("split"); }}
              className={`flex flex-col h-full transition-all duration-300 ease-out ${desktopViewMode === "preview" ? "opacity-0 pointer-events-none" : "opacity-100"}`}
            >
              <Editor
                key={openFile.path}
                config={appConfig}
                isLocalMode={workspaceMode !== "github"}
                initialTitle={openFile.title}
                initialAuthor={openFile.author}
                initialPhase={openFile.phase}
                initialCreatedAt={openFile.createdAt}
                initialUpdatedAt={openFile.updatedAt}
                initialContent={openFile.tiptapContent}
                metadataMissing={openFile.metadataMissing}
                isValid={notebookMetadata.entries[openFile.id]?.isValid}
                onValidationChange={handleValidationChange}
                filename={openFile.path}
                onDeleted={(path) => handleDeleteEntry({ name: openFile.name, path })}
                onContentChange={handleContentChange}
                onTitleChange={(title) => {
                  if (!openFile) return;
                  const entryId = openFile.id;
                  setOpenFile(prev => prev ? { ...prev, title } : null);
                  setNotebookMetadata(prev => updateEntryInIndex(prev, entryId, {
                    ...prev.entries[entryId],
                    title,
                    id: entryId,
                    author: openFile.author,
                    phase: openFile.phase,
                    createdAt: openFile.createdAt,
                    updatedAt: isoTimestamp(),
                    filename: openFile.path
                  }));
                }}
                onAuthorChange={(author) => {
                  if (!openFile) return;
                  const entryId = openFile.id;
                  setOpenFile(prev => prev ? { ...prev, author } : null);
                  setNotebookMetadata(prev => updateEntryInIndex(prev, entryId, {
                    ...prev.entries[entryId],
                    author,
                    id: entryId,
                    title: openFile.title,
                    phase: openFile.phase,
                    createdAt: openFile.createdAt,
                    updatedAt: isoTimestamp(),
                    filename: openFile.path
                  }));
                }}
                onPhaseChange={(phase) => {
                  if (!openFile) return;
                  const entryId = openFile.id;
                  setOpenFile(prev => prev ? { ...prev, phase } : null);
                  setNotebookMetadata(prev => updateEntryInIndex(prev, entryId, {
                    ...prev.entries[entryId],
                    phase,
                    id: entryId,
                    title: openFile.title,
                    author: openFile.author,
                    createdAt: openFile.createdAt,
                    updatedAt: isoTimestamp(),
                    filename: openFile.path
                  }));
                }}
                onImageUpload={handleImageUploaded}
                onDownloadPortable={handleDownloadPortable}
                onClose={() => {
                  const params = new URLSearchParams(window.location.search);
                  params.delete('entry');
                  params.delete('resource');
                  window.history.pushState({}, '', `?${params.toString()}`);
                  window.dispatchEvent(new Event('locationchange'));
                  setOpenFile(null);
                }}
                dbName={getDBName()}
                isSaving={savingPaths.has(openFile.path)}
                notebookMetadata={notebookMetadata}
                targetResourceId={targetResourceId}
              />
            </Panel>

            <PanelResizeHandle id="editor-preview-resizer" className={`w-1.5 bg-nb-surface-mid hover:bg-nb-tertiary/40 transition-colors ${desktopViewMode !== 'split' ? 'hidden' : ''}`} />

            <Panel
              id="preview-panel"
              order={2}
              ref={previewPanelRef}
              collapsible={true}
              minSize={30}
              defaultSize={desktopViewMode === "preview" ? 100 : (desktopViewMode === "editor" ? 0 : 50)}
              onCollapse={() => { if (desktopViewMode !== "editor") setDesktopViewMode("editor"); }}
              onExpand={() => { if (desktopViewMode === "editor") setDesktopViewMode("split"); }}
              className={`flex flex-col h-full bg-nb-surface-low transition-all duration-300 ease-out ${desktopViewMode === "editor" ? "opacity-0 pointer-events-none" : "opacity-100"}`}
            >
              <Preview latexContent={latexContent} />
            </Panel>
          </PanelGroup>
        )}
      </div>
    </div>
  );

  return (
    <div className={`flex flex-col h-screen w-full bg-nb-bg font-sans ${pageContent ? "overflow-y-auto" : "overflow-hidden"}`}>
      {pageContent ? pageContent : (
        isMobile ? (
          <div className="flex w-full h-full relative">
            <div className={`fixed inset-0 z-[150] transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => setIsSidebarOpen(false)}
              />
              <div className={`absolute top-0 bottom-0 left-0 w-[85%] max-w-[300px] bg-nb-surface-low border-r border-nb-outline-variant flex flex-col shadow-2xl transition-transform duration-300 ease-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                {sidebarContent}
              </div>
            </div>
            <div className="flex-1 w-full h-full">
              {mainContent}
            </div>
          </div>
        ) : (
          <PanelGroup direction="horizontal" className="w-full h-full" id="main-layout-group">
            <Panel
              id="sidebar-panel"
              order={1}
              ref={sidebarPanelRef}
              defaultSize={20}
              minSize={15}
              maxSize={40}
              collapsible={true}
              onCollapse={() => setIsSidebarOpen(false)}
              onExpand={() => setIsSidebarOpen(true)}
              className="flex flex-col transition-all duration-300 ease-out"
            >
              <div className={`flex-1 flex flex-col transition-all duration-300 ease-out ${!isSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                {sidebarContent}
              </div>
            </Panel>
            <PanelResizeHandle id="sidebar-resizer" className={`w-1.5 bg-nb-surface-mid hover:bg-nb-tertiary/40 transition-colors ${!isSidebarOpen ? 'hidden' : ''}`} />
            <Panel id="main-panel" order={2} defaultSize={isSidebarOpen ? 80 : 100} minSize={30} className="flex flex-col">
              {mainContent}
            </Panel>
          </PanelGroup>
        ))}


      {/* Notifications */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-[200] animate-in slide-in-from-right-10 duration-300">
          <div className={`px-5 py-4 rounded-2xl shadow-nb-lg border flex items-center gap-4 ${notification.type === 'error' ? 'bg-nb-primary/5 border-nb-primary/30 text-nb-primary' : 'bg-nb-tertiary/5 border-nb-tertiary/30 text-nb-tertiary'
            } backdrop-blur-xl bg-white/80 dark:bg-nb-dark-surface/80`}>
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">{notification.type === 'error' ? 'Error' : 'Success'}</p>
              <p className="text-xs font-medium">{notification.message}</p>
            </div>
            <button onClick={() => setNotification(null)} className="p-1 hover:bg-black/5 rounded transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        variant={confirmDialog.variant}
      />
    </div>
  );
}
