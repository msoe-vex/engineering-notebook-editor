import { useState, useCallback, useRef, useEffect } from "react";
import { NotebookMetadata, EMPTY_METADATA } from "@/lib/metadata";
import { ExplorerFile, GitHubConfig } from "@/lib/types";
import { fetchFileContent, fetchDirectoryTree, GitHubFile } from "@/lib/github";
import { listLocalFiles, readLocalFile } from "@/lib/fs";
import { getAllPending } from "@/lib/db";
import { INDEX_PATH, ENTRIES_DIR, ALL_ENTRIES_PATH } from "@/lib/constants";

export type WorkspaceMode = "local" | "github" | "temporary" | "none";

export function useWorkspace() {
  const [mode, setMode] = useState<WorkspaceMode>("none");
  const [config, setConfig] = useState<GitHubConfig | null>(null);
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [entries, setEntries] = useState<ExplorerFile[]>([]);
  const [metadata, setMetadata] = useState<NotebookMetadata>(EMPTY_METADATA);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const lastRemoteMetadataRef = useRef<string | null>(null);
  const lastRemoteAllEntriesRef = useRef<string | null>(null);
  const metadataRef = useRef(metadata);

  useEffect(() => { metadataRef.current = metadata; }, [metadata]);

  const getDBName = useCallback((projectIdOverride?: string | null) => {
    const pid = projectIdOverride !== undefined ? projectIdOverride : currentProjectId;
    if (pid) return `notebook-project-${pid}`;
    return "notebook-default";
  }, [currentProjectId]);


  const loadLocalExplorer = useCallback(async (explicitHandle?: FileSystemDirectoryHandle, skipMetadata = false) => {
    const handle = explicitHandle || dirHandle;
    if (!handle) return;
    setIsLoading(true);
    try {
      const files = await listLocalFiles(handle, ENTRIES_DIR);
      setEntries(files);

      let finalMeta = metadata;
      if (!skipMetadata) {
        try {
          const metaStr = await readLocalFile(handle, INDEX_PATH);
          const parsed = JSON.parse(metaStr);
          finalMeta = { ...EMPTY_METADATA, ...parsed, projectId: metadataRef.current.projectId || parsed.projectId, projectName: metadataRef.current.projectName || parsed.projectName };
          setMetadata(finalMeta);
        } catch {
          finalMeta = { ...EMPTY_METADATA, projectId: metadataRef.current.projectId, projectName: metadataRef.current.projectName };
          setMetadata(finalMeta);
        }
      }
      return { entries: files, metadata: finalMeta };
    } finally {
      setIsLoading(false);
    }
  }, [dirHandle]);

  const loadGitHubExplorer = useCallback(async (explicitConfig?: GitHubConfig, skipMetadata = false) => {
    const activeConfig = explicitConfig || config;
    if (!activeConfig) return;
    setIsLoading(true);
    try {
      const dbName = getDBName();
      const activeConfig = explicitConfig || config;
      if (!activeConfig) return { entries: [], metadata };
      
      const actualEntriesDir = activeConfig.entriesDir || ENTRIES_DIR;
      const basePrefix = activeConfig.baseDir ? (activeConfig.baseDir.endsWith('/') ? activeConfig.baseDir : activeConfig.baseDir + '/') : '';
      const actualIndexPath = `${basePrefix}${INDEX_PATH}`;
      const actualAllEntriesPath = `${basePrefix}${ALL_ENTRIES_PATH}`;

      const files = await fetchDirectoryTree(activeConfig, actualEntriesDir);
      const entryFiles = Array.isArray(files) ? files.map((f: GitHubFile) => ({ name: f.name, path: f.path })) : [];

      const pending = await getAllPending(dbName);
      const pendingMeta = pending.find(p => p.path === actualIndexPath && p.operation === "upsert");

      let finalMeta = metadataRef.current;
      if (pendingMeta?.content) {
        try {
          const parsed = JSON.parse(pendingMeta.content);
          finalMeta = { ...EMPTY_METADATA, ...parsed, projectId: metadataRef.current.projectId || parsed.projectId, projectName: metadataRef.current.projectName || parsed.projectName };
          setMetadata(finalMeta);
        } catch { }
      } else if (!skipMetadata) {
        try {
          const metaStr = await fetchFileContent(activeConfig, actualIndexPath);
          lastRemoteMetadataRef.current = metaStr;
          const parsed = JSON.parse(metaStr);
          finalMeta = { ...EMPTY_METADATA, ...parsed, projectId: metadataRef.current.projectId || parsed.projectId, projectName: metadataRef.current.projectName || parsed.projectName };
          setMetadata(finalMeta);
        } catch { }
      }

      try {
        const allEntries = await fetchFileContent(activeConfig, actualAllEntriesPath);
        lastRemoteAllEntriesRef.current = allEntries;
      } catch { }

      let mergedEntries = [...entryFiles];
      for (const p of pending) {
        if (p.path.startsWith(actualEntriesDir) && p.path.endsWith('.json')) {
          if (p.operation === "upsert") {
            if (!mergedEntries.some(e => e.path === p.path)) {
              mergedEntries.push({ name: p.path.split('/').pop() || '', path: p.path });
            }
          } else if (p.operation === "delete") {
            mergedEntries = mergedEntries.filter(e => e.path !== p.path);
          }
        }
      }

      setEntries(mergedEntries);
      return { entries: mergedEntries, metadata: finalMeta };
    } finally {
      setIsLoading(false);
    }
  }, [config, getDBName]);

  const connectLocal = useCallback(async (handle: FileSystemDirectoryHandle) => {
    setDirHandle(handle);
    setMode("local");
    // Initialization will be triggered by useEffect
  }, []);

  const connectGitHub = useCallback((ghConfig: GitHubConfig) => {
    setConfig(ghConfig);
    setMode("github");
  }, []);

  const disconnect = useCallback(() => {
    setMode("none");
    setConfig(null);
    setDirHandle(null);
    setEntries([]);
    setMetadata(EMPTY_METADATA);
    setCurrentProjectId(null);
  }, []);

  // Automatic initialization removed in favor of explicit orchestration in App.tsx

  return {
    mode,
    config,
    dirHandle,
    entries,
    metadata,
    setMetadata,
    setEntries,
    isLoading,
    setIsLoading,
    getDBName,
    loadLocalExplorer,
    loadGitHubExplorer,
    connectLocal,
    connectGitHub,
    disconnect,
    setMode,
    setConfig,
    setDirHandle,
    currentProjectId,
    setCurrentProjectId,
    lastRemoteMetadataRef,
    lastRemoteAllEntriesRef,
  };
}
