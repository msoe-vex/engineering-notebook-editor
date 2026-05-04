"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import {
  GitHubConfig, fetchDirectoryTree, fetchFileContent, GitHubFile,
  saveFile, deleteFile as githubDeleteFile,
} from "@/lib/github";
import {
  stageChange, getAllPending, clearAllPending, removeStaged, PendingChange,
  putResource, getResource
} from "@/lib/db";
import {
  NotebookMetadata, EMPTY_METADATA, EntryMetadata, EntryWrapper,
  updateEntryInIndex, renameEntryInMetadata, removeEntryFromMetadata,
  updateMetadataSuggestions, dehydrateAssets, hydrateAssets,
} from "@/lib/metadata";
import Settings from "./Settings";
import Editor from "./Editor";
import Preview from "./Preview";
import WelcomePage from "./WelcomePage";
import FileExplorer, { ExplorerFile } from "./FileExplorer";
import ImagePreview from "./ImagePreview";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { GitBranch, HardDrive, ArrowLeftRight, GitCommitVertical, Loader2, Menu, Sun, Moon, X, BookOpen, Check, AlertTriangle } from "lucide-react";
import { ImperativePanelHandle } from "react-resizable-panels";
import { saveAs } from "file-saver";
import { generateUUID } from "@/lib/utils";
import { generateEntryLatex } from "@/lib/latex";
import { extractImagePaths, extractResources, migrateMetadata } from "@/lib/metadata";
import ReferenceSearch from "./ReferenceSearch";

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkspaceMode = "github" | "local" | "memory";
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
  // Raw latex: is it a legacy (no metadata) file?
  isLegacyRaw: boolean;
}

const ENTRIES_DIR = "entries";
const ASSETS_DIR = "assets";
const LATEX_DIR = "latex";
const INDEX_PATH = "notebook.json";

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
  const [config, setConfig] = useState<GitHubConfig | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [dirHandle, setDirHandle] = useState<any>(null);

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

  // Notifications
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  /** Get a unique DB name for the current workspace to isolate changes. */
  const getDBName = useCallback(() => {
    if (workspaceMode === "github" && config) {
      return `notebook-${config.owner}-${config.repo}`;
    }
    if (workspaceMode === "local" && dirHandle) {
      return `notebook-local-${dirHandle.name}`;
    }
    return "notebook-volatile";
  }, [workspaceMode, config, dirHandle]);

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
  const [mobileTab, setMobileTab] = useState<"editor" | "preview">("editor");
  const [desktopViewMode, setDesktopViewMode] = useState<"editor" | "split" | "preview">("editor");

  const editorPanelRef = useRef<ImperativePanelHandle>(null);
  const previewPanelRef = useRef<ImperativePanelHandle>(null);
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);

  useEffect(() => {
    if (!sidebarPanelRef.current) return;
    if (isSidebarOpen) {
      sidebarPanelRef.current.expand();
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

  useEffect(() => setMounted(true), []);
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

  // metadata.json contents
  const [notebookMetadata, setNotebookMetadata] = useState<NotebookMetadata>(EMPTY_METADATA);
  const notebookMetadataRef = useRef(notebookMetadata);
  useEffect(() => { notebookMetadataRef.current = notebookMetadata; }, [notebookMetadata]);

  // Latex preview content (kept in sync by Editor)
  const [latexContent, setLatexContent] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [styContent, setStyContent] = useState("");

  // ── Computed display lists ───────────────────────────────────────────────────

  const displayEntries = useMemo(() => {
    return entries.map(f => {
      const entryId = f.path.split('/').pop()?.replace('.json', '') || "";
      const m = notebookMetadata.entries?.[entryId];

      // Intelligent fallback for timestamp from ISO filename
      let finalTs = m?.createdAt || "";
      if (!finalTs) {
        // Filename is YYYY-MM-DDTHH-mm-ss-msZ_entry.tex
        const parts = f.name.split('_')[0].split('T');
        if (parts.length === 2) {
          const datePart = parts[0];
          const timePart = parts[1].replace(/-/g, ':').replace(/:([^:]*)$/, '.$1');
          try {
            const d = new Date(`${datePart}T${timePart}`);
            if (!isNaN(d.getTime())) finalTs = d.toISOString();
          } catch { /* ignore */ }
        } else if (f.name.match(/^\d{4}-\d{2}-\d{2}/)) {
          // Just a date
          finalTs = f.name.substring(0, 10) + "T00:00:00.000Z";
        }
      }
      if (!finalTs) finalTs = new Date().toISOString();

      // Use notebookMetadata (which is updated optimistically) or openFile as fallback
      const currentTitle = m?.title ?? (openFile?.path === f.path ? openFile.title : "") ?? "";
      const currentAuthor = m?.author ?? (openFile?.path === f.path ? openFile.author : "") ?? "";

      return {
        ...f,
        title: currentTitle || "Untitled Entry",
        author: currentAuthor,
        timestamp: finalTs,
        isSaving: savingPaths.has(f.path)
      };
    }).sort((a, b) => (b.timestamp || b.name).localeCompare(a.timestamp || a.name));
  }, [entries, notebookMetadata, openFile?.path, openFile?.title, openFile?.author, savingPaths]);

  const displayResources = useMemo(() => {
    return resources.sort((a, b) => a.name.localeCompare(b.name));
  }, [resources]);

  // ── Pending helpers ──────────────────────────────────────────────────────────

  const refreshPending = useCallback(async () => {
    const dbName = getDBName();
    const all = await getAllPending(dbName);
    setPendingChanges(all);
  }, [getDBName]);

  const stage = useCallback(async (change: Omit<PendingChange, "stagedAt">) => {
    const dbName = getDBName();
    await stageChange(dbName, { ...change, stagedAt: new Date().toISOString() });
    await refreshPending();
  }, [refreshPending, getDBName]);

  useEffect(() => { refreshPending(); }, [refreshPending]);

  // Auto-save effect
  const handleContentChange = useCallback(async (changedPath: string, latex: string, tiptapContent: string, info: { title: string; author: string; phase: string }) => {
    // 1. Update Preview & Internal state tracking
    setLatexContent(latex);
    const entryId = changedPath.split('/').pop()?.replace('.json', '') || "";

    setOpenFile(prev => {
      if (prev && prev.path === changedPath) {
        return { ...prev, rawLatex: latex, tiptapContent };
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

    const entryMeta: EntryMetadata = {
      id: entryId,
      ...info,
      createdAt: openFile?.path === changedPath ? openFile.createdAt : (notebookMetadata.entries?.[entryId]?.createdAt || isoTimestamp()),
      filename: changedPath,
      resources
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
      const entryWrapper: EntryWrapper = {
        version: 2,
        metadata: entryMeta,
        content: finalDoc,
      };
      const entryJsonStr = JSON.stringify(entryWrapper, null, 2);

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
          await writeLocalFile(dirHandle, INDEX_PATH, JSON.stringify(updatedMeta, null, 2));

          notebookMetadataRef.current = updatedMeta;
        });
      } else if (workspaceMode === "github") {
        const dbName = getDBName();

        // Save assets
        for (const asset of assetsToSave) {
          await stageChange(dbName, {
            path: asset.path, operation: "upsert", content: asset.base64,
            label: `Asset: ${asset.path.split('/').pop()}`, stagedAt: isoTimestamp()
          });
          await putResource(dbName, { path: asset.path, dataUrl: `data:image/*;base64,${asset.base64}` });
        }

        // Save Entry JSON
        await stageChange(dbName, {
          path: changedPath, operation: "upsert", content: entryJsonStr,
          label: `Auto-save: ${info.title}`, stagedAt: isoTimestamp()
        });

        // Save LaTeX
        const latexPath = `${LATEX_DIR}/${entryId}.tex`;
        await stageChange(dbName, {
          path: latexPath, operation: "upsert", content: latex,
          label: `Generate LaTeX: ${info.title}`, stagedAt: isoTimestamp()
        });

        // Update notebook.json
        const meta = notebookMetadataRef.current;
        const updatedMeta = updateEntryInIndex(meta, changedPath, entryMeta);
        const metaStr = JSON.stringify(updatedMeta, null, 2);

        await stageChange(dbName, {
          path: INDEX_PATH, operation: "upsert", content: metaStr,
          label: "Auto-save metadata", stagedAt: isoTimestamp()
        });

        notebookMetadataRef.current = updatedMeta;
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
          setNotebookMetadata(migrateMetadata(parsed));
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
        fetchDirectoryTree(config, ENTRIES_DIR, false).catch(() => [] as GitHubFile[]),
        fetchDirectoryTree(config, ASSETS_DIR, false).catch(() => [] as GitHubFile[]),
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
      const pendingMeta = pending.find(p => p.path === INDEX_PATH && p.operation === "upsert");
      if (pendingMeta?.content) {
        try {
          const parsed = JSON.parse(pendingMeta.content);
          setNotebookMetadata(migrateMetadata(parsed));
        } catch { /* ignore */ }
      } else {
        try {
          const metaStr = await fetchFileContent(config, INDEX_PATH);
          const parsed = JSON.parse(metaStr);
          setNotebookMetadata(migrateMetadata(parsed));
        } catch { /* not found yet */ }
      }

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
    if (workspaceMode === "local" && dirHandle) loadLocalExplorer();
    else if (workspaceMode === "github" && config) loadGitHubExplorer();
    else if (workspaceMode === "memory") { setEntries([]); setResources([]); }
  }, [workspaceMode, dirHandle, config, loadLocalExplorer, loadGitHubExplorer]);

  // ── New Entry ────────────────────────────────────────────────────────────────

  const handleNewEntry = useCallback(async () => {
    const createdAt = isoTimestamp();
    const entryId = generateUUID();
    const filename = `${entryId}.json`;
    const path = `${ENTRIES_DIR}/${filename}`;

    const defaultTitle = "";
    const defaultAuthor = localStorage.getItem("nb-last-author") || "";

    const entryMeta: EntryMetadata = {
      id: entryId,
      title: defaultTitle,
      author: defaultAuthor,
      phase: "",
      createdAt: createdAt,
      filename: path,
      resources: {}
    };

    const wrapper: EntryWrapper = {
      version: 2,
      metadata: entryMeta,
      content: { type: "doc", content: [{ type: "paragraph" }] }
    };
    const jsonStr = JSON.stringify(wrapper, null, 2);

    const initialLatex = `\\notebookentry{${defaultTitle}}{${createdAt.split('T')[0]}}{${defaultAuthor}}{}\n\\label{${entryId}}\n\n`;

    const newMetadata = updateEntryInIndex(notebookMetadata, entryId, wrapper.metadata);
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
      isLegacyRaw: false,
    });
    setLatexContent(initialLatex);
    setEntries(prev => [{ name: filename, path }, ...prev]);
    setNotebookMetadata(newMetadata);
    setSavingPaths(prev => new Set(prev).add(path));

    // Background save
    const saveOp = async () => {
      try {
        if (workspaceMode === "local" && dirHandle) {
          await queueLocalOp(async () => {
            await writeLocalFile(dirHandle, path, jsonStr);
            await writeLocalFile(dirHandle, INDEX_PATH, metaStr);
            await writeLocalFile(dirHandle, `${LATEX_DIR}/${entryId}.tex`, initialLatex);
            // No need to call loadLocalExplorer anymore since we updated state optimistically
          });
        } else if (workspaceMode === "github") {
          await stage({ path, content: jsonStr, operation: "upsert", label: "New entry" });
          await stage({ path: INDEX_PATH, content: metaStr, operation: "upsert", label: "Update index" });
          await stage({ path: `${LATEX_DIR}/${entryId}.tex`, content: initialLatex, operation: "upsert", label: "Init LaTeX" });
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

  const handleSelectEntry = useCallback(async (file: ExplorerFile) => {
    setIsLoading(true);
    if (isMobile) setIsSidebarOpen(false);
    setMobileTab("editor");

    try {
      const dbName = getDBName();
      let entryJsonStr = "";
      let latexStr = "";

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
      const wrapper: EntryWrapper = JSON.parse(entryJsonStr);

      // 2. Load LaTeX for preview
      const entryId = wrapper.metadata.id;
      const latexPath = `${LATEX_DIR}/${entryId}.tex`;
      const stagedLatex = (await getAllPending(dbName)).find(p => p.path === latexPath && p.operation === "upsert");
      if (stagedLatex?.content) {
        latexStr = stagedLatex.content;
      } else if (workspaceMode === "local" && dirHandle) {
        try { latexStr = (await getLocalFileContent(dirHandle, latexPath)).text || ""; } catch { /* ignore */ }
      } else if (workspaceMode === "github" && config) {
        try { latexStr = await fetchFileContent(config, latexPath); } catch { /* ignore */ }
      }

      // 3. Hydrate Assets
      // We need a cache of assets. For now, we'll fetch them on demand or use IndexedDB
      const assetCache = new Map<string, string>();
      const images = extractImagePaths(wrapper.content);
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

      const hydratedContent = hydrateAssets(wrapper.content, assetCache);

      setOpenFile({
        path: file.path, name: file.name, id: entryId,
        viewMode: "entry",
        rawLatex: latexStr,
        tiptapContent: JSON.stringify(hydratedContent),
        title: wrapper.metadata.title,
        author: wrapper.metadata.author,
        phase: wrapper.metadata.phase,
        metadataMissing: false,
        imageSrc: "",
        createdAt: wrapper.metadata.createdAt,
        isLegacyRaw: false,
      });
      setLatexContent(latexStr);
    } catch (e) {
      console.error("Failed to open entry", e);
      notify("Failed to open entry.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [workspaceMode, dirHandle, config, getDBName]);

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
        isLegacyRaw: false,
      });
      setMobileTab("editor");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceMode, dirHandle, config, contentCache, getDBName]);

  // ── Save entry ───────────────────────────────────────────────────────────────

  const handleEntrySaved = useCallback(async (path: string, latex: string) => {
    cacheContent(path, latex);
    if (workspaceMode === "local" && dirHandle) {
      queueLocalOp(() => writeLocalFile(dirHandle, path, latex));
    } else if (workspaceMode === "github") {
      await stage({ path, content: latex, operation: "upsert", label: "Entry update" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceMode, dirHandle, stage]);



  // ── Metadata rebuild (called after entry save) ───────────────────────────────

  const handleRebuildIndex = useCallback(async () => {
    if (workspaceMode === "local" && !dirHandle) return;
    setIsLoading(true);
    try {
      let newIndex: NotebookMetadata = {
        version: 3,
        entries: {},
        knownAuthors: {},
        knownProjectTitles: {},
      };

      let entryFiles: { name: string; path: string }[] = [];
      if (workspaceMode === "local" && dirHandle) {
        let entriesDir: any = dirHandle;
        for (const part of ENTRIES_DIR.split('/')) {
          entriesDir = await entriesDir.getDirectoryHandle(part, { create: true });
        }
        for await (const entry of entriesDir.values()) {
          if (entry.kind === "file" && entry.name.endsWith(".json")) {
            entryFiles.push({ name: entry.name, path: `${ENTRIES_DIR}/${entry.name}` });
          }
        }
      } else if (workspaceMode === "github" && config) {
        const tree = await fetchDirectoryTree(config, ENTRIES_DIR, false);
        entryFiles = tree.filter(f => f.type === "file" && f.name.endsWith(".json")).map(f => ({ name: f.name, path: f.path }));
      }

      for (const file of entryFiles) {
        let content = "";
        if (workspaceMode === "local" && dirHandle) {
          content = (await getLocalFileContent(dirHandle, file.path)).text || "";
        } else if (workspaceMode === "github" && config) {
          content = await fetchFileContent(config, file.path);
        }

        if (content) {
          try {
            const wrapper: EntryWrapper = JSON.parse(content);
            const entryId = wrapper.metadata.id || file.path.split('/').pop()?.replace('.json', '') || "";
            const entryMeta: EntryMetadata = {
              ...wrapper.metadata,
              id: entryId,
              filename: file.path,
              resources: extractResources(wrapper.content)
            };
            newIndex = updateEntryInIndex(newIndex, entryId, entryMeta);
          } catch (e) {
            console.error(`Failed to parse ${file.path}`, e);
          }
        }
      }

      setNotebookMetadata(newIndex);
      notebookMetadataRef.current = newIndex;
      const metaStr = JSON.stringify(newIndex, null, 2);

      if (workspaceMode === "local" && dirHandle) {
        await writeLocalFile(dirHandle, INDEX_PATH, metaStr);
      } else if (workspaceMode === "github") {
        const dbName = getDBName();
        await stage({ path: INDEX_PATH, content: metaStr, operation: "upsert", label: "Rebuild index" });
      }

      notify("Index rebuilt successfully.", "success");
    } catch (e) {
      console.error("Failed to rebuild index", e);
      notify("Failed to rebuild index.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [workspaceMode, dirHandle, config, stage, getDBName]);

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
            const wrapper: EntryWrapper = JSON.parse(content);

            // Generate a new UUID for the imported entry to avoid collisions
            const newId = generateUUID();
            const filename = `${newId}.json`;
            const path = `${ENTRIES_DIR}/${filename}`;

            // Dehydrate assets in the imported doc (it might have embedded assets)
            const { cleanDoc, newAssets } = await dehydrateAssets(wrapper.content);

            const newWrapper: EntryWrapper = {
              ...wrapper,
              metadata: {
                ...wrapper.metadata,
                id: newId
              },
              content: cleanDoc
            };
            const jsonStr = JSON.stringify(newWrapper, null, 2);

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
                const latex = generateEntryLatex(JSON.stringify(cleanDoc), wrapper.metadata.title, wrapper.metadata.author, wrapper.metadata.phase, wrapper.metadata.createdAt, newId);
                await writeLocalFile(dirHandle, `${LATEX_DIR}/${newId}.tex`, latex);
                await handleRebuildIndex();
                await loadLocalExplorer();
              });
            } else if (workspaceMode === "github") {
              const dbName = getDBName();
              for (const asset of newAssets) {
                await stageChange(dbName, { path: asset.path, operation: "upsert", content: asset.base64, label: `Import asset`, stagedAt: isoTimestamp() });
              }
              await stage({ path, content: jsonStr, operation: "upsert", label: "Import entry" });
              const latex = generateEntryLatex(JSON.stringify(cleanDoc), wrapper.metadata.title, wrapper.metadata.author, wrapper.metadata.phase, wrapper.metadata.createdAt, newId);
              await stage({ path: `${LATEX_DIR}/${newId}.tex`, content: latex, operation: "upsert", label: "Import LaTeX" });
              await handleRebuildIndex();
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
  }, [workspaceMode, dirHandle, stage, handleRebuildIndex, getDBName]);

  const handleMetadataRebuild = useCallback(() => {
    handleRebuildIndex();
  }, [handleRebuildIndex]);

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
    } else if (workspaceMode === "github") {
      await stage({ path: imagePath, content: dataUrl, operation: "upsert", label: "Image upload" });
      const imgName = imagePath.split("/").pop()!;
      setResources(prev => [...prev, { name: imgName, path: imagePath }].sort((a, b) => a.name.localeCompare(b.name)));
    } else {
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
        const imgPath = `${ASSETS_DIR}/${ts}.${ext}`;
        await handleImageUploaded(imgPath, base64);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [handleImageUploaded]);

  // ── Entry delete ─────────────────────────────────────────────────────────────

  const handleDeleteEntry = useCallback(async (file: ExplorerFile) => {
    // Update metadata
    const updatedMeta = updateMetadataSuggestions(removeEntryFromMetadata(notebookMetadata, file.path));
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
    } else if (workspaceMode === "github") {
      // Remove any staged upsert for this path, then stage delete
      const dbName = getDBName();
      await removeStaged(dbName, file.path);
      await stage({ path: file.path, content: undefined, operation: "delete", label: "Entry deleted" });
      const entryId = file.path.split('/').pop()?.replace('.json', '') || "";
      await stage({ path: `${LATEX_DIR}/${entryId}.tex`, content: undefined, operation: "delete", label: "LaTeX deleted" });
      await stage({ path: INDEX_PATH, content: metaStr, operation: "upsert", label: "Metadata update" });
      setEntries(prev => prev.filter(e => e.path !== file.path));
    } else {
      setEntries(prev => prev.filter(e => e.path !== file.path));
    }

    if (openFile?.path === file.path) {
      setOpenFile(null);
      setLatexContent("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceMode, dirHandle, loadLocalExplorer, stage, openFile, notebookMetadata]);

  // ── Resource delete (cascades to entries) ────────────────────────────────────

  const handleDeleteResource = useCallback(async (file: ExplorerFile) => {
    // Update metadata
    const updatedMeta = removeEntryFromMetadata(notebookMetadata, file.path); // Use same helper or just remove from list
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
      await removeStaged(dbName, file.path);
      await stage({ path: file.path, operation: "delete", label: "Resource deleted" });
      await stage({ path: INDEX_PATH, content: metaStr, operation: "upsert", label: "Metadata update" });
      setResources(prev => prev.filter(r => r.path !== file.path));
    } else {
      setResources(prev => prev.filter(r => r.path !== file.path));
    }

    if (openFile?.path === file.path) {
      setOpenFile(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceMode, dirHandle, loadLocalExplorer, stage, entries, contentCache, notebookMetadata, openFile]);

  const handleDownloadPortable = useCallback(async (filename: string, content: string, info: { title: string; author: string; phase: string, createdAt: string }) => {
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

      for (const change of upserts) {
        if (!change.content) continue;
        let content = change.content;
        // base64 data URL -> raw base64 for images
        if (content.startsWith("data:")) content = content.split(",")[1];
        await saveFile(config, change.path, content, `Update notebook — ${total} file${total !== 1 ? "s" : ""} changed`);
      }
      for (const change of deletes) {
        try { await githubDeleteFile(config, change.path, `Update notebook — ${total} files changed`); } catch { /* may already not exist */ }
      }

      await clearAllPending(dbName);
      await refreshPending();
      await loadGitHubExplorer();
      notify("Successfully committed all changes to GitHub.", "success");
    } catch (e) {
      console.error("Commit failed", e);
      notify("Commit failed. Check console for details.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [config, isCommitting, refreshPending, loadGitHubExplorer, notify]);

  // ── Disconnect ────────────────────────────────────────────────────────────────

  const handleDisconnect = () => {
    setWorkspaceMode(null);
    setConfig(null);
    setDirHandle(null);
    setEntries([]);
    setResources([]);
    setOpenFile(null);
    setLatexContent("");
    setContentCache(new Map());
    setNotebookMetadata(EMPTY_METADATA);
  };


  // ── Workspace setup ───────────────────────────────────────────────────────────

  if (!workspaceMode) {
    return (
      <Settings
        onSave={(cfg) => { setConfig(cfg); setWorkspaceMode("github"); }}
        onWorkOffline={() => setWorkspaceMode("memory")}
        onOpenLocalFolder={(handle) => { setDirHandle(handle); setWorkspaceMode("local"); }}
      />
    );
  }

  // ── Pending change summary ─────────────────────────────────────────────────────

  const upserted = pendingChanges.filter(p => p.operation === "upsert");
  const deleted = pendingChanges.filter(p => p.operation === "delete");

  // ── Workspace label ───────────────────────────────────────────────────────────

  const workspaceLabel =
    workspaceMode === "github" ? `${config?.owner}/${config?.repo}` :
      workspaceMode === "local" ? (dirHandle?.name ?? "Local Folder") : "Memory";

  const ModeIcon = ArrowLeftRight;

  // ── Pending path sets for FileExplorer ────────────────────────────────────────

  const pendingPathSet = new Set(pendingChanges.filter(p => p.operation === "upsert").map(p => p.path));
  const deletedPathSet = new Set(pendingChanges.filter(p => p.operation === "delete").map(p => p.path));

  const appConfig = config ?? { owner: "Local", repo: "Workspace", token: "", entriesDir: ENTRIES_DIR, resourcesDir: ASSETS_DIR };

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
          onDeleteEntry={handleDeleteEntry}
          onDeleteResource={handleDeleteResource}
        />
      </div>

      {/* Footer */}
      <div className="p-4 bg-nb-surface border-t border-nb-outline-variant">
        {workspaceMode === "github" && (pendingChanges.length > 0 || isCommitting) && (
          <div className="mb-4">
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-nb-surface-low rounded-lg p-2.5 border border-nb-outline-variant/30">
                <span className="block text-[8px] font-bold text-nb-on-surface-variant/80 uppercase tracking-widest mb-1">Staged</span>
                <span className="text-xs font-bold text-nb-on-surface leading-none">{upserted.length}</span>
              </div>
              <div className="bg-nb-surface-low rounded-lg p-2.5 border border-nb-outline-variant/30">
                <span className="block text-[8px] font-bold text-nb-on-surface-variant/80 uppercase tracking-widest mb-1">Removed</span>
                <span className="text-xs font-bold text-nb-on-surface leading-none">{deleted.length}</span>
              </div>
            </div>
            <button
              onClick={handleCommitAll}
              disabled={isCommitting || (upserted.length === 0 && deleted.length === 0)}
              className="w-full bg-nb-tertiary hover:bg-nb-tertiary-dim text-white text-[9px] font-bold uppercase tracking-widest py-3 rounded-lg transition-all active:scale-[0.98] shadow-lg shadow-nb-tertiary/20 disabled:opacity-30"
            >
              {isCommitting ? "Syncing..." : "Commit Changes"}
            </button>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`} />
            <span className="text-[9px] font-bold uppercase tracking-widest text-nb-on-surface-variant">{isLoading ? 'Syncing' : 'Connected'}</span>
          </div>
          <span className="text-[9px] font-mono text-nb-on-surface-variant/40 truncate max-w-[120px]">{workspaceLabel}</span>
        </div>
      </div>
    </div>
  );

  const mainContent = (
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
              className={`px-3 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest transition-all ${mobileTab === 'editor' ? 'bg-nb-surface text-nb-primary shadow-sm' : 'text-nb-on-surface-variant/60'}`}
            >
              Editor
            </button>
            <button
              onClick={() => setMobileTab("preview")}
              className={`px-3 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest transition-all ${mobileTab === 'preview' ? 'bg-nb-surface text-nb-primary shadow-sm' : 'text-nb-on-surface-variant/60'}`}
            >
              Preview
            </button>
          </div>
        ) : (
          <span className="text-sm font-semibold text-nb-on-surface truncate max-w-[200px]">
            {openFile?.viewMode === "entry" ? "" : (openFile ? openFile.name : 'Engineering Notebook')}
          </span>
        )}

        <div className="flex items-center gap-2">
          {openFile?.viewMode === "entry" && !isMobile && (
            <div className="flex bg-nb-surface-low rounded-lg p-0.5 border border-nb-outline-variant/30 mr-2 shadow-sm">
              <button
                onClick={() => setDesktopViewMode("editor")}
                className={`px-3 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-widest transition-all ${desktopViewMode === "editor" ? 'bg-nb-surface text-nb-primary shadow-sm' : 'text-nb-on-surface-variant/60 hover:text-nb-primary'}`}
              >
                Editor
              </button>
              <button
                onClick={() => setDesktopViewMode("split")}
                className={`px-3 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-widest transition-all ${desktopViewMode === "split" ? 'bg-nb-surface text-nb-primary shadow-sm' : 'text-nb-on-surface-variant/60 hover:text-nb-primary'}`}
              >
                Split
              </button>
              <button
                onClick={() => setDesktopViewMode("preview")}
                className={`px-3 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-widest transition-all ${desktopViewMode === "preview" ? 'bg-nb-surface text-nb-primary shadow-sm' : 'text-nb-on-surface-variant/60 hover:text-nb-primary'}`}
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
        {openFile === null ? (
          <WelcomePage
            workspace={{ mode: workspaceMode, label: workspaceLabel }}
            onNewEntry={handleNewEntry}
            onImportEntry={handleImportEntry}
            onDisconnect={handleDisconnect}
            onOpenSidebar={() => setIsSidebarOpen(true)}
          />
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
                metadataMissing={openFile.metadataMissing}
                knownAuthors={notebookMetadata.knownAuthors}
                knownProjectTitles={notebookMetadata.knownProjectTitles}
                filename={openFile.path}
                onSaved={handleEntrySaved}
                onDeleted={(path) => handleDeleteEntry({ name: openFile.name, path })}
                onContentChange={handleContentChange}
                onTitleChange={(title) => {
                  setOpenFile(prev => prev ? { ...prev, title } : null);
                  setNotebookMetadata(prev => updateEntryInIndex(prev, openFile.id, { 
                    ...prev.entries[openFile.id], 
                    title,
                    id: openFile.id,
                    author: openFile.author,
                    phase: openFile.phase,
                    createdAt: openFile.createdAt,
                    filename: openFile.path
                  }));
                }}
                onAuthorChange={(author) => {
                  setOpenFile(prev => prev ? { ...prev, author } : null);
                  setNotebookMetadata(prev => updateEntryInIndex(prev, openFile.id, { 
                    ...prev.entries[openFile.id], 
                    author,
                    id: openFile.id,
                    title: openFile.title,
                    phase: openFile.phase,
                    createdAt: openFile.createdAt,
                    filename: openFile.path
                  }));
                }}
                onPhaseChange={(phase) => {
                  setOpenFile(prev => prev ? { ...prev, phase } : null);
                  setNotebookMetadata(prev => updateEntryInIndex(prev, openFile.id, { 
                    ...prev.entries[openFile.id], 
                    phase,
                    id: openFile.id,
                    title: openFile.title,
                    author: openFile.author,
                    createdAt: openFile.createdAt,
                    filename: openFile.path
                  }));
                }}
                onImageUpload={handleImageUploaded}
                onMetadataRebuild={handleMetadataRebuild}
                onDownloadPortable={handleDownloadPortable}
                dbName={getDBName()}
                isSaving={savingPaths.has(openFile.path)}
                notebookMetadata={notebookMetadata}
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
                initialContent={openFile.tiptapContent}
                metadataMissing={openFile.metadataMissing}
                knownAuthors={notebookMetadata.knownAuthors}
                knownProjectTitles={notebookMetadata.knownProjectTitles}
                filename={openFile.path}
                onSaved={handleEntrySaved}
                onDeleted={(path) => handleDeleteEntry({ name: openFile.name, path })}
                onContentChange={handleContentChange}
                onTitleChange={(title) => {
                  setOpenFile(prev => prev ? { ...prev, title } : null);
                  setNotebookMetadata(prev => updateEntryInIndex(prev, openFile.id, { 
                    ...prev.entries[openFile.id], 
                    title,
                    id: openFile.id,
                    author: openFile.author,
                    phase: openFile.phase,
                    createdAt: openFile.createdAt,
                    filename: openFile.path
                  }));
                }}
                onAuthorChange={(author) => {
                  setOpenFile(prev => prev ? { ...prev, author } : null);
                  setNotebookMetadata(prev => updateEntryInIndex(prev, openFile.id, { 
                    ...prev.entries[openFile.id], 
                    author,
                    id: openFile.id,
                    title: openFile.title,
                    phase: openFile.phase,
                    createdAt: openFile.createdAt,
                    filename: openFile.path
                  }));
                }}
                onPhaseChange={(phase) => {
                  setOpenFile(prev => prev ? { ...prev, phase } : null);
                  setNotebookMetadata(prev => updateEntryInIndex(prev, openFile.id, { 
                    ...prev.entries[openFile.id], 
                    phase,
                    id: openFile.id,
                    title: openFile.title,
                    author: openFile.author,
                    createdAt: openFile.createdAt,
                    filename: openFile.path
                  }));
                }}
                onImageUpload={handleImageUploaded}
                onMetadataRebuild={handleMetadataRebuild}
                onDownloadPortable={handleDownloadPortable}
                onClose={() => setOpenFile(null)}
                dbName={getDBName()}
                isSaving={savingPaths.has(openFile.path)}
                notebookMetadata={notebookMetadata}
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
    <div className="flex h-screen bg-nb-bg overflow-hidden font-sans">
      {isMobile ? (
        <div className="flex w-full h-full relative">
          <div className={`fixed inset-0 z-[150] transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
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
      )}

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
    </div>
  );
}
