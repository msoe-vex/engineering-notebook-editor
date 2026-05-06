"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import {
  GitHubConfig, fetchFileContent, fetchRawFileContent,
  commitChanges, GitChange, fetchGitHubUser
} from "@/lib/github";
import { ExplorerFile } from "@/lib/types";
import {
  stageChange, getAllPending, clearAllPending, PendingChange,
  putResource, getResource,
  Project, getProjects, getProject, saveProject, deleteProject, getProjectHandle, saveProjectHandle, deleteProjectHandle, deleteProjectDatabase,
  getProjectDBName
} from "@/lib/db";
import {
  NotebookMetadata, EMPTY_METADATA, EntryMetadata, EntryWrapper,
  updateEntryInIndex, removeEntryFromMetadata,
  dehydrateAssets, hydrateAssets, remapContentIds, isEntryValid, validateNotebookIntegrity
} from "@/lib/metadata";
import Settings from "./Settings";
import Editor from "./Editor";
import Preview from "./Preview";
import WelcomePage from "./WelcomePage";
import Sidebar from "./Sidebar";
import ProjectHeader from "./ProjectHeader";
import PendingChangesPanel from "./PendingChangesPanel";
import ConfirmationDialog from "./ConfirmationDialog";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { HardDrive, ArrowLeftRight, X, BookOpen } from "lucide-react";
import { ImperativePanelHandle } from "react-resizable-panels";
import { saveAs } from "file-saver";
import { generateUUID, hashContent } from "@/lib/utils";
import { generateEntryLatex, generateAllEntriesLatex } from "@/lib/latex";
import { extractImagePaths, extractResources, extractReferences, TipTapNode } from "@/lib/metadata";
import { ENTRIES_DIR, ASSETS_DIR, LATEX_DIR, INDEX_PATH, ALL_ENTRIES_PATH } from "@/lib/constants";
import { useWorkspace, WorkspaceMode } from "@/hooks/useWorkspace";
import { usePersistence } from "@/hooks/usePersistence";
import { getLocalFileContent, writeLocalFile, ensureLocalDirectory } from "@/lib/fs";

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = "entry";
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
  id: string;
  viewMode: ViewMode;
  rawLatex: string;
  tiptapContent: string;
  title: string;
  author: string;
  phase: string;
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function App() {
  const {
    mode: workspaceMode,
    config,
    dirHandle,
    entries,
    metadata: notebookMetadata,
    setMetadata: setNotebookMetadata,
    setEntries,
    isLoading,
    setIsLoading,
    getDBName,
    loadLocalExplorer,
    loadGitHubExplorer,
    setMode: setWorkspaceMode,
    setConfig,
    setDirHandle,
    setCurrentProjectId,
    currentProjectId,
    disconnect: performDisconnect,
  } = useWorkspace();

  const {
    saveMetadata,
    saveEntry,
    deleteFile,
    uploadResource,
    stage,
  } = usePersistence({
    mode: workspaceMode,
    dbName: getDBName(),
    dirHandle,
  });

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectPendingCounts, setProjectPendingCounts] = useState<Record<string, number>>({});
  const [isInitializing, setIsInitializing] = useState(true);
  const [githubToken, setGithubToken] = useState<string | null>(null);
  const [githubUser, setGithubUser] = useState<string | null>(null);

  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const notify = useCallback((message: string, type: "error" | "success" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [isCommitting, setIsCommitting] = useState(false);
  const [savingPaths, setSavingPaths] = useState<Set<string>>(new Set());

  const [isRenamingProject, setIsRenamingProject] = useState(false);
  const [projectRenameValue, setProjectRenameValue] = useState("");

  const [openFile, setOpenFile] = useState<OpenFileState | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [isConnectingLocal, setIsConnectingLocal] = useState(false);
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const [activeWorkspaceMode, setActiveWorkspaceMode] = useState<WorkspaceMode>("none");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [prevSync, setPrevSync] = useState({ mode: workspaceMode, init: isInitializing });
  if (prevSync.mode !== workspaceMode || prevSync.init !== isInitializing) {
    setPrevSync({ mode: workspaceMode, init: isInitializing });
    if (!isInitializing) setActiveWorkspaceMode(workspaceMode);
  }

  const notebookMetadataRef = useRef(notebookMetadata);
  useEffect(() => { notebookMetadataRef.current = notebookMetadata; }, [notebookMetadata]);

  const lastSavedContentsRef = useRef<Map<string, string>>(new Map());
  const [targetResourceId, setTargetResourceId] = useState<string | null>(null);

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

  const refreshProjectList = useCallback(async () => {
    const p = await getProjects();
    const counts: Record<string, number> = {};
    await Promise.all(p.map(async (proj) => {
      const dbName = getProjectDBName(proj);
      const pending = await getAllPending(dbName);
      counts[proj.id] = pending.length;
    }));
    setProjects(p);
    setProjectPendingCounts(counts);
  }, []);

  const checkPermission = async (handle: FileSystemDirectoryHandle) => {
    if (!handle) return false;
    try {
      const status = await handle.queryPermission({ mode: 'readwrite' });
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
      const status = await handle.requestPermission({ mode: 'readwrite' });
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

  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const isMobile = useIsMobile();
  const [userSidebarPreference, setUserSidebarPreference] = useState<boolean | null>(null);
  const isSidebarOpen = userSidebarPreference ?? !isMobile;
  const [mobileTab, setMobileTab] = useState<"editor" | "preview">("editor");
  const [desktopViewMode, setDesktopViewMode] = useState<"editor" | "split" | "preview">("editor");

  const editorPanelRef = useRef<ImperativePanelHandle>(null);
  const previewPanelRef = useRef<ImperativePanelHandle>(null);
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
  const importEntryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sidebarPanelRef.current || isMobile) return;
    if (isSidebarOpen) {
      sidebarPanelRef.current.expand();
    } else {
      sidebarPanelRef.current.collapse();
    }
  }, [isSidebarOpen, isMobile]);

  useEffect(() => {
    if (!editorPanelRef.current || !previewPanelRef.current) return;
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
  }, [desktopViewMode]);

  const isExchangingCode = useRef(false);
  const [isExchangingGithubCode, setIsExchangingGithubCode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !!new URLSearchParams(window.location.search).get('code');
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const init = async () => {
      setMounted(true);
      const token = localStorage.getItem("nb-github-token");
      const user = localStorage.getItem("nb-github-user");
      setGithubToken(token);
      setGithubUser(user);

      const code = params.get("code");
      if (code && !isExchangingCode.current) {
        setIsExchangingGithubCode(true);
        isExchangingCode.current = true;
        setIsInitializing(true);
        try {
          const res = await fetch("/api/auth/github", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code }),
          });
          const data = await res.json();
          if (data.access_token) {
            localStorage.setItem("nb-github-token", data.access_token);
            setGithubToken(data.access_token);
            try {
              const userResult = await fetchGitHubUser(data.access_token);
              if (userResult.login) {
                localStorage.setItem("nb-github-user", userResult.login);
                setGithubUser(userResult.login);
                notify(`Signed in as ${userResult.login}`, "success");
              }
            } catch (e) {
              console.error("Failed to fetch GitHub user info", e);
            }
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete("code");
            window.history.replaceState({}, "", newUrl.toString());
          } else if (data.error) {
            notify(`GitHub sign-in error: ${data.error}`, "error");
          }
        } catch (err) {
          console.error(err);
          notify("GitHub sign-in failed connection.", "error");
        } finally {
          setIsInitializing(false);
          setIsExchangingGithubCode(false);
          isExchangingCode.current = false;
        }
      }
    };
    init();
    if (!params.get("code")) {
      setIsInitializing(false);
    }
  }, [notify]);

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


  const [latexContent, setLatexContent] = useState("");

  const refreshPending = useCallback(async (explicitDBName?: string) => {
    const dbName = explicitDBName || getDBName();
    const all = await getAllPending(dbName);
    setPendingChanges(all);
  }, [getDBName]);

  const handleContentChange = useCallback(async (changedPath: string, latex: string, tiptapContent: string, info: { title: string; author: string; phase: string }) => {
    setLatexContent(latex);
    const entryId = changedPath.split('/').pop()?.replace('.json', '') || "";

    setOpenFile(prev => {
      if (prev && prev.path === changedPath) {
        return { ...prev, rawLatex: latex, tiptapContent, updatedAt: isoTimestamp() };
      }
      return prev;
    });

    setSavingPaths(prev => new Set(prev).add(changedPath));

    const parseContent = (raw: unknown): TipTapNode | string => {
      if (!raw) return "";
      if (typeof raw === 'object') return (raw as unknown) as TipTapNode;
      if (typeof raw !== 'string') return raw as string;
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'string') return parseContent(parsed);
        return parsed;
      } catch { return raw; }
    };

    const contentObj = parseContent(tiptapContent);
    const resources = (contentObj && typeof contentObj === 'object') ? extractResources(contentObj) : {};
    const references = (contentObj && typeof contentObj === 'object') ? extractReferences(contentObj) : [];

    if (info.author) localStorage.setItem("nb-last-author", info.author);

    let assetsToSave: { path: string; base64: string }[] = [];
    let finalDoc = contentObj;

    if (contentObj) {
      try {
        const { cleanDoc, newAssets } = await dehydrateAssets(contentObj as TipTapNode);
        assetsToSave = newAssets;
        finalDoc = cleanDoc;
      } catch (e) {
        console.error("Failed to dehydrate assets", e);
      }
    }

    try {
      const entryJsonObj = { version: 3, content: finalDoc };
      const entryJsonStr = JSON.stringify(entryJsonObj, null, 2);

      for (const asset of assetsToSave) {
        const assetPath = workspaceMode === "github" && config?.baseDir ? `${getGitBasePrefix()}${asset.path}` : asset.path;
        await uploadResource(assetPath, asset.base64, `Asset: ${asset.path.split('/').pop()}`);
        if (workspaceMode === "github") {
          await putResource(getDBName(), { path: assetPath, dataUrl: `data:image/*;base64,${asset.base64}` });
        }
      }

      if (lastSavedContentsRef.current.get(changedPath) !== entryJsonStr) {
        await saveEntry(changedPath, entryJsonStr, `Auto-save: ${info.title}`);
        lastSavedContentsRef.current.set(changedPath, entryJsonStr);
      }

      const latexPath = `${currentLatexDir}/${entryId}.tex`;
      if (lastSavedContentsRef.current.get(latexPath) !== latex) {
        await saveEntry(latexPath, latex, `Generate LaTeX: ${info.title}`);
        lastSavedContentsRef.current.set(latexPath, latex);
      }

      // Merge content-derived fields into the current browser state.
      // The Editor owns title/author/phase/isValid via immediate sync —
      // auto-save only updates resources, references, and timestamps.
      // No re-validation here; validateNotebookIntegrity runs on load/create/delete/commit.
      let finalMeta: NotebookMetadata | null = null;
      setNotebookMetadata(prev => {
        const existingEntry = prev.entries[entryId];
        const mergedEntry: EntryMetadata = {
          // Start with whatever the browser state already has (from immediate sync)
          ...existingEntry,
          // Ensure core identity fields exist
          id: entryId,
          filename: changedPath,
          createdAt: existingEntry?.createdAt || isoTimestamp(),
          // Fall back to save callback values only if entry doesn't exist yet
          title: existingEntry?.title ?? info.title,
          author: existingEntry?.author ?? info.author,
          phase: existingEntry?.phase ?? info.phase,
          // Content-derived fields from this save
          updatedAt: isoTimestamp(),
          resources,
          references,
        };
        const updated = {
          ...prev,
          entries: { ...prev.entries, [entryId]: mergedEntry }
        };
        if (currentProjectId && !updated.projectId) {
          updated.projectId = currentProjectId;
          const p = projects.find(pr => pr.id === currentProjectId);
          if (p) updated.projectName = p.name;
        }
        finalMeta = updated;
        return updated;
      });

      if (finalMeta) await saveMetadata(finalMeta, "Auto-save metadata");
      if (workspaceMode === "github") refreshPending();
    } finally {
      setSavingPaths(prev => {
        const next = new Set(prev);
        next.delete(changedPath);
        return next;
      });
    }
  }, [workspaceMode, currentProjectId, projects, config, getGitBasePrefix, currentLatexDir, saveEntry, saveMetadata, uploadResource, refreshPending, setNotebookMetadata, getDBName]);

  const handleMetadataChange = useCallback(async (entryId: string, updates: Partial<EntryMetadata>) => {
    let finalMeta: NotebookMetadata | null = null;
    setNotebookMetadata(prev => {
      const existing = prev.entries[entryId];
      if (!existing) return prev;
      const updatedEntry = { ...existing, ...updates, updatedAt: isoTimestamp() };
      const next = { ...prev, entries: { ...prev.entries, [entryId]: updatedEntry } };
      const validated = validateNotebookIntegrity(next);
      finalMeta = validated;
      return validated;
    });

    setOpenFile(prev => {
      if (prev?.id === entryId) {
        return { ...prev, ...updates, updatedAt: isoTimestamp() };
      }
      return prev;
    });

    if (finalMeta) {
      await saveMetadata(finalMeta);
      if (workspaceMode === "github") refreshPending();
    }
  }, [saveMetadata, workspaceMode, refreshPending, setNotebookMetadata, setOpenFile]);

  const handleValidationChange = useCallback((isValid: boolean) => {
    if (!openFile) return;
    setNotebookMetadata(prev => {
      const entry = prev.entries[openFile.id];
      if (!entry || entry.isValid === isValid) return prev;
      return {
        ...prev,
        entries: { ...prev.entries, [openFile.id]: { ...entry, isValid } }
      };
    });
  }, [openFile, setNotebookMetadata]);

  const handleNewEntry = useCallback(async () => {
    const createdAt = isoTimestamp();
    const entryId = generateUUID();
    const filename = `${entryId}.json`;
    const entriesDir = (workspaceMode === "github" && config) ? config.entriesDir : ENTRIES_DIR;
    const path = `${entriesDir}/${filename}`;

    const defaultTitle = "";
    const defaultAuthor = localStorage.getItem("nb-last-author") || "";

    const entryMeta: EntryMetadata = {
      id: entryId, title: defaultTitle, author: defaultAuthor, phase: "",
      createdAt, updatedAt: createdAt, filename: path, resources: {}
    };

    const wrapper = { version: 3, content: { type: "doc", content: [{ type: "paragraph" }] } };
    const jsonStr = JSON.stringify(wrapper, null, 2);
    const initialLatex = `\\notebookentry{${defaultTitle}}{${createdAt.split('T')[0]}}{${defaultAuthor}}{}\n\\label{${entryId}}\n\n`;

    const newMetadata = updateEntryInIndex(notebookMetadata, entryId, entryMeta);

    setOpenFile({
      path, name: filename, id: entryId, viewMode: "entry",
      rawLatex: initialLatex, tiptapContent: JSON.stringify(wrapper.content),
      title: defaultTitle, author: defaultAuthor, phase: "",
      metadataMissing: false, createdAt, updatedAt: createdAt, lastOpenedAt: createdAt, isLegacyRaw: false,
    });
    setLatexContent(initialLatex);
    setEntries(prev => [{ name: filename, path }, ...prev]);
    setNotebookMetadata(newMetadata);

    const params = new URLSearchParams(window.location.search);
    params.set('entry', entryId);
    params.delete('resource');
    window.history.pushState({}, '', `?${params.toString()}`);
    window.dispatchEvent(new Event('locationchange'));

    setSavingPaths(prev => new Set(prev).add(path));
    try {
      await saveEntry(path, jsonStr, "New entry");
      await saveEntry(`${currentLatexDir}/${entryId}.tex`, initialLatex, "Init LaTeX");
      await saveMetadata(newMetadata, "Update index for new entry");
      const allEntriesLatex = generateAllEntriesLatex(newMetadata);
      await saveEntry(currentAllEntriesPath, allEntriesLatex, "Update all_entries.tex");
      if (workspaceMode === "github") refreshPending();
    } finally {
      setSavingPaths(prev => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
  }, [workspaceMode, config, saveEntry, saveMetadata, notebookMetadata, setEntries, setNotebookMetadata, currentLatexDir, currentAllEntriesPath, refreshPending]);

  const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);

  const handleSelectEntry = useCallback((file: ExplorerFile, multi: boolean, range: boolean, visiblePaths: string[]) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (range && lastSelectedPath && visiblePaths.includes(lastSelectedPath)) {
        // Find current order from visible paths
        const startIdx = visiblePaths.indexOf(lastSelectedPath);
        const endIdx = visiblePaths.indexOf(file.path);
        const min = Math.min(startIdx, endIdx);
        const max = Math.max(startIdx, endIdx);
        if (min !== -1 && max !== -1) {
          const rangePaths = visiblePaths.slice(min, max + 1);
          rangePaths.forEach(p => next.add(p));
        }
      } else if (multi) {
        if (next.has(file.path)) next.delete(file.path);
        else next.add(file.path);
      } else {
        next.clear();
        next.add(file.path);
      }
      setLastSelectedPath(file.path);
      return next;
    });
  }, [lastSelectedPath]);

  const handleOpenEntry = useCallback(async (file: ExplorerFile, silent: boolean = false) => {
    setIsLoading(true);
    setIsInitializing(true);
    if (isMobile) setUserSidebarPreference(false);
    setMobileTab("editor");

    try {
      const dbName = getDBName();
      let entryJsonStr = "";
      let latexStr = "";

      const entryId = file.name.replace('.json', '');
      const params = new URLSearchParams(window.location.search);
      if (params.get('entry') !== entryId) {
        params.set('entry', entryId);
        if (!silent) params.delete('resource');
        window.history.pushState({}, '', `?${params.toString()}`);
        window.dispatchEvent(new Event('locationchange'));
      }

      const stagedEntry = (await getAllPending(dbName)).find(p => p.path === file.path && p.operation === "upsert");
      if (stagedEntry?.content) entryJsonStr = stagedEntry.content;
      else if (workspaceMode === "local" && dirHandle) entryJsonStr = (await getLocalFileContent(dirHandle, file.path)).text || "";
      else if (workspaceMode === "github" && config) entryJsonStr = await fetchFileContent(config, file.path);

      if (!entryJsonStr) throw new Error("Entry not found");
      const rawData = JSON.parse(entryJsonStr);
      const content = rawData.content || rawData;

      const meta = notebookMetadataRef.current.entries[entryId];
      const title = meta?.title || "";
      const author = meta?.author || (typeof window !== "undefined" ? localStorage.getItem("nb-last-author") || "" : "");
      const phase = meta?.phase || "";
      const createdAt = meta?.createdAt || isoTimestamp();
      const updatedAt = meta?.updatedAt || createdAt;

      const latexPath = `${currentLatexDir}/${entryId}.tex`;
      const stagedLatex = (await getAllPending(dbName)).find(p => p.path === latexPath && p.operation === "upsert");
      if (stagedLatex?.content) latexStr = stagedLatex.content;
      else if (workspaceMode === "local" && dirHandle) {
        try { latexStr = (await getLocalFileContent(dirHandle, latexPath)).text || ""; } catch { /* ignore */ }
      } else if (workspaceMode === "github" && config) {
        try { latexStr = await fetchFileContent(config, latexPath); } catch { /* ignore */ }
      }

      // Seed the save cache with loaded values to prevent redundant auto-saves on mount
      const normalizedJson = JSON.stringify({ version: 3, content }, null, 2);
      lastSavedContentsRef.current.set(file.path, normalizedJson);
      lastSavedContentsRef.current.set(latexPath, latexStr);

      const assetCache = new Map<string, string>();
      const images = extractImagePaths(content);
      for (const imgPath of images) {
        const actualImgPath = workspaceMode === "github" && config?.baseDir ? `${getGitBasePrefix()}${imgPath}` : imgPath;
        const staged = (await getAllPending(dbName)).find(p => p.path === actualImgPath && p.operation === "upsert");
        if (staged?.content) assetCache.set(imgPath, staged.content.startsWith('data:') ? staged.content : `data:image/*;base64,${staged.content}`);
        else {
          const cached = await getResource(dbName, actualImgPath);
          if (cached) assetCache.set(imgPath, cached);
          else if (workspaceMode === "local" && dirHandle) {
            try {
              const res = await getLocalFileContent(dirHandle, imgPath);
              if (res.base64) assetCache.set(imgPath, res.base64);
            } catch { /* ignore */ }
          } else if (workspaceMode === "github" && config) {
            try {
              const base64 = await fetchRawFileContent(config, actualImgPath);
              const dataUrl = `data:image/*;base64,${base64}`;
              assetCache.set(imgPath, dataUrl);
              await putResource(dbName, { path: actualImgPath, dataUrl });
            } catch { /* ignore */ }
          }
        }
      }

      const hydratedContent = hydrateAssets(content, assetCache);
      setOpenFile({
        path: file.path, name: file.name, id: entryId, viewMode: "entry",
        rawLatex: latexStr, tiptapContent: JSON.stringify(hydratedContent),
        title, author, phase, metadataMissing: false,
        createdAt, updatedAt, lastOpenedAt: updatedAt, isLegacyRaw: false,
      });
      setLatexContent(latexStr);
      // Auto-select the opened entry exclusively
      setSelectedPaths(new Set([file.path]));
      setLastSelectedPath(file.path);
    } catch (e) {
      if (!silent) notify("Failed to open entry.", "error");
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [getDBName, workspaceMode, dirHandle, config, getGitBasePrefix, currentLatexDir, isMobile, notify, setIsLoading, setUserSidebarPreference, setMobileTab, setLatexContent]);

  const handleCloseEntry = useCallback((path?: string) => {
    if (path && openFile?.path !== path) return;
    setOpenFile(null);
    setLatexContent("");
    const params = new URLSearchParams(window.location.search);
    params.delete('entry');
    params.delete('resource');
    window.history.pushState({}, '', `?${params.toString()}`);
    window.dispatchEvent(new Event('locationchange'));
  }, [openFile, setOpenFile, setLatexContent]);

  const handleDownloadLatex = useCallback(async (file: ExplorerFile) => {
    try {
      const entryId = file.name.replace('.json', '');
      const latexPath = `${currentLatexDir}/${entryId}.tex`;
      let latex = "";
      const dbName = getDBName();
      const staged = (await getAllPending(dbName)).find(p => p.path === latexPath && p.operation === "upsert");
      if (staged?.content) latex = staged.content;
      else if (workspaceMode === "local" && dirHandle) {
        latex = (await getLocalFileContent(dirHandle, latexPath)).text || "";
      } else if (workspaceMode === "github" && config) {
        latex = await fetchFileContent(config, latexPath);
      }
      if (!latex) throw new Error("No LaTeX content found");
      const blob = new Blob([latex], { type: "application/x-latex" });
      saveAs(blob, `${entryId}.tex`);
    } catch {
      notify("Failed to download LaTeX.", "error");
    }
  }, [config, currentLatexDir, dirHandle, getDBName, workspaceMode, notify]);

  const handleDownloadJson = useCallback(async (file: ExplorerFile) => {
    try {
      const dbName = getDBName();
      const entryId = file.name.replace('.json', '');
      let contentStr = "";
      const staged = (await getAllPending(dbName)).find(p => p.path === file.path && p.operation === "upsert");
      if (staged?.content) contentStr = staged.content;
      else if (workspaceMode === "local" && dirHandle) contentStr = (await getLocalFileContent(dirHandle, file.path)).text || "";
      else if (workspaceMode === "github" && config) contentStr = await fetchFileContent(config, file.path);
      if (!contentStr) throw new Error("Entry content not found");

      const rawData = JSON.parse(contentStr);
      const meta = notebookMetadata.entries[entryId];
      const content = rawData.content || rawData;

      const assets: Record<string, string> = {};
      const images = extractImagePaths(content);
      for (const imgPath of images) {
        const actualPath = workspaceMode === "github" && config?.baseDir ? `${getGitBasePrefix()}${imgPath}` : imgPath;
        const stagedRes = (await getAllPending(dbName)).find(p => p.path === actualPath && p.operation === "upsert");
        if (stagedRes?.content) assets[imgPath] = stagedRes.content;
        else {
          const cached = await getResource(dbName, actualPath);
          if (cached) assets[imgPath] = cached;
        }
      }

      const portable = {
        version: 3,
        entries: { [entryId]: { ...meta, content } },
        assets
      };
      const blob = new Blob([JSON.stringify(portable, null, 2)], { type: "application/json" });
      saveAs(blob, `${entryId}.json`);
    } catch {
      notify("Failed to download JSON.", "error");
    }
  }, [config, dirHandle, getDBName, getGitBasePrefix, notebookMetadata, workspaceMode, notify]);

  const handleDownloadMulti = useCallback(async (files: ExplorerFile[]) => {
    try {
      setIsLoading(true);
      setIsInitializing(true);
      const dbName = getDBName();
      const entriesMap: Record<string, EntryMetadata & { content: TipTapNode }> = {};
      const allAssets: Record<string, string> = {};

      for (const file of files) {
        const entryId = file.name.replace('.json', '');
        let contentStr = "";
        const staged = (await getAllPending(dbName)).find(p => p.path === file.path && p.operation === "upsert");
        if (staged?.content) contentStr = staged.content;
        else if (workspaceMode === "local" && dirHandle) contentStr = (await getLocalFileContent(dirHandle, file.path)).text || "";
        else if (workspaceMode === "github" && config) contentStr = await fetchFileContent(config, file.path);
        if (!contentStr) continue;

        const rawData = JSON.parse(contentStr);
        const meta = notebookMetadata.entries[entryId];
        const content = rawData.content || rawData;

        const images = extractImagePaths(content);
        for (const imgPath of images) {
          const actualPath = workspaceMode === "github" && config?.baseDir ? `${getGitBasePrefix()}${imgPath}` : imgPath;
          const stagedRes = (await getAllPending(dbName)).find(p => p.path === actualPath && p.operation === "upsert");
          if (stagedRes?.content) allAssets[imgPath] = stagedRes.content;
          else {
            const cached = await getResource(dbName, actualPath);
            if (cached) allAssets[imgPath] = cached;
          }
        }
        entriesMap[entryId] = { ...meta, content };
      }

      const portable = { version: 3, entries: entriesMap, assets: allAssets };
      const blob = new Blob([JSON.stringify(portable, null, 2)], { type: "application/json" });
      saveAs(blob, `notebook_export_${isoTimestamp().replace(/[:.]/g, '-')}.json`);
      notify(`Exported ${Object.keys(entriesMap).length} entries.`, "success");
    } catch {
      notify("Failed to export entries.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [config, dirHandle, getDBName, getGitBasePrefix, notebookMetadata, workspaceMode, notify, setIsLoading]);

  const handleDeleteMulti = useCallback(async (files: ExplorerFile[]) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Multiple Entries",
      message: `Are you sure you want to delete ${files.length} entries? This action cannot be undone.`,
      variant: "danger",
      onConfirm: async () => {
        setIsLoading(true);
        setIsInitializing(true);
        try {
          let currentMeta = notebookMetadataRef.current;
          for (const file of files) {
            const entryId = file.path.split('/').pop()?.replace('.json', '') || "";
            currentMeta = removeEntryFromMetadata(currentMeta, entryId);
            await deleteFile(file.path, "Entry deleted (bulk)");
            await deleteFile(`${currentLatexDir}/${entryId}.tex`, "LaTeX deleted (bulk)");
          }
          setNotebookMetadata(currentMeta);
          await saveMetadata(currentMeta, "Metadata update (bulk deletion)");
          const allEntriesLatex = generateAllEntriesLatex(currentMeta);
          await saveEntry(currentAllEntriesPath, allEntriesLatex, "Update all_entries.tex");

          const deletedPaths = new Set(files.map(f => f.path));
          setEntries(prev => prev.filter(e => !deletedPaths.has(e.path)));
          setSelectedPaths(prev => {
            const next = new Set(prev);
            deletedPaths.forEach(p => next.delete(p));
            return next;
          });
          if (workspaceMode === "github") refreshPending();
          notify(`Deleted ${files.length} entries.`, "success");
        } catch {
          notify("Failed to delete entries.", "error");
        } finally {
          setIsLoading(false);
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  }, [currentAllEntriesPath, currentLatexDir, saveEntry, saveMetadata, workspaceMode, notify, setEntries, refreshPending, deleteFile, setIsLoading, setNotebookMetadata]);


  // Refs for state that handleUrlChange reads but should NOT trigger re-runs
  const openFileRef = useRef(openFile);
  const targetResourceRef = useRef(targetResourceId);
  useEffect(() => { openFileRef.current = openFile; }, [openFile]);
  useEffect(() => { targetResourceRef.current = targetResourceId; }, [targetResourceId]);

  useEffect(() => {
    let active = true;
    const handleUrlChange = async () => {
      const params = new URLSearchParams(window.location.search);
      const entryId = params.get('entry');
      const resourceId = params.get('resource');
      const projectId = params.get('project');

      if (projectId && projectId !== currentProjectId) {
        setIsInitializing(true);
        setIsLoading(true);
        const p = await getProject(projectId);
        if (!active) return;
        if (p) {
          const dbName = `notebook-project-${p.id}`;
          setCurrentProjectId(p.id);
          setNotebookMetadata({ ...EMPTY_METADATA, projectId: p.id, projectName: p.name });
          void refreshPending(dbName);
          if (p.type === "github" && p.githubConfig) {
            setConfig({
              token: githubToken || "",
              owner: p.githubConfig.owner, repo: p.githubConfig.repo, branch: p.githubConfig.branch, baseDir: p.githubConfig.folderPath,
              entriesDir: p.githubConfig.folderPath ? `${p.githubConfig.folderPath}/${ENTRIES_DIR}` : ENTRIES_DIR,
              resourcesDir: p.githubConfig.folderPath ? `${p.githubConfig.folderPath}/${ASSETS_DIR}` : ASSETS_DIR,
            });
            setWorkspaceMode("github");
            void loadGitHubExplorer();
            deleteProjectDatabase("notebook-volatile").catch(() => { });
          } else if (p.type === "local") {
            const handle = await getProjectHandle(p.id);
            if (handle) {
              setDirHandle(handle);
              setWorkspaceMode("local");
              await checkPermission(handle);
              void loadLocalExplorer();
              deleteProjectDatabase("notebook-volatile").catch(() => { });
            } else {
              setWorkspaceMode("none");
              setCurrentProjectId(null);
            }
          } else if (p.type === "temporary") {
            setWorkspaceMode("temporary");
          }
        } else if (projectId === "temporary") {
          setCurrentProjectId("temporary");
          setWorkspaceMode("temporary");
          setNotebookMetadata({ ...EMPTY_METADATA, projectId: "temporary", projectName: "Temporary Workspace" });
          void refreshPending("notebook-project-temporary");
        } else {
          notify("Project not found.", "error");
          setCurrentProjectId(null);
          setWorkspaceMode("none");
          const params = new URLSearchParams(window.location.search);
          params.delete('project');
          window.history.pushState({}, '', `?${params.toString()}`);
        }
      }

      // Read volatile state from refs to avoid stale closures without adding deps
      const currentOpenFile = openFileRef.current;
      const currentMeta = notebookMetadataRef.current;
      const currentTargetResource = targetResourceRef.current;

      if (projectId && !workspaceMode) return;
      if (resourceId !== currentTargetResource) setTargetResourceId(resourceId);

      if (entryId && entryId !== currentOpenFile?.id) {
        if (currentMeta === EMPTY_METADATA) return;
        if (currentMeta.entries[entryId]) {
          const entriesDir = (workspaceMode === "github" && config) ? config.entriesDir : ENTRIES_DIR;
          handleOpenEntry({ name: `${entryId}.json`, path: `${entriesDir}/${entryId}.json` }, true).catch(() => {
            setOpenFile(null);
            const params = new URLSearchParams(window.location.search);
            params.delete('entry');
            params.delete('resource');
            window.history.replaceState({}, '', `?${params.toString()}`);
            window.dispatchEvent(new Event('locationchange'));
          });
        } else if (!isLoading) {
          setOpenFile(null);
          const params = new URLSearchParams(window.location.search);
          params.delete('entry');
          params.delete('resource');
          window.history.replaceState({}, '', `?${params.toString()}`);
          window.dispatchEvent(new Event('locationchange'));
        }
      } else if (!entryId && currentOpenFile) setOpenFile(null);

      if (active) {
        const projectMatches = projectId === currentProjectId;
        const configReady = workspaceMode === "github" ? !!config : (workspaceMode === "local" ? !!dirHandle : true);
        const metaReady = workspaceMode === "temporary" ? true : (currentMeta.projectId === projectId || Object.keys(currentMeta.entries).length > 0);

        const isOpeningEntry = entryId && entryId !== currentOpenFile?.id && !!currentMeta.entries[entryId];

        const isSettleable = projectId
          ? (projectMatches && !isLoading && !!workspaceMode && configReady && metaReady && !isOpeningEntry)
          : (!isLoading && !currentProjectId);

        if (isSettleable) {
          setIsInitializing(false);
          void refreshProjectList();
        }
      }
    };

    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('locationchange', handleUrlChange);
    handleUrlChange();
    return () => { active = false; window.removeEventListener('popstate', handleUrlChange); window.removeEventListener('locationchange', handleUrlChange); };
  }, [handleOpenEntry, githubToken, setConfig, setDirHandle, setWorkspaceMode, refreshPending, refreshProjectList, setCurrentProjectId, setIsLoading, setNotebookMetadata, loadGitHubExplorer, loadLocalExplorer, currentProjectId, workspaceMode, dirHandle, config, isLoading, notify]);

  const handleDiscardAll = async () => {
    const dbName = getDBName();
    showConfirm("Discard Changes?", "Are you sure? This cannot be undone.", async () => {
      setIsInitializing(true);
      setIsLoading(true);
      await clearAllPending(dbName);
      await refreshPending();
      notify("Discarded.", "success");
      if (openFile) {
        const entriesDir = (workspaceMode === "github" && config) ? config.entriesDir : ENTRIES_DIR;
        handleOpenEntry({ name: `${openFile.id}.json`, path: `${entriesDir}/${openFile.id}.json` }, true).catch(() => setOpenFile(null));
      }
      if (workspaceMode === "github") await loadGitHubExplorer();
      else if (workspaceMode === "local") await loadLocalExplorer();
    });
  };

  const processImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const rawData = JSON.parse(text);

      setIsLoading(true);
      setIsInitializing(true);

      const entriesToImport = rawData.entries || {};
      const assetsToImport = rawData.assets || {};
      const entryList = Object.values(entriesToImport) as (EntryMetadata & { content: TipTapNode })[];

      const globalIdMap = new Map<string, string>();
      // Pre-populate global map with new IDs for all entries being imported
      for (const item of entryList) {
        const oldId = (item as { id?: string }).id;
        if (oldId) globalIdMap.set(oldId, generateUUID());
      }

      const importSingle = async (data: EntryMetadata & { content: TipTapNode }, globalAssets: Record<string, string> = {}) => {
        if (data.content === undefined) return;
        const { content: originalContent, ...info } = data;
        const oldEntryId = info.id;
        const newId = globalIdMap.get(oldEntryId) || generateUUID();
        const path = (workspaceMode === "github" && config) ? `${config.entriesDir}/${newId}.json` : `${ENTRIES_DIR}/${newId}.json`;

        // 1. Remap all internal IDs and references
        const { doc: remappedDoc } = remapContentIds(originalContent, globalIdMap);

        // 2. Dehydrate assets (images)
        const { cleanDoc, newAssets } = await dehydrateAssets(remappedDoc);

        // Match images from the document to provided assets in the export
        const images = extractImagePaths(cleanDoc);
        for (const imgPath of images) {
          if (globalAssets[imgPath]) {
            newAssets.push({ path: imgPath, base64: globalAssets[imgPath] });
          }
        }

        const jsonStr = JSON.stringify({ version: 3, content: cleanDoc }, null, 2);
        const newEntryMeta: EntryMetadata = {
          ...info,
          id: newId,
          filename: path,
          // Remap references array
          references: (info.references || []).map((rId: string) => globalIdMap.get(rId) || rId),
          // Extract new resources map from remapped doc
          resources: extractResources(cleanDoc)
        };
        newEntryMeta.isValid = isEntryValid(newEntryMeta);

        if (workspaceMode === "local" && dirHandle) {
          for (const asset of newAssets) await writeLocalFile(dirHandle, asset.path, asset.base64, true);
          await writeLocalFile(dirHandle, path, jsonStr);
          const latex = generateEntryLatex(JSON.stringify(cleanDoc), newEntryMeta.title, newEntryMeta.author, newEntryMeta.phase, newEntryMeta.createdAt, newId);
          await writeLocalFile(dirHandle, `${LATEX_DIR}/${newId}.tex`, latex);
          const updatedMeta = updateEntryInIndex(notebookMetadataRef.current, newId, newEntryMeta);
          setNotebookMetadata(updatedMeta);
          const allEntriesLatex = generateAllEntriesLatex(updatedMeta);
          await writeLocalFile(dirHandle, ALL_ENTRIES_PATH, allEntriesLatex);
        } else {
          const dbName = getDBName();
          for (const asset of newAssets) {
            const actualPath = workspaceMode === "github" && config?.baseDir ? `${getGitBasePrefix()}${asset.path}` : asset.path;
            await stageChange(dbName, { path: actualPath, operation: "upsert", content: asset.base64, label: `Import asset`, stagedAt: isoTimestamp() });
            await putResource(dbName, { path: actualPath, dataUrl: asset.base64.startsWith('data:') ? asset.base64 : `data:image/*;base64,${asset.base64}` });
          }
          await stage({ path, content: jsonStr, operation: "upsert", label: "Import entry" });
          const latex = generateEntryLatex(JSON.stringify(cleanDoc), newEntryMeta.title, newEntryMeta.author, newEntryMeta.phase, newEntryMeta.createdAt, newId);
          await stage({ path: `${currentLatexDir}/${newId}.tex`, content: latex, operation: "upsert", label: "Import LaTeX" });
          const updatedMeta = updateEntryInIndex(notebookMetadataRef.current, newId, newEntryMeta);
          await stage({ path: currentIndexPath, content: JSON.stringify(updatedMeta, null, 2), operation: "upsert", label: "Update index" });
          const allEntriesLatex = generateAllEntriesLatex(updatedMeta);
          await stage({ path: currentAllEntriesPath, content: allEntriesLatex, operation: "upsert", label: "Update all_entries.tex" });
          setNotebookMetadata(updatedMeta);
        }
      };

      if (entryList.length > 0) {
        for (const item of entryList) await importSingle(item, assetsToImport);
        notify(`Imported ${entryList.length} entries.`, "success");
      } else {
        notify("No entries found in file.", "error");
      }

      if (workspaceMode === "local") await loadLocalExplorer();
      else {
        await refreshPending();
        if (workspaceMode === "github") await loadGitHubExplorer();
      }
    } catch (e) {
      console.error(e);
      notify("Import failed.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUploaded = async (imagePath: string, base64: string) => {
    const dbName = getDBName();
    const actualImgPath = workspaceMode === "github" && config?.baseDir ? `${getGitBasePrefix()}${imagePath}` : imagePath;
    await putResource(dbName, { path: actualImgPath, dataUrl: `data:image/*;base64,${base64}` });
    await uploadResource(actualImgPath, base64, "Image upload");
    if (workspaceMode === "github") refreshPending();
  };

  const handleDeleteEntry = async (file: ExplorerFile) => {
    setIsInitializing(true);
    setIsLoading(true);
    try {
      const entryId = file.path.split('/').pop()?.replace('.json', '') || "";
      const updatedMeta = removeEntryFromMetadata(notebookMetadata, entryId);
      setNotebookMetadata(updatedMeta);
      await deleteFile(file.path, "Entry deleted");
      await deleteFile(`${currentLatexDir}/${entryId}.tex`, "LaTeX deleted");
      await saveMetadata(updatedMeta, "Metadata update (entry deleted)");
      const allEntriesLatex = generateAllEntriesLatex(updatedMeta);
      await saveEntry(currentAllEntriesPath, allEntriesLatex, "Update all_entries.tex");
      setEntries(prev => prev.filter(e => e.path !== file.path));
      setSelectedPaths(prev => {
        const next = new Set(prev);
        next.delete(file.path);
        return next;
      });
      if (workspaceMode === "github") refreshPending();
      if (openFile?.path === file.path) {
        setOpenFile(null);
        setLatexContent("");
        const params = new URLSearchParams(window.location.search);
        params.delete('entry');
        params.delete('resource');
        window.history.pushState({}, '', `?${params.toString()}`);
        window.dispatchEvent(new Event('locationchange'));
      }
    } finally {
      setIsLoading(false);
    }
  };


  const handleDownloadPortable = async (filename: string, content: string, info: { title: string; author: string; phase: string, createdAt: string, updatedAt?: string }) => {
    try {
      const parsed = JSON.parse(content);
      const dbName = getDBName();
      const assetCache = new Map<string, string>();
      const images = extractImagePaths(parsed);
      for (const imgPath of images) {
        const staged = (await getAllPending(dbName)).find(p => p.path === imgPath && p.operation === "upsert");
        if (staged?.content) assetCache.set(imgPath, staged.content.startsWith('data:') ? staged.content : `data:image/*;base64,${staged.content}`);
        else {
          const cached = await getResource(dbName, imgPath);
          if (cached) assetCache.set(imgPath, cached);
          else if (workspaceMode === "local" && dirHandle) {
            try {
              const res = await getLocalFileContent(dirHandle, imgPath);
              if (res.base64) assetCache.set(imgPath, res.base64);
            } catch { /* ignore */ }
          }
        }
      }
      const wrapper: EntryWrapper = {
        version: 2,
        metadata: { id: openFile?.id || "entry", filename, resources: {}, updatedAt: info.updatedAt || info.createdAt, ...info },
        content: hydrateAssets(parsed, assetCache)
      };
      const cleanFilename = (info.title || "entry").replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json";
      saveAs(new Blob([JSON.stringify(wrapper, null, 2)], { type: "application/json" }), cleanFilename);
      notify("Exported successfully.", "success");
    } catch (e) { console.error(e); notify("Export failed.", "error"); }
  };

  const handleCommitAll = useCallback(async () => {
    if (!config || isCommitting) return;
    setIsCommitting(true);
    setIsInitializing(true);
    try {
      const dbName = getDBName();
      const all = await getAllPending(dbName);
      const gitChanges: GitChange[] = all.map(change => ({
        path: change.path,
        content: change.operation === "delete" ? null : (change.content?.startsWith("data:") ? change.content.split(",")[1] : (change.content ?? "")),
        isBinary: change.path.includes("resources/") || /\.(png|jpg|jpeg|gif|webp|pdf)$/i.test(change.path)
      }));
      await commitChanges(config, gitChanges, `Update notebook: ${all.length} changes`);
      await loadGitHubExplorer();
      await clearAllPending(dbName);
      await refreshPending();
      notify("Committed to GitHub.", "success");
    } catch { notify("Commit failed.", "error"); }
    finally { setIsCommitting(false); setIsLoading(false); }
  }, [config, isCommitting, getDBName, loadGitHubExplorer, refreshPending, notify, setIsLoading]);

  const handleSelectProject = async (id: string) => {
    setIsInitializing(true);
    setIsLoading(true);
    const p = await getProject(id);
    if (p) {
      p.lastOpened = isoTimestamp();
      await saveProject(p);
      await refreshProjectList();
      setNotebookMetadata({ ...EMPTY_METADATA, projectId: p.id, projectName: p.name });
      const params = new URLSearchParams(window.location.search);
      params.set('project', p.id);
      window.history.pushState({}, '', `?${params.toString()}`);
      window.dispatchEvent(new Event('locationchange'));
    } else notify("Project not found.", "error");
  };

  const handleDeleteProject = async (id: string) => {
    const p = await getProject(id);
    if (!p) return;
    showConfirm("Delete Project?", `Delete "${p.name}"?`, async () => {
      await deleteProject(id);
      await deleteProjectHandle(id);
      await deleteProjectDatabase(getProjectDBName(p));
      await refreshProjectList();
      if (currentProjectId === id) handleDisconnect();
    });
  };

  const handleRenameProject = async (id: string, name: string) => {
    const p = await getProject(id);
    if (p) { p.name = name; await saveProject(p); await refreshProjectList(); }
  };

  const handleCreateGithub = async (githubConfig: GitHubConfig) => {
    setIsInitializing(true);
    setIsLoading(true);
    const fullHash = await hashContent(`github:${githubConfig.owner.toLowerCase()}/${githubConfig.repo.toLowerCase()}`);
    const id = fullHash.slice(0, 32);
    const p: Project = {
      id, name: `${githubConfig.owner}/${githubConfig.repo}`, type: "github", lastOpened: isoTimestamp(),
      githubConfig: { owner: githubConfig.owner, repo: githubConfig.repo, branch: githubConfig.branch, folderPath: githubConfig.baseDir }
    };
    await saveProject(p);
    await refreshProjectList();
    const params = new URLSearchParams(window.location.search);
    params.set('project', id);
    window.history.pushState({}, '', `?${params.toString()}`);
    window.dispatchEvent(new Event('locationchange'));
  };

  const handleCreateLocal = async (handle: FileSystemDirectoryHandle) => {
    setIsInitializing(true);
    try { await handle.requestPermission({ mode: "readwrite" }); } catch { }
    let existingMeta: NotebookMetadata | null = null;
    try {
      const data = await getLocalFileContent(handle, INDEX_PATH);
      if (data && !data.isImage && data.text) existingMeta = JSON.parse(data.text);
    } catch { }
    let id = existingMeta?.projectId;
    const name = existingMeta?.projectName || handle.name;
    if (id) {
      const p = await getProject(id);
      if (p && p.type === "local") return handleSelectProject(id);
    }
    const fullHash = await hashContent(`local:${handle.name}`);
    id = fullHash.slice(0, 32);
    const p: Project = { id, name, type: "local", lastOpened: isoTimestamp(), folderName: handle.name };
    await saveProject(p);
    await saveProjectHandle(id, handle);
    const meta = existingMeta || { ...EMPTY_METADATA };
    if (!meta.projectId || !meta.projectName) {
      meta.projectId = id; meta.projectName = name;
      await writeLocalFile(handle, INDEX_PATH, JSON.stringify(meta, null, 2));
    }
    // Ensure base directories exist
    await ensureLocalDirectory(handle, ENTRIES_DIR);
    await ensureLocalDirectory(handle, ASSETS_DIR);
    await ensureLocalDirectory(handle, LATEX_DIR);

    await refreshProjectList();
    const params = new URLSearchParams(window.location.search);
    params.set('project', id);
    window.history.pushState({}, '', `?${params.toString()}`);
    window.dispatchEvent(new Event('locationchange'));
  };
  const handleCreateTemporary = async () => {
    setIsInitializing(true);
    const params = new URLSearchParams(window.location.search);
    params.set('project', 'temporary');
    window.history.pushState({}, '', `?${params.toString()}`);
    window.dispatchEvent(new Event('locationchange'));
  };

  const handleDisconnect = () => {
    const run = () => {
      const params = new URLSearchParams(window.location.search);
      params.delete('project'); params.delete('entry'); params.delete('resource');
      window.history.pushState({}, '', `?${params.toString()}`);
      window.dispatchEvent(new Event('locationchange'));
      performDisconnect();
      setOpenFile(null);
      setLatexContent("");
      refreshProjectList();
    };
    if (workspaceMode === "temporary") {
      showConfirm("Leave?", "Lose unsaved changes?", () => run(), "warning");
    } else run();
  };

  // Removed early return for isInitializing to use as overlay instead

  const currentProject = projects.find(p => p.id === currentProjectId);
  const workspaceLabel = workspaceMode === "github" ? `${config?.owner}/${config?.repo}` : (workspaceMode === "local" ? (currentProject?.name ?? "Local Folder") : "Memory");
  const appConfig = config ?? { owner: "Local", repo: "Workspace", token: "", entriesDir: ENTRIES_DIR, resourcesDir: ASSETS_DIR };

  const sidebar = (
    <div className="flex flex-col h-full overflow-hidden bg-nb-surface-low">
      <div className="flex items-center gap-3 px-4 h-14 border-b border-nb-outline-variant shrink-0 bg-nb-surface">
        <div className="w-6 h-6 rounded-md bg-nb-primary flex items-center justify-center shadow-sm shadow-nb-primary/20">
          <BookOpen size={14} className="text-white" />
        </div>
        <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-nb-on-surface truncate">Notebook</p></div>
        <div className="flex items-center gap-1">
          <button onClick={handleDisconnect} title="Switch Workspace" className="p-1.5 cursor-pointer rounded-lg hover:bg-nb-surface-low text-nb-on-surface-variant hover:text-nb-on-surface transition-colors"><ArrowLeftRight size={16} /></button>
          {isMobile && <button onClick={() => setUserSidebarPreference(false)} className="p-1.5 cursor-pointer rounded-lg hover:bg-nb-surface-low text-nb-on-surface-variant transition-colors"><X size={18} /></button>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <Sidebar
          entries={entries}
          openFile={openFile}
          selectedPaths={selectedPaths}
          notebookMetadata={notebookMetadata}
          pendingChanges={pendingChanges}
          onSelectEntry={handleSelectEntry}
          onOpenEntry={handleOpenEntry}
          onCloseEntry={handleCloseEntry}
          onDownloadLatex={handleDownloadLatex}
          onDownloadJson={handleDownloadJson}
          onDeleteEntry={handleDeleteEntry}
          onDownloadMulti={handleDownloadMulti}
          onDeleteMulti={handleDeleteMulti}
          onNewEntry={handleNewEntry}
        />
      </div>
      <div className="p-4 bg-nb-surface border-t border-nb-outline-variant">
        <PendingChangesPanel pendingChanges={pendingChanges} isCommitting={isCommitting} onCommit={handleCommitAll} onDiscard={handleDiscardAll} workspaceMode={workspaceMode} />
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`} />
            <span className="text-[9px] font-bold tracking-widest text-nb-on-surface-variant uppercase">{isLoading ? 'Syncing' : 'Connected'}</span>
          </div>
          <span className="text-[9px] font-mono text-nb-on-surface-variant/40 truncate max-w-[120px]">{workspaceLabel}</span>
        </div>
      </div>
    </div>
  );

  const main = (
    <div className="flex flex-col h-full overflow-hidden">
      <ProjectHeader
        currentProject={currentProject || (currentProjectId === "temporary" ? { id: "temporary", name: "Temporary Workspace" } : null)}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setUserSidebarPreference(!isSidebarOpen)}
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
        isEntryOpen={openFile !== null}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setTheme(isDarkMode ? "light" : "dark")}
        mounted={mounted}
      />

      <div className="flex-1 overflow-hidden relative bg-nb-bg">
        {(isConnectingLocal || (needsPermission && workspaceMode === "local")) && (
          <div className="absolute inset-0 z-[200] bg-nb-bg/80 backdrop-blur-md flex items-center justify-center p-8">
            <div className="max-w-md w-full bg-nb-surface border border-nb-outline-variant rounded-3xl p-8 shadow-2xl text-center animate-in fade-in zoom-in duration-300">
              <div className="w-20 h-20 rounded-2xl bg-nb-primary/10 text-nb-primary flex items-center justify-center mx-auto mb-8"><HardDrive size={40} /></div>
              <h2 className="text-2xl font-bold text-nb-on-surface mb-4">Connect to Workspace</h2>
              <p className="text-sm text-nb-on-surface-variant mb-10 leading-relaxed px-4">Browser needs permission to access <strong>{dirHandle?.name || "the local folder"}</strong>.</p>
              <div className="flex flex-col gap-3">
                <button onClick={requestPermission} className="w-full bg-nb-primary hover:bg-nb-primary-dim text-white font-bold py-4 rounded-xl shadow-lg shadow-nb-primary/20 transition-all active:scale-[0.98]">Grant Access</button>
                <button onClick={() => { setIsConnectingLocal(false); setCurrentProjectId(null); }} className="w-full bg-nb-surface-low text-nb-on-surface-variant hover:text-nb-on-surface font-bold py-4 rounded-xl transition-all">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {openFile === null ? (
          !isConnectingLocal && (
            <WelcomePage workspace={{ mode: workspaceMode as "local" | "github" | "temporary", label: workspaceLabel }} onNewEntry={handleNewEntry} onImportEntry={() => importEntryInputRef.current?.click()} onDisconnect={handleDisconnect} onOpenSidebar={() => setUserSidebarPreference(true)} />
          )
        ) : (
          <PanelGroup direction="horizontal" className="h-full" id="editor-preview-group">
            <Panel
              id="editor-panel" order={1} ref={editorPanelRef} collapsible={true} minSize={30}
              defaultSize={desktopViewMode === "editor" ? 100 : (desktopViewMode === "preview" ? 0 : 50)}
              onCollapse={() => { if (desktopViewMode !== "preview") setDesktopViewMode("preview"); }}
              onExpand={() => { if (desktopViewMode === "preview") setDesktopViewMode("split"); }}
              className={`flex flex-col h-full transition-all duration-300 ease-out ${desktopViewMode === "preview" ? "opacity-0 pointer-events-none" : "opacity-100"}`}
            >
              <Editor
                key={openFile.path} config={appConfig} isLocalMode={workspaceMode !== "github"}
                initialTitle={openFile.title} initialAuthor={openFile.author} initialPhase={openFile.phase}
                initialCreatedAt={openFile.createdAt} initialUpdatedAt={openFile.updatedAt} initialContent={openFile.tiptapContent}
                metadataMissing={openFile.metadataMissing} isValid={notebookMetadata.entries[openFile.id]?.isValid}
                onValidationChange={handleValidationChange} filename={openFile.path}
                onDeleted={(path) => handleDeleteEntry({ name: openFile.name, path })}
                onContentChange={handleContentChange}
                onTitleChange={(title) => handleMetadataChange(openFile.id, { title })}
                onAuthorChange={(author) => handleMetadataChange(openFile.id, { author })}
                onPhaseChange={(phase) => handleMetadataChange(openFile.id, { phase })}
                onImageUpload={handleImageUploaded} onDownloadPortable={handleDownloadPortable}
                onClose={() => {
                  const params = new URLSearchParams(window.location.search);
                  params.delete('entry'); params.delete('resource');
                  window.history.pushState({}, '', `?${params.toString()}`);
                  window.dispatchEvent(new Event('locationchange'));
                  setOpenFile(null);
                }}
                dbName={getDBName()} isSaving={savingPaths.has(openFile.path)} notebookMetadata={notebookMetadata} targetResourceId={targetResourceId}
              />
            </Panel>
            <PanelResizeHandle id="editor-preview-resizer" className={`w-1.5 bg-nb-surface-mid hover:bg-nb-tertiary/40 transition-colors ${desktopViewMode !== 'split' ? 'hidden' : ''}`} />
            <Panel
              id="preview-panel" order={2} ref={previewPanelRef} collapsible={true} minSize={30}
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
    <div className="flex flex-col h-screen w-full bg-nb-bg font-sans overflow-hidden">
      <input type="file" ref={importEntryInputRef} accept=".json" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; if (file) processImportFile(file); e.target.value = ""; }} />

      {activeWorkspaceMode === "none" ? (
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
          isExchangingGithubCode={isExchangingGithubCode}
          autoOpenGithubModal={isExchangingGithubCode}
          onSignOutGithub={() => { setGithubToken(null); setGithubUser(null); localStorage.removeItem("nb-github-token"); localStorage.removeItem("nb-github-user"); }}
        />
      ) : (
        isMobile ? (
          <div className="flex w-full h-full relative">
            <div className={`fixed inset-0 z-[150] transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
              <div className="absolute inset-0 bg-black/40" onClick={() => setUserSidebarPreference(false)} />
              <div className={`absolute top-0 bottom-0 left-0 w-[85%] max-w-[300px] bg-nb-surface-low border-r border-nb-outline-variant flex flex-col shadow-2xl transition-transform duration-300 ease-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                {sidebar}
              </div>
            </div>
            <div className="flex-1 w-full h-full">{main}</div>
          </div>
        ) : (
          <PanelGroup direction="horizontal" className="w-full h-full" id="main-layout-group">
            <Panel
              id="sidebar-panel" order={1} ref={sidebarPanelRef} defaultSize={20} minSize={15} maxSize={40} collapsible={true}
              onCollapse={() => setUserSidebarPreference(false)} onExpand={() => setUserSidebarPreference(true)}
              className="flex flex-col transition-all duration-300 ease-out"
            >
              <div className={`flex-1 flex flex-col transition-all duration-300 ease-out ${!isSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
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

      {isInitializing && (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center font-sans animate-in fade-in duration-300">
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
    </div>
  );
}
