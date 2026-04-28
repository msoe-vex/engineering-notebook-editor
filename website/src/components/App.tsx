"use client";

import { useState, useEffect, useCallback } from "react";
import {
  GitHubConfig, fetchDirectoryTree, fetchFileContent, GitHubFile,
  saveFile, deleteFile as githubDeleteFile,
} from "@/lib/github";
import {
  stageChange, getAllPending, clearAllPending, removeStaged, PendingChange,
} from "@/lib/db";
import {
  NotebookMetadata, EMPTY_METADATA,
  rebuildEntryRefs, computeRenameUpdates, computeDeleteUpdates,
  removeResourceFromMetadata, renameResourceInMetadata,
  parseTipTapFromLatex,
} from "@/lib/metadata";
import Settings from "./Settings";
import Editor from "./Editor";
import Preview from "./Preview";
import WelcomePage from "./WelcomePage";
import FileExplorer, { ExplorerFile } from "./FileExplorer";
import RawLatexEditor from "./RawLatexEditor";
import ImagePreview from "./ImagePreview";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { GitBranch, HardDrive, Wifi, GitCommitVertical, Loader2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkspaceMode = "github" | "local" | "memory";
type ViewMode = "welcome" | "entry" | "raw-latex" | "image" | "none";

export interface FileMetadata {
  content: string;
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
  // Raw latex: is it a legacy (no metadata) file?
  isLegacyRaw: boolean;
}

const ENTRIES_DIR = "notebook/entries";
const RESOURCES_DIR = "notebook/resources";
const METADATA_PATH = "notebook/metadata.json";

// ─── LaTeX generation (mirrors Editor.tsx) ───────────────────────────────────

const escapeLaTeX = (text: string) =>
  text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g,  "\\&")
    .replace(/%/g,  "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g,  "\\#")
    .replace(/_/g,  "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const convertNodeToLatex = (node: any): string => {
  if (!node) return "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children = () => (node.content || []).map((n: any) => convertNodeToLatex(n)).join("");
  switch (node.type) {
    case "doc": return children();
    case "text": {
      let t = escapeLaTeX(node.text ?? "");
      for (const mark of (node.marks ?? [])) {
        if (mark.type === "bold")   t = `\\textbf{${t}}`;
        if (mark.type === "italic") t = `\\textit{${t}}`;
        if (mark.type === "code")   t = `\\texttt{${t}}`;
      }
      return t;
    }
    case "hardBreak": return "\\\\\n";
    case "paragraph": { const inner = children(); return inner.trim() ? `${inner}\n\n` : "\n"; }
    case "heading": { const level = node.attrs?.level ?? 2; const cmd = level === 1 ? "subsection*" : "subsubsection*"; return `\\${cmd}{${children()}}\n\n`; }
    case "bulletList":  return `\\begin{itemize}\n${children()}\\end{itemize}\n\n`;
    case "orderedList": return `\\begin{enumerate}\n${children()}\\end{enumerate}\n\n`;
    case "listItem": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts = (node.content || []).map((child: any) => {
        if (child.type === "paragraph") return (child.content || []).map(convertNodeToLatex).join("");
        return convertNodeToLatex(child);
      });
      return `  \\item ${parts.join("\n").trim()}\n`;
    }
    case "codeBlock": {
      const lang = node.attrs?.language;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const code = (node.content || []).map((n: any) => n.text ?? "").join("");
      const opt  = lang && lang !== "plaintext" ? `[language=${lang}]` : "";
      return `\\begin{lstlisting}${opt}\n${code}\n\\end{lstlisting}\n\n`;
    }
    case "image": {
      const filePath = node.attrs?.filePath;
      const src      = node.attrs?.src ?? "";
      const imgSrc   = filePath ? filePath : src.startsWith("data:") ? "resources/embedded_image.png" : src;
      const caption  = node.attrs?.alt   ?? "Figure";
      const initials = node.attrs?.title ?? "";
      return `\\image{${imgSrc}}{${caption}}{${initials}}\n\n`;
    }
    case "table": {
      const rows = node.content ?? [];
      if (!rows.length) return "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const colCount = (rows[0]?.content ?? []).length;
      const colSpec  = "|l".repeat(colCount) + "|";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = rows.map((row: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cells = (row.content ?? []).map((cell: any) =>
          (cell.content ?? []).map(convertNodeToLatex).join("").replace(/\n+$/, "").trim()
        );
        return cells.join(" & ") + " \\\\ \\hline";
      }).join("\n");
      return `\\begin{figure}[h]\n\\centering\n\\begin{tabular}{${colSpec}}\n\\hline\n${body}\n\\end{tabular}\n\\caption{Design Data}\n\\end{figure}\n\n`;
    }
    case "tableRow": case "tableCell": case "tableHeader": return children();
    case "blockquote": return `\\begin{quote}\n${children()}\\end{quote}\n\n`;
    case "horizontalRule": return "\\noindent\\rule{\\linewidth}{0.4pt}\n\n";
    default: return children();
  }
};

const convertJsonToLatex = (jsonString: string): string => {
  if (!jsonString) return "";
  try {
    const doc = JSON.parse(jsonString);
    return convertNodeToLatex(doc).replace(/\n{3,}/g, "\n\n").trim() + "\n";
  } catch {
    return jsonString.replace(/<[^>]*>/g, "").trim() + "\n";
  }
};

const generateLatex = (content: string, title: string, author: string, phase: string) => {
  const metadata = JSON.stringify({ content });
  let latex = `% METADATA: ${metadata}\n`;
  latex += `\\newentry{${title}}{${new Date().toLocaleDateString()}}{${author}}{${phase}}\n\n`;
  latex += convertJsonToLatex(content);
  return latex;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isoTimestamp = () =>
  new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");

const isImage = (name: string) =>
  /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)$/i.test(name);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getLocalFileContent = async (rootHandle: any, path: string): Promise<{ text?: string; base64?: string; isImage: boolean }> => {
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
  return { text: await file.text(), isImage: false };
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

  // Current open file
  const [openFile, setOpenFile] = useState<OpenFileState | null>(null);

  // Notifications
  const [notification, setNotification] = useState<{ message: string; type: "error" | "success" } | null>(null);
  const notify = (message: string, type: "error" | "success" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // metadata.json contents
  const [notebookMetadata, setNotebookMetadata] = useState<NotebookMetadata>(EMPTY_METADATA);

  // Latex preview content (kept in sync by Editor)
  const [latexContent, setLatexContent] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [styContent, setStyContent] = useState("");

  // ── Pending helpers ──────────────────────────────────────────────────────────

  const refreshPending = useCallback(async () => {
    const all = await getAllPending();
    setPendingChanges(all);
  }, []);

  const stage = useCallback(async (change: Omit<PendingChange, "stagedAt">) => {
    await stageChange({ ...change, stagedAt: new Date().toISOString() });
    await refreshPending();
  }, [refreshPending]);

  useEffect(() => { refreshPending(); }, [refreshPending]);

  // ── Content cache helpers ────────────────────────────────────────────────────

  const cacheContent = (path: string, content: string) => {
    setContentCache(prev => new Map(prev).set(path, content));
  };

  // ── Explorer loaders ─────────────────────────────────────────────────────────

  const loadLocalExplorer = useCallback(async () => {
    if (!dirHandle) return;
    setIsLoading(true);
    try {
      // Get entries dir
      const entryFiles: ExplorerFile[] = [];
      const resourceFiles: ExplorerFile[] = [];

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let entriesDir: any = dirHandle;
        for (const part of ENTRIES_DIR.split('/')) {
          entriesDir = await entriesDir.getDirectoryHandle(part, { create: true });
        }
        for await (const entry of entriesDir.values()) {
          if (entry.kind === "file" && entry.name.endsWith(".tex")) {
            entryFiles.push({ name: entry.name, path: `${ENTRIES_DIR}/${entry.name}` });
          }
        }
      } catch { /* entries dir may not exist yet */ }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let resourcesDir: any = dirHandle;
        for (const part of RESOURCES_DIR.split('/')) {
          resourcesDir = await resourcesDir.getDirectoryHandle(part, { create: true });
        }
        for await (const entry of resourcesDir.values()) {
          if (entry.kind === "file" && isImage(entry.name)) {
            resourceFiles.push({ name: entry.name, path: `${RESOURCES_DIR}/${entry.name}` });
          }
        }
      } catch { /* resources dir may not exist yet */ }

      // Load sty
      try {
        const result = await getLocalFileContent(dirHandle, "vex_notebook.sty");
        if (result.text) setStyContent(result.text);
      } catch { /* not found */ }

      // Load metadata.json
      try {
        const result = await getLocalFileContent(dirHandle, METADATA_PATH);
        if (result.text) setNotebookMetadata(JSON.parse(result.text));
      } catch { /* not found */ }

      setEntries(entryFiles.sort((a, b) => b.name.localeCompare(a.name)));
      setResources(resourceFiles.sort((a, b) => a.name.localeCompare(b.name)));
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

      setEntries(
        entryItems
          .filter(f => f.type === "file" && f.name.endsWith(".tex"))
          .map(f => ({ name: f.name, path: f.path }))
          .sort((a, b) => b.name.localeCompare(a.name))
      );
      setResources(
        resourceItems
          .filter(f => f.type === "file" && isImage(f.name))
          .map(f => ({ name: f.name, path: f.path }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      // Load metadata.json from pending or GitHub
      const pending = await getAllPending();
      const pendingMeta = pending.find(p => p.path === METADATA_PATH && p.operation === "upsert");
      if (pendingMeta?.content) {
        try { setNotebookMetadata(JSON.parse(pendingMeta.content)); } catch { /* ignore */ }
      } else {
        try {
          const metaStr = await fetchFileContent(config, METADATA_PATH);
          setNotebookMetadata(JSON.parse(metaStr));
        } catch { /* not found yet */ }
      }

      // Load sty
      try {
        const styStr = await fetchFileContent(config, "vex_notebook.sty");
        setStyContent(styStr);
      } catch { /* not found */ }
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  useEffect(() => {
    if (workspaceMode === "local" && dirHandle) loadLocalExplorer();
    else if (workspaceMode === "github" && config) loadGitHubExplorer();
    else if (workspaceMode === "memory") { setEntries([]); setResources([]); }
  }, [workspaceMode, dirHandle, config, loadLocalExplorer, loadGitHubExplorer]);

  // ── New Entry ────────────────────────────────────────────────────────────────

  const handleNewEntry = useCallback(async () => {
    const ts = isoTimestamp();
    const filename = `${ts}_entry.tex`;
    const path = `${ENTRIES_DIR}/${filename}`;
    const scaffold = `% METADATA: {"content":""}\n\\newentry{}{${new Date().toLocaleDateString()}}{}{}\n`;

    if (workspaceMode === "local" && dirHandle) {
      await writeLocalFile(dirHandle, path, scaffold);
      await loadLocalExplorer();
    } else if (workspaceMode === "github") {
      await stage({ path, content: scaffold, operation: "upsert", label: "New entry" });
      setEntries(prev => [{ name: filename, path }, ...prev]);
    } else {
      // memory
      setEntries(prev => [{ name: filename, path }, ...prev]);
      cacheContent(path, scaffold);
    }

    // Open it
    setOpenFile({
      path, name: filename,
      viewMode: "entry",
      rawLatex: scaffold,
      tiptapContent: "",
      title: "", author: "", phase: "",
      metadataMissing: false,
      imageSrc: "",
      isLegacyRaw: false,
    });
    setLatexContent(scaffold);
  }, [workspaceMode, dirHandle, loadLocalExplorer, stage]);

  // ── Select entry ─────────────────────────────────────────────────────────────

  const handleSelectEntry = useCallback(async (file: ExplorerFile) => {
    setIsLoading(true);
    try {
      let rawLatex = "";

      // Try pending first
      const allPending = await getAllPending();
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

      // Parse metadata
      const metaMatch = rawLatex.match(/^% METADATA: (.+)$/m);
      if (metaMatch) {
        try {
          const meta: FileMetadata = JSON.parse(metaMatch[1]);
          const entryMatch = rawLatex.match(/\\newentry{(.*?)}{(.*?)}{(.*?)}{(.*?)}/);
          setOpenFile({
            path: file.path, name: file.name,
            viewMode: "entry",
            rawLatex,
            tiptapContent: meta.content || "",
            title: entryMatch?.[1] ?? "",
            author: entryMatch?.[3] ?? "",
            phase: entryMatch?.[4] ?? "",
            metadataMissing: false,
            imageSrc: "",
            isLegacyRaw: false,
          });
          setLatexContent(rawLatex);
          return;
        } catch { /* fall through to raw */ }
      }

      // No valid metadata — open raw
      setOpenFile({
        path: file.path, name: file.name,
        viewMode: "raw-latex",
        rawLatex,
        tiptapContent: "",
        title: file.name, author: "", phase: "",
        metadataMissing: true,
        imageSrc: "",
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
    try {
      let imageSrc = "";

      // Check pending IndexedDB
      const allPending = await getAllPending();
      const staged = allPending.find(p => p.path === file.path && p.operation === "upsert");
      if (staged?.content) {
        // content is base64 data URL
        imageSrc = staged.content.startsWith("data:") ? staged.content : `data:image/*;base64,${staged.content}`;
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

      setOpenFile({
        path: file.path, name: file.name,
        viewMode: "image",
        rawLatex: "", tiptapContent: "",
        title: file.name, author: "", phase: "",
        metadataMissing: false,
        imageSrc,
        isLegacyRaw: false,
      });
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceMode, dirHandle, config, contentCache]);

  // ── Save entry ───────────────────────────────────────────────────────────────

  const handleEntrySaved = useCallback(async (path: string, latex: string) => {
    cacheContent(path, latex);
    if (workspaceMode === "local" && dirHandle) {
      await writeLocalFile(dirHandle, path, latex);
    } else if (workspaceMode === "github") {
      await stage({ path, content: latex, operation: "upsert", label: "Entry update" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceMode, dirHandle, stage]);

  // ── Raw latex save (from RawLatexEditor) ────────────────────────────────────

  const handleRawSave = useCallback(async () => {
    if (!openFile) return;
    const latex = openFile.rawLatex;
    cacheContent(openFile.path, latex);
    if (workspaceMode === "local" && dirHandle) {
      await writeLocalFile(dirHandle, openFile.path, latex);
    } else if (workspaceMode === "github") {
      await stage({ path: openFile.path, content: latex, operation: "upsert", label: "Raw LaTeX edit" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFile, workspaceMode, dirHandle, stage]);

  // ── Metadata rebuild (called after entry save) ───────────────────────────────

  const handleMetadataRebuild = useCallback(async (entryPath: string, tiptapJson: string) => {
    const updated = rebuildEntryRefs(notebookMetadata, entryPath, tiptapJson);
    setNotebookMetadata(updated);
    const metaStr = JSON.stringify(updated, null, 2);
    if (workspaceMode === "local" && dirHandle) {
      await writeLocalFile(dirHandle, METADATA_PATH, metaStr);
    } else if (workspaceMode === "github") {
      await stage({ path: METADATA_PATH, content: metaStr, operation: "upsert", label: "Metadata update" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebookMetadata, workspaceMode, dirHandle, stage]);

  // ── Image upload from editor ─────────────────────────────────────────────────

  const handleImageUploaded = useCallback(async (imagePath: string, base64: string) => {
    const dataUrl = `data:image/*;base64,${base64}`;
    cacheContent(imagePath, dataUrl);
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    if (workspaceMode === "local" && dirHandle) {
      await writeLocalFile(dirHandle, imagePath, bytes);
      await loadLocalExplorer();
    } else if (workspaceMode === "github") {
      await stage({ path: imagePath, content: dataUrl, operation: "upsert", label: "Image upload" });
      const imgName = imagePath.split("/").pop()!;
      setResources(prev => [...prev, { name: imgName, path: imagePath }].sort((a, b) => a.name.localeCompare(b.name)));
    } else {
      const imgName = imagePath.split("/").pop()!;
      setResources(prev => [...prev, { name: imgName, path: imagePath }].sort((a, b) => a.name.localeCompare(b.name)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceMode, dirHandle, loadLocalExplorer, stage]);

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
        const ts = isoTimestamp();
        const imgPath = `${RESOURCES_DIR}/${ts}.${ext}`;
        await handleImageUploaded(imgPath, base64);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [handleImageUploaded]);

  // ── Entry delete ─────────────────────────────────────────────────────────────

  const handleDeleteEntry = useCallback(async (file: ExplorerFile) => {
    if (workspaceMode === "local" && dirHandle) {
      await deleteLocalFileAtPath(dirHandle, file.path);
      await loadLocalExplorer();
    } else if (workspaceMode === "github") {
      // Remove any staged upsert for this path, then stage delete
      await removeStaged(file.path);
      await stage({ path: file.path, content: undefined, operation: "delete", label: "Entry deleted" });
      setEntries(prev => prev.filter(e => e.path !== file.path));
    } else {
      setEntries(prev => prev.filter(e => e.path !== file.path));
    }
    if (openFile?.path === file.path) {
      setOpenFile(null);
      setLatexContent("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceMode, dirHandle, loadLocalExplorer, stage, openFile]);

  // ── Resource delete (cascades to entries) ────────────────────────────────────

  const handleDeleteResource = useCallback(async (file: ExplorerFile) => {
    // Build entry content map for cascade
    const entryContentMap = new Map<string, string>();
    for (const entry of entries) {
      const cached = contentCache.get(entry.path);
      if (cached) entryContentMap.set(entry.path, cached);
    }
    const cascadeUpdates = computeDeleteUpdates(notebookMetadata, file.path, entryContentMap);

    // Apply cascade
    for (const { entryPath, updatedLatex } of cascadeUpdates) {
      cacheContent(entryPath, updatedLatex);
      if (workspaceMode === "local" && dirHandle) {
        await writeLocalFile(dirHandle, entryPath, updatedLatex);
      } else if (workspaceMode === "github") {
        await stage({ path: entryPath, content: updatedLatex, operation: "upsert", label: "Image ref removed" });
      }
      // If this entry is currently open, update its view
      if (openFile?.path === entryPath) {
        const doc = parseTipTapFromLatex(updatedLatex);
        setOpenFile(prev => prev ? { ...prev, rawLatex: updatedLatex, tiptapContent: doc ? JSON.stringify(doc) : "" } : null);
      }
    }

    // Update metadata
    const updatedMeta = removeResourceFromMetadata(notebookMetadata, file.path);
    setNotebookMetadata(updatedMeta);
    const metaStr = JSON.stringify(updatedMeta, null, 2);
    if (workspaceMode === "local" && dirHandle) {
      await writeLocalFile(dirHandle, METADATA_PATH, metaStr);
      await deleteLocalFileAtPath(dirHandle, file.path);
      await loadLocalExplorer();
    } else if (workspaceMode === "github") {
      await removeStaged(file.path);
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

  // ── Entry rename ─────────────────────────────────────────────────────────────

  const handleRenameEntry = useCallback(async (file: ExplorerFile, newName: string) => {
    const ext = newName.includes(".") ? "" : ".tex";
    const safeNewName = newName + ext;
    const newPath = `${ENTRIES_DIR}/${safeNewName}`;
    const content = contentCache.get(file.path) ?? "";

    if (workspaceMode === "local" && dirHandle) {
      await writeLocalFile(dirHandle, newPath, content);
      await deleteLocalFileAtPath(dirHandle, file.path);
      await loadLocalExplorer();
    } else if (workspaceMode === "github") {
      await removeStaged(file.path);
      await stage({ path: file.path, operation: "delete", label: "Entry renamed (old)" });
      await stage({ path: newPath, content, operation: "upsert", label: "Entry renamed (new)" });
      setEntries(prev => prev.map(e => e.path === file.path ? { name: safeNewName, path: newPath } : e));
    } else {
      setEntries(prev => prev.map(e => e.path === file.path ? { name: safeNewName, path: newPath } : e));
      if (content) cacheContent(newPath, content);
    }

    if (openFile?.path === file.path) {
      setOpenFile(prev => prev ? { ...prev, path: newPath, name: safeNewName } : null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceMode, dirHandle, loadLocalExplorer, stage, contentCache, openFile]);

  // ── Resource rename (cascades to entries) ────────────────────────────────────

  const handleRenameResource = useCallback(async (file: ExplorerFile, newName: string) => {
    const ext = file.name.split(".").pop() ?? "png";
    const safeNewName = newName.includes(".") ? newName : `${newName}.${ext}`;
    const newPath = `${RESOURCES_DIR}/${safeNewName}`;

    // Build entry content map for cascade
    const entryContentMap = new Map<string, string>();
    for (const entry of entries) {
      const cached = contentCache.get(entry.path);
      if (cached) entryContentMap.set(entry.path, cached);
    }
    const cascadeUpdates = computeRenameUpdates(notebookMetadata, file.path, newPath, entryContentMap);

    for (const { entryPath, updatedLatex } of cascadeUpdates) {
      cacheContent(entryPath, updatedLatex);
      if (workspaceMode === "local" && dirHandle) {
        await writeLocalFile(dirHandle, entryPath, updatedLatex);
      } else {
        await stage({ path: entryPath, content: updatedLatex, operation: "upsert", label: "Image ref updated" });
      }
      if (openFile?.path === entryPath) {
        const doc = parseTipTapFromLatex(updatedLatex);
        setOpenFile(prev => prev ? { ...prev, rawLatex: updatedLatex, tiptapContent: doc ? JSON.stringify(doc) : "" } : null);
      }
    }

    // Update metadata
    const updatedMeta = renameResourceInMetadata(notebookMetadata, file.path, newPath);
    setNotebookMetadata(updatedMeta);
    const metaStr = JSON.stringify(updatedMeta, null, 2);

    const imgContent = contentCache.get(file.path) ?? "";
    if (workspaceMode === "local" && dirHandle) {
      if (imgContent) await writeLocalFile(dirHandle, newPath, imgContent);
      await deleteLocalFileAtPath(dirHandle, file.path);
      await writeLocalFile(dirHandle, METADATA_PATH, metaStr);
      await loadLocalExplorer();
    } else if (workspaceMode === "github") {
      await removeStaged(file.path);
      await stage({ path: file.path, operation: "delete", label: "Resource renamed (old)" });
      if (imgContent) await stage({ path: newPath, content: imgContent, operation: "upsert", label: "Resource renamed (new)" });
      await stage({ path: METADATA_PATH, content: metaStr, operation: "upsert", label: "Metadata update" });
      setResources(prev => prev.map(r => r.path === file.path ? { name: safeNewName, path: newPath } : r));
    } else {
      setResources(prev => prev.map(r => r.path === file.path ? { name: safeNewName, path: newPath } : r));
      if (imgContent) cacheContent(newPath, imgContent);
    }

    if (openFile?.path === file.path) {
      setOpenFile(prev => prev ? { ...prev, path: newPath, name: safeNewName, imageSrc: imgContent } : null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceMode, dirHandle, loadLocalExplorer, stage, entries, contentCache, notebookMetadata, openFile]);

  // ── Switch to raw LaTeX ───────────────────────────────────────────────────────

  const handleSwitchToRawLatex = useCallback(() => {
    if (!openFile) return;
    // Strip the METADATA tag from the stored latex
    const stripped = openFile.rawLatex.replace(/^% METADATA: .+\n/m, "");
    setOpenFile(prev => prev ? {
      ...prev,
      viewMode: "raw-latex",
      rawLatex: stripped,
      isLegacyRaw: false,
    } : null);
    setLatexContent(stripped);
  }, [openFile]);

  // ── GitHub commit all ─────────────────────────────────────────────────────────

  const handleCommitAll = useCallback(async () => {
    if (!config || isCommitting) return;
    setIsCommitting(true);
    try {
      const all = await getAllPending();
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

      await clearAllPending();
      await refreshPending();
      await loadGitHubExplorer();
      notify("Successfully committed all changes to GitHub.", "success");
    } catch (e) {
      console.error("Commit failed", e);
      notify("Commit failed. Check console for details.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [config, isCommitting, refreshPending, loadGitHubExplorer]);

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
  const deleted  = pendingChanges.filter(p => p.operation === "delete");
  // Changes that were already in GitHub (not new) are hard to distinguish without a full tree diff;
  // for simplicity we call all upserts "changed" for the badge (could refine with "added" logic later)

  // ── Workspace label ───────────────────────────────────────────────────────────

  const workspaceLabel =
    workspaceMode === "github" ? `${config?.owner}/${config?.repo}` :
    workspaceMode === "local"  ? (dirHandle?.name ?? "Local Folder") : "Memory";

  const WorkspaceIcon =
    workspaceMode === "github" ? GitBranch :
    workspaceMode === "local"  ? HardDrive : Wifi;

  // ── Pending path sets for FileExplorer ────────────────────────────────────────

  const pendingPathSet = new Set(pendingChanges.filter(p => p.operation === "upsert").map(p => p.path));
  const deletedPathSet = new Set(pendingChanges.filter(p => p.operation === "delete").map(p => p.path));

  const appConfig = config ?? { owner: "Local", repo: "Workspace", token: "", entriesDir: ENTRIES_DIR, resourcesDir: RESOURCES_DIR };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-nb-surface dark:bg-nb-dark-bg overflow-hidden font-sans">
      <PanelGroup direction="horizontal">
        {/* ── Sidebar ── */}
        <Panel defaultSize={20} minSize={15} maxSize={35} className="flex flex-col border-r border-nb-surface-mid dark:border-nb-dark-outline-variant bg-nb-surface-low dark:bg-nb-dark-surface overflow-hidden">
          {/* Sidebar header */}
          <div className="flex items-center gap-3 px-4 py-4 border-b border-nb-surface-mid dark:border-nb-dark-outline-variant shrink-0 bg-nb-surface-lowest dark:bg-nb-dark-surface-high/50">
            <div className="w-6 h-6 rounded-md bg-nb-primary flex items-center justify-center shadow-sm shadow-nb-primary/20">
              <BookOpen size={14} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-nb-secondary dark:text-nb-dark-on-surface truncate">Engineering Notebook</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <WorkspaceIcon size={10} className="text-nb-tertiary" />
                <span className="text-[9px] font-mono text-nb-on-surface-variant dark:text-nb-dark-on-variant truncate">{workspaceLabel}</span>
              </div>
            </div>
          </div>

          {/* Explorer */}
          <div className="flex-1 overflow-hidden">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full text-nb-on-surface-variant/40 gap-3">
                <Loader2 size={24} className="animate-spin text-nb-tertiary" />
                <span className="text-[10px] font-black uppercase tracking-widest">Synchronizing</span>
              </div>
            ) : (
              <FileExplorer
                entries={entries}
                resources={resources}
                selectedPath={openFile?.path ?? null}
                pendingPaths={pendingPathSet}
                deletedPaths={deletedPathSet}
                onSelectEntry={handleSelectEntry}
                onSelectResource={handleSelectResource}
                onNewEntry={handleNewEntry}
                onUploadResource={handleUploadResource}
                onRenameEntry={handleRenameEntry}
                onRenameResource={handleRenameResource}
                onDeleteEntry={handleDeleteEntry}
                onDeleteResource={handleDeleteResource}
              />
            )}
          </div>

          {/* Commit bar / footer */}
          <div className="shrink-0 border-t border-nb-surface-mid dark:border-nb-dark-outline-variant bg-nb-surface-lowest dark:bg-nb-dark-surface">
            {workspaceMode === "github" && pendingChanges.length > 0 && (
              <div className="p-4 border-b border-nb-surface-mid dark:border-nb-dark-outline-variant bg-nb-surface-low/30 dark:bg-nb-dark-surface-low/20">
                <div className="flex items-center justify-between mb-3">
                   <div className="flex items-center gap-1.5">
                     <div className="w-2 h-2 rounded-full bg-nb-tertiary animate-pulse" />
                     <span className="text-[10px] font-black uppercase tracking-widest text-nb-secondary dark:text-nb-dark-on-surface">Staged Changes</span>
                   </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="p-2 bg-nb-surface-mid dark:bg-nb-dark-surface-high rounded-lg text-center">
                    <p className="text-[10px] font-black text-nb-secondary dark:text-nb-dark-on-surface leading-none">{upserted.length}</p>
                    <p className="text-[8px] font-bold uppercase tracking-widest text-nb-on-surface-variant dark:text-nb-dark-on-variant mt-1">Edited</p>
                  </div>
                  <div className="p-2 bg-nb-surface-mid dark:bg-nb-dark-surface-high rounded-lg text-center">
                    <p className="text-[10px] font-black text-nb-primary leading-none">{deleted.length}</p>
                    <p className="text-[8px] font-bold uppercase tracking-widest text-nb-on-surface-variant dark:text-nb-dark-on-variant mt-1">Deleted</p>
                  </div>
                </div>
                <button
                  onClick={handleCommitAll}
                  disabled={isCommitting}
                  className="w-full flex items-center justify-center gap-2.5 bg-nb-primary hover:bg-nb-primary-dim disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-[0.2em] py-3 rounded-xl transition-all shadow-md shadow-nb-primary/20 active:scale-[0.98]"
                >
                  {isCommitting ? <Loader2 size={12} className="animate-spin" /> : <GitCommitVertical size={13} />}
                  {isCommitting ? "Pushing to Origin" : "Commit to GitHub"}
                </button>
              </div>
            )}
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                 <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-amber-500' : 'bg-green-500'}`} />
                 <span className="text-[9px] font-bold uppercase tracking-widest text-nb-on-surface-variant dark:text-nb-dark-on-variant">{isLoading ? 'Syncing' : 'Ready'}</span>
              </div>
              <button onClick={handleDisconnect} className="text-[9px] font-black uppercase tracking-[0.2em] text-nb-on-surface-variant hover:text-nb-primary transition-colors">
                Exit
              </button>
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-nb-surface-mid dark:bg-nb-dark-outline-variant hover:bg-nb-tertiary/40 transition-colors cursor-col-resize relative">
           <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-nb-outline-variant/30 dark:bg-nb-dark-outline/20" />
        </PanelResizeHandle>

        {/* ── Main panel ── */}
        <Panel defaultSize={80} className="bg-nb-surface dark:bg-nb-dark-bg">
          {isLoading && !openFile ? (
            <div className="flex flex-col items-center justify-center h-full text-nb-on-surface-variant/40 gap-4">
              <Loader2 size={40} className="animate-spin text-nb-tertiary" />
              <span className="text-xs font-black uppercase tracking-[0.4em]">Initial Load</span>
            </div>
          ) : openFile === null ? (
            <WelcomePage
              workspace={{ mode: workspaceMode, label: workspaceLabel }}
              onNewEntry={handleNewEntry}
              onDisconnect={handleDisconnect}
            />
          ) : openFile.viewMode === "image" ? (
            <ImagePreview
              filename={openFile.name}
              src={openFile.imageSrc}
              onRename={(newName) => handleRenameResource({ name: openFile.name, path: openFile.path }, newName)}
              onDelete={() => handleDeleteResource({ name: openFile.name, path: openFile.path })}
            />
          ) : openFile.viewMode === "raw-latex" ? (
            <div className="flex flex-col h-full bg-nb-dark-bg">
              <RawLatexEditor
                filename={openFile.name}
                content={openFile.rawLatex}
                onChange={(v) => setOpenFile(prev => prev ? { ...prev, rawLatex: v } : null)}
                isLegacyFallback={openFile.isLegacyRaw}
              />
              <div className="p-4 border-t border-nb-dark-outline-variant bg-nb-dark-surface shrink-0">
                <button
                  onClick={handleRawSave}
                  className="w-full bg-nb-tertiary hover:bg-nb-tertiary-dim text-white text-[10px] font-black uppercase tracking-[0.25em] py-3 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-nb-tertiary/20"
                >
                  Save Raw Changes
                </button>
              </div>
            </div>
          ) : (
            <PanelGroup direction="horizontal">
              <Panel defaultSize={50} minSize={30} className="flex flex-col h-full bg-nb-surface dark:bg-nb-dark-bg">
                <Editor
                  config={appConfig}
                  isLocalMode={workspaceMode !== "github"}
                  initialTitle={openFile.title}
                  initialAuthor={openFile.author}
                  initialPhase={openFile.phase}
                  initialContent={openFile.tiptapContent}
                  metadataMissing={openFile.metadataMissing}
                  filename={openFile.path}
                  onSaved={handleEntrySaved}
                  onDeleted={(path) => handleDeleteEntry({ name: openFile.name, path })}
                  onContentChange={(latex) => setLatexContent(latex)}
                  onTitleChange={(title) => setOpenFile(prev => prev ? { ...prev, title } : null)}
                  onAuthorChange={(author) => setOpenFile(prev => prev ? { ...prev, author } : null)}
                  onPhaseChange={(phase) => setOpenFile(prev => prev ? { ...prev, phase } : null)}
                  onImageUpload={handleImageUploaded}
                  onMetadataRebuild={handleMetadataRebuild}
                  onSwitchToRawLatex={handleSwitchToRawLatex}
                />
              </Panel>
              <PanelResizeHandle className="w-1.5 bg-nb-surface-mid dark:bg-nb-dark-outline-variant hover:bg-nb-tertiary/40 transition-colors cursor-col-resize relative">
                <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-nb-outline-variant/30 dark:bg-nb-dark-outline/20" />
              </PanelResizeHandle>
              <Panel defaultSize={50} minSize={30} className="flex flex-col h-full bg-nb-surface-low dark:bg-nb-dark-bg">
                <Preview latexContent={latexContent} />
              </Panel>
            </PanelGroup>
          )}
        </Panel>
      </PanelGroup>

      {/* ── Custom Notification Toast ── */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-[200] animate-in slide-in-from-right-10 duration-300">
           <div className={`px-5 py-4 rounded-2xl shadow-nb-lg border flex items-center gap-4 ${
             notification.type === 'error' 
               ? 'bg-nb-primary/5 border-nb-primary/30 text-nb-primary' 
               : 'bg-nb-tertiary/5 border-nb-tertiary/30 text-nb-tertiary'
           } backdrop-blur-xl`}>
             <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
               notification.type === 'error' ? 'bg-nb-primary/10' : 'bg-nb-tertiary/10'
             }`}>
               {notification.type === 'error' ? <AlertTriangle size={16} /> : <Check size={16} />}
             </div>
             <div>
               <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">{notification.type === 'error' ? 'System Error' : 'Success'}</p>
               <p className="text-xs font-medium text-nb-on-surface dark:text-nb-dark-on-surface">{notification.message}</p>
             </div>
             <button onClick={() => setNotification(null)} className="ml-2 hover:opacity-60 transition-opacity">
               <X size={14} />
             </button>
           </div>
        </div>
      )}
    </div>
  );
}

import { Check, X, AlertTriangle, BookOpen } from "lucide-react";
