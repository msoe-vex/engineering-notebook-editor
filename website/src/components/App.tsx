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
  NotebookMetadata, EMPTY_METADATA,
  rebuildEntryRefs, computeRenameUpdates, computeDeleteUpdates,
  removeResourceFromMetadata, renameResourceInMetadata,
  parseTipTapFromLatex, renameEntryInMetadata, removeEntryFromMetadata,
  updateMetadataSuggestions, dehydrateTipTapJson,
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
const RESOURCES_DIR = "resources";
const METADATA_PATH = "metadata.json";

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
      const m = notebookMetadata.entries?.[f.path];

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

      // Prioritize openFile for the active path to give immediate sidebar feedback
      const currentTitle = (openFile?.path === f.path ? openFile.title : m?.title) || "New Entry";
      const currentAuthor = (openFile?.path === f.path ? openFile.author : m?.author) || "";

      return {
        ...f,
        title: currentTitle,
        author: currentAuthor,
        timestamp: finalTs
      };
    }).sort((a, b) => (b.timestamp || b.name).localeCompare(a.timestamp || a.name));
  }, [entries, notebookMetadata, openFile?.path, openFile?.title, openFile?.author]);

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
    // 1. Update basic state
    setOpenFile(prev => {
      if (prev && prev.path === changedPath) {
        setLatexContent(latex);
        return { ...prev, rawLatex: latex, tiptapContent, ...info };
      }
      return prev;
    });
    cacheContent(changedPath, latex);

    // 2. Persist .tex
    if (workspaceMode === "local" && dirHandle) {
      queueLocalOp(() => writeLocalFile(dirHandle, changedPath, latex));
    } else if (workspaceMode === "github") {
      const dbName = getDBName();
      await stageChange(dbName, {
        path: changedPath, operation: "upsert", content: latex,
        label: `Auto-save: ${changedPath.split('/').pop()}`,
        stagedAt: isoTimestamp()
      }).catch(console.error);
    }

    if (info.author) {
      localStorage.setItem("nb-last-author", info.author);
    }

    // 3. Update metadata.json
    let dehydratedContent = "";
    if (tiptapContent) {
      try {
        const parsed = JSON.parse(tiptapContent);
        dehydratedContent = JSON.stringify(dehydrateTipTapJson(parsed));
      } catch { /* ignore */ }
    }

    const prevMeta = notebookMetadataRef.current;
    const withNewEntry = {
      ...prevMeta,
      entries: {
        ...prevMeta.entries,
        [changedPath]: {
          ...info,
          createdAt: prevMeta.entries[changedPath]?.createdAt || isoTimestamp(),
          content: dehydratedContent
        }
      }
    };

    const withRefs = rebuildEntryRefs(withNewEntry, changedPath, dehydratedContent);
    const updatedMeta = updateMetadataSuggestions(withRefs);

    // Garbage collection
    const orphanedResources: string[] = [];
    for (const [resPath, refs] of Object.entries(prevMeta.resourceRefs)) {
      if (refs.length > 0 && (!updatedMeta.resourceRefs[resPath] || updatedMeta.resourceRefs[resPath].length === 0)) {
        orphanedResources.push(resPath);
      }
    }

    const metaStr = JSON.stringify(updatedMeta, null, 2);
    if (workspaceMode === "local" && dirHandle) {
      queueLocalOp(async () => {
        await writeLocalFile(dirHandle, METADATA_PATH, metaStr);
        for (const orphan of orphanedResources) {
          await deleteLocalFileAtPath(dirHandle, orphan).catch(e => console.error("Failed to delete orphaned resource", e));
        }
      });
    } else if (workspaceMode === "github") {
      const dbName = getDBName();
      await stageChange(dbName, {
        path: METADATA_PATH, operation: "upsert", content: metaStr,
        label: "Auto-save metadata", stagedAt: isoTimestamp()
      }).catch(console.error);
      for (const orphan of orphanedResources) {
        await stageChange(dbName, {
          path: orphan, operation: "delete",
          label: "Garbage collect resource", stagedAt: isoTimestamp()
        }).catch(console.error);
      }
    }

    setNotebookMetadata(updatedMeta);
    notebookMetadataRef.current = updatedMeta; // Update ref immediately to prevent stale reads in next rapid call
    if (orphanedResources.length > 0) {
      setResources(prev => prev.filter(r => !orphanedResources.includes(r.path)));
    }
  }, [workspaceMode, dirHandle, getDBName]);

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
          if (entry.kind === "file" && entry.name.endsWith(".tex")) {
            entryFiles.push({ name: entry.name, path: `${ENTRIES_DIR}/${entry.name}` });
          }
        }
      } catch { /* entries dir missing */ }

      try {
        let resourcesDir: any = dirHandle;
        for (const part of RESOURCES_DIR.split('/')) {
          resourcesDir = await resourcesDir.getDirectoryHandle(part, { create: true });
        }
        for await (const entry of resourcesDir.values()) {
          if (entry.kind === "file" && isImage(entry.name)) {
            resourceFiles.push({ name: entry.name, path: `${RESOURCES_DIR}/${entry.name}` });
          }
        }
      } catch { /* resources dir missing */ }

      // Load metadata.json independently
      try {
        const result = await getLocalFileContent(dirHandle, METADATA_PATH);
        if (result.text) {
          const parsed = JSON.parse(result.text);
          setNotebookMetadata(updateMetadataSuggestions(parsed));
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
        fetchDirectoryTree(config, RESOURCES_DIR, false).catch(() => [] as GitHubFile[]),
      ]);

      const entryFiles = entryItems
        .filter(f => f.type === "file" && f.name.endsWith(".tex"))
        .map(f => ({ name: f.name, path: f.path }));
      const resourceFiles = resourceItems
        .filter(f => f.type === "file" && isImage(f.name))
        .map(f => ({ name: f.name, path: f.path }));

      // Load metadata.json from pending or GitHub
      const dbName = getDBName();
      const pending = await getAllPending(dbName);
      const pendingMeta = pending.find(p => p.path === METADATA_PATH && p.operation === "upsert");
      if (pendingMeta?.content) {
        try { 
          const parsed = JSON.parse(pendingMeta.content);
          setNotebookMetadata(updateMetadataSuggestions(parsed)); 
        } catch { /* ignore */ }
      } else {
        try {
          const metaStr = await fetchFileContent(config, METADATA_PATH);
          const parsed = JSON.parse(metaStr);
          setNotebookMetadata(updateMetadataSuggestions(parsed));
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
    const ts = getFilenameTimestamp();
    let filename = `${ts}_entry.tex`;
    let path = `${ENTRIES_DIR}/${filename}`;

    // Pre-populate with last used metadata
    const defaultTitle = "";
    const defaultAuthor = localStorage.getItem("nb-last-author") || "";

    // Handle duplicates
    let counter = 1;
    while (entries.some(e => e.path === path)) {
      filename = `${ts}_${counter}_entry.tex`;
      path = `${ENTRIES_DIR}/${filename}`;
      counter++;
    }

    const scaffold = `\\notebookentry{${defaultTitle}}{${createdAt.split('T')[0]}}{${defaultAuthor}}{}\n\n`;

    const newMetadata = {
      ...notebookMetadata,
      entries: {
        ...notebookMetadata.entries,
        [path]: { title: defaultTitle || "New Entry", author: defaultAuthor, phase: "", createdAt: createdAt, content: "" }
      }
    };
    const metaStr = JSON.stringify(newMetadata, null, 2);

    if (workspaceMode === "local" && dirHandle) {
      await queueLocalOp(async () => {
        await writeLocalFile(dirHandle, path, scaffold);
        await writeLocalFile(dirHandle, METADATA_PATH, metaStr);
        await loadLocalExplorer();
      });
    } else if (workspaceMode === "github") {
      await stage({ path, content: scaffold, operation: "upsert", label: "New entry" });
      await stage({ path: METADATA_PATH, content: metaStr, operation: "upsert", label: "Initialize metadata for entry" });
      setEntries(prev => [{ name: filename, path }, ...prev]);
      setNotebookMetadata(newMetadata);
    } else {
      // memory
      setEntries(prev => [{ name: filename, path }, ...prev]);
      setNotebookMetadata(newMetadata);
      cacheContent(path, scaffold);
    }

    // Open it
    setOpenFile({
      path, name: filename,
      viewMode: "entry",
      rawLatex: scaffold,
      tiptapContent: "",
      title: defaultTitle, 
      author: defaultAuthor, 
      phase: "",
      metadataMissing: false,
      imageSrc: "",
      createdAt: createdAt,
      isLegacyRaw: false,
    });
    setLatexContent(scaffold);
  }, [workspaceMode, dirHandle, loadLocalExplorer, stage, displayEntries, entries]);

  const hydrateJson = useCallback((json: any) => {
    if (!json || typeof json !== 'object') return json;
    if (json.type === 'image' && json.attrs?.filePath) {
      const cached = contentCache.get(json.attrs.filePath);
      if (cached) return { ...json, attrs: { ...json.attrs, src: cached } };
    }
    if (json.content) {
      return { ...json, content: json.content.map(hydrateJson) };
    }
    return json;
  }, [contentCache]);


  // ── Select entry ─────────────────────────────────────────────────────────────

  const handleSelectEntry = useCallback(async (file: ExplorerFile) => {
    console.log("Selecting entry:", file.path);
    setIsLoading(true);
    if (isMobile) setIsSidebarOpen(false); // Only auto-hide on mobile
    setMobileTab("editor"); // Ensure we show the editor
    try {
      let rawLatex = "";

      // Try pending first
      const dbName = getDBName();
      const allPending = await getAllPending(dbName);
      const staged = allPending.find(p => p.path === file.path && p.operation === "upsert");
      if (staged?.content) {
        rawLatex = staged.content;
      } else if (contentCache.has(file.path)) {
        rawLatex = contentCache.get(file.path)!;
      } else if (workspaceMode === "local" && dirHandle) {
        const result = await getLocalFileContent(dirHandle, file.path);
        rawLatex = result.text ?? "";
        cacheContent(file.path, rawLatex);
      } else if (workspaceMode === "github" && config) {
        rawLatex = await fetchFileContent(config, file.path);
        cacheContent(file.path, rawLatex);
      } else {
        rawLatex = contentCache.get(file.path) ?? "";
      }

      // First, try loading from metadata.json
      const entryMeta = notebookMetadataRef.current.entries?.[file.path];
      
      if (entryMeta) {
        // Hydrate image sources before opening
        let tiptapStr = "";
        if (entryMeta.content) {
          try {
            const parsed = typeof entryMeta.content === "string" ? JSON.parse(entryMeta.content) : entryMeta.content;
            tiptapStr = JSON.stringify(hydrateJson(parsed));
          } catch { /* not json */ }
        }

        setOpenFile({
          path: file.path, name: file.name,
          viewMode: "entry",
          rawLatex,
          tiptapContent: tiptapStr,
          title: entryMeta.title || "",
          author: entryMeta.author || "",
          phase: entryMeta.phase || "",
          metadataMissing: false,
          imageSrc: "",
          createdAt: entryMeta.createdAt || new Date().toISOString(),
          isLegacyRaw: false,
        });
        setLatexContent(rawLatex);
        setMobileTab("editor");
        return;
      }


      // No valid metadata — open as read-only preview
      setOpenFile({
        path: file.path, name: file.name,
        viewMode: "raw-latex",
        rawLatex,
        tiptapContent: "",
        title: file.name, author: "", phase: "",
        metadataMissing: true,
        imageSrc: "",
        createdAt: file.timestamp || new Date().toISOString(),
        isLegacyRaw: true,
      });
      setLatexContent(rawLatex);
    } catch (e) {
      console.error("Failed to open entry", e);
      notify("Failed to open file. Connection error or invalid permissions.", "error");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceMode, dirHandle, config, contentCache]);

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
        path: file.path, name: file.name,
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

  const handleMetadataRebuild = useCallback(async (entryPath: string, tiptapJson: string, info?: { title: string; author: string; phase: string; createdAt?: string }) => {
    // Dehydrate images before storing in metadata
    let cleanJson = tiptapJson;
    try {
      const parsed = JSON.parse(tiptapJson);
      cleanJson = JSON.stringify(dehydrateTipTapJson(parsed));
    } catch { /* ... */ }

    setNotebookMetadata(prev => {
      let updated = rebuildEntryRefs(prev, entryPath, cleanJson, info);
      if (info) {
        updated = updateMetadataSuggestions(updated);
      }
      const metaStr = JSON.stringify(updated, null, 2);

      // Secondary action: persist if needed
      if (workspaceMode === "local" && dirHandle) {
        queueLocalOp(() => writeLocalFile(dirHandle, METADATA_PATH, metaStr));
      } else if (workspaceMode === "github") {
        stage({ path: METADATA_PATH, content: metaStr, operation: "upsert", label: "Metadata update" }).catch(console.error);
      }

      return updated;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebookMetadata, workspaceMode, dirHandle, stage]);

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
        const imgPath = `${RESOURCES_DIR}/${ts}.${ext}`;
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
        await writeLocalFile(dirHandle, METADATA_PATH, metaStr);
        await deleteLocalFileAtPath(dirHandle, file.path);
        await loadLocalExplorer();
      });
    } else if (workspaceMode === "github") {
      // Remove any staged upsert for this path, then stage delete
      const dbName = getDBName();
      await removeStaged(dbName, file.path);
      await stage({ path: file.path, content: undefined, operation: "delete", label: "Entry deleted" });
      await stage({ path: METADATA_PATH, content: metaStr, operation: "upsert", label: "Metadata update" });
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
    const cascadeUpdates = computeDeleteUpdates(notebookMetadata, file.path);

    // Apply cascade
    for (const { entryPath, updatedLatex, updatedDoc } of cascadeUpdates) {
      cacheContent(entryPath, updatedLatex);
      if (workspaceMode === "local" && dirHandle) {
        queueLocalOp(() => writeLocalFile(dirHandle, entryPath, updatedLatex));
      } else if (workspaceMode === "github") {
        await stage({ path: entryPath, content: updatedLatex, operation: "upsert", label: "Image ref removed" });
      }
      // If this entry is currently open, update its view
      if (openFile?.path === entryPath) {
        setOpenFile(prev => prev ? { ...prev, rawLatex: updatedLatex, tiptapContent: JSON.stringify(updatedDoc) } : null);
      }
    }

    // Update metadata
    const updatedMeta = removeResourceFromMetadata(notebookMetadata, file.path);
    setNotebookMetadata(updatedMeta);
    const metaStr = JSON.stringify(updatedMeta, null, 2);
    if (workspaceMode === "local" && dirHandle) {
      await queueLocalOp(async () => {
        await writeLocalFile(dirHandle, METADATA_PATH, metaStr);
        await deleteLocalFileAtPath(dirHandle, file.path);
        await loadLocalExplorer();
      });
    } else if (workspaceMode === "github") {
      const dbName = getDBName();
      await removeStaged(dbName, file.path);
      await stage({ path: file.path, operation: "delete", label: "Resource deleted" });
      await stage({ path: METADATA_PATH, content: metaStr, operation: "upsert", label: "Metadata update" });
      setResources(prev => prev.filter(r => r.path !== file.path));
    } else {
      setResources(prev => prev.filter(r => r.path !== file.path));
    }

    if (openFile?.path === file.path) {
      setOpenFile(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceMode, dirHandle, loadLocalExplorer, stage, entries, contentCache, notebookMetadata, openFile]);

  // Renaming entries/resources is disabled to maintain project-title centric navigation.



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

  const appConfig = config ?? { owner: "Local", repo: "Workspace", token: "", entriesDir: ENTRIES_DIR, resourcesDir: RESOURCES_DIR };

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
            className="p-1.5 rounded-lg hover:bg-nb-surface-low text-nb-on-surface-variant hover:text-nb-primary transition-colors"
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
          onClick={() => setIsSidebarOpen(true)}
          className={`p-2 rounded-lg bg-nb-surface-low text-nb-on-surface-variant hover:text-nb-primary transition-colors ${isSidebarOpen && !isMobile ? 'invisible' : 'visible'}`}
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
            className="p-2 rounded-lg bg-nb-surface-low text-nb-on-surface-variant hover:text-nb-primary transition-colors"
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
                onTitleChange={(title) => setOpenFile(prev => prev ? { ...prev, title } : null)}
                onAuthorChange={(author) => setOpenFile(prev => prev ? { ...prev, author } : null)}
                onPhaseChange={(phase) => setOpenFile(prev => prev ? { ...prev, phase } : null)}
                onImageUpload={handleImageUploaded}
                onMetadataRebuild={handleMetadataRebuild}
                dbName={getDBName()}
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
              minSize={0}
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
                onTitleChange={(title) => setOpenFile(prev => prev ? { ...prev, title } : null)}
                onAuthorChange={(author) => setOpenFile(prev => prev ? { ...prev, author } : null)}
                onPhaseChange={(phase) => setOpenFile(prev => prev ? { ...prev, phase } : null)}
                onImageUpload={handleImageUploaded}
                onMetadataRebuild={handleMetadataRebuild}
                onClose={() => setOpenFile(null)}
                dbName={getDBName()}
              />
            </Panel>

            <PanelResizeHandle id="editor-preview-resizer" className={`w-1.5 bg-nb-surface-mid hover:bg-nb-tertiary/40 transition-colors ${desktopViewMode !== 'split' ? 'hidden' : ''}`} />

            <Panel
              id="preview-panel"
              order={2}
              ref={previewPanelRef}
              collapsible={true}
              minSize={0}
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
          {isSidebarOpen && (
            <>
              <Panel id="sidebar-panel" defaultSize={20} minSize={15} maxSize={35} className="flex flex-col">
                {sidebarContent}
              </Panel>
              <PanelResizeHandle id="sidebar-resizer" className="w-1.5 bg-nb-surface-mid hover:bg-nb-tertiary/40 transition-colors" />
            </>
          )}
          <Panel id="main-panel" defaultSize={isSidebarOpen ? 80 : 100} className="flex flex-col">
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
