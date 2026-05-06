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

  const getDBName = useCallback(() => {
    if (currentProjectId) {
      return `notebook-project-${currentProjectId}`;
    }
    return "notebook-pending";
  }, [currentProjectId]);

  const loadLocalExplorer = useCallback(async (skipMetadata = false) => {
    if (!dirHandle) return;
    setIsLoading(true);
    try {
      const files = await listLocalFiles(dirHandle, ENTRIES_DIR);
      setEntries(files);

      if (!skipMetadata) {
        try {
          const metaStr = await readLocalFile(dirHandle, INDEX_PATH);
          setMetadata(JSON.parse(metaStr));
        } catch {
          setMetadata({ ...EMPTY_METADATA });
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [dirHandle]);

  const loadGitHubExplorer = useCallback(async (skipMetadata = false) => {
    if (!config) return;
    setIsLoading(true);
    try {
      const dbName = getDBName();
      const files = await fetchDirectoryTree(config, ENTRIES_DIR);
      const entryFiles = Array.isArray(files) ? files.map((f: GitHubFile) => ({ name: f.name, path: f.path })) : [];

      const pending = await getAllPending(dbName);
      const pendingMeta = pending.find(p => p.path === INDEX_PATH && p.operation === "upsert");

      if (pendingMeta?.content) {
        try {
          setMetadata(JSON.parse(pendingMeta.content));
        } catch { }
      } else if (!skipMetadata) {
        try {
          const metaStr = await fetchFileContent(config, INDEX_PATH);
          lastRemoteMetadataRef.current = metaStr;
          setMetadata(JSON.parse(metaStr));
        } catch { }
      }

      try {
        const allEntries = await fetchFileContent(config, ALL_ENTRIES_PATH);
        lastRemoteAllEntriesRef.current = allEntries;
      } catch { }

      setEntries(entryFiles);
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

  useEffect(() => {
    const run = async () => {
      if (mode === "local" && dirHandle) {
        await loadLocalExplorer();
      } else if (mode === "github" && config) {
        await loadGitHubExplorer();
      } else if (mode === "temporary") {
        setEntries([]);
        setMetadata({ ...EMPTY_METADATA });
        setIsLoading(false);
      }
    };
    run();
  }, [mode, dirHandle, config, loadLocalExplorer, loadGitHubExplorer]);

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
