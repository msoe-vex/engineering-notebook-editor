import { useState, useEffect, useCallback } from "react";
import { store, WorkspaceMode } from "@/lib/store";
import { events, EventNames } from "@/lib/events";

export type { WorkspaceMode };

export function useWorkspace() {
  const [state, setState] = useState({
    mode: store.mode,
    config: store.config,
    dirHandle: store.dirHandle,
    entries: store.entries,
    metadata: store.hydratedMetadata,
    currentProjectId: store.currentProjectId,
    isLoading: store.isLoading,
    isInitialized: store.isInitialized,
    projects: store.projects,
    openFile: store.openFile,
    pendingChanges: store.pendingChanges,
    currentProject: store.currentProject,
    selectedPaths: store.selectedPaths,
  });

  useEffect(() => {
    const unsub = events.on(EventNames.STATE_CHANGED, (newStore) => {
      setState({
        mode: newStore.mode,
        config: newStore.config,
        dirHandle: newStore.dirHandle,
        entries: newStore.entries,
        metadata: newStore.hydratedMetadata,
        currentProjectId: newStore.currentProjectId,
        isLoading: newStore.isLoading,
        isInitialized: newStore.isInitialized,
        projects: newStore.projects,
        openFile: newStore.openFile,
        pendingChanges: newStore.pendingChanges,
        currentProject: newStore.currentProject,
        selectedPaths: newStore.selectedPaths,
      });
    });

    // Handle initial state if we missed it
    if (!store.isInitialized && !store.isLoading) {
      store.initialize();
    }

    return unsub;
  }, []);

  const getDBName = useCallback((id?: string) => store.getDBName(), []);
  const disconnect = useCallback(() => store.disconnect(), []);
  const refreshProjects = useCallback(() => store.refreshProjects(), []);
  const selectProject = useCallback((id: string) => store.selectProject(id), []);
  const createEntry = useCallback(() => store.createEntry(), []);
  const deleteEntry = useCallback((file: any) => store.deleteEntry(file), []);
  const updateEntry = useCallback((id: string, latex: string, content: string, info: any) => store.updateEntry(id, latex, content, info), []);
  const saveTeam = useCallback((team: any, phases: any) => store.saveTeam(team, phases), []);
  const createGithubProject = useCallback((config: any) => store.createGithubProject(config), []);
  const createLocalProject = useCallback((handle: any, name: string) => store.createLocalProject(handle, name), []);
  const createTemporaryProject = useCallback(() => store.createTemporaryProject(), []);
  const commitAll = useCallback((config: any) => store.commitAll(config), []);
  const refreshPending = useCallback(() => store.refreshPending(), []);
  const setEntryValidity = useCallback((id: string, isValid: boolean, validationErrors?: string[]) => store.setEntryValidity(id, isValid, validationErrors), []);
  const discardPendingChanges = useCallback(() => store.discardPendingChanges(), []);
  const navigateTo = useCallback((params: any, path?: string) => store.navigateTo(params, path), []);
  const handleUrlChange = useCallback(() => store.handleUrlChange(), []);
  const getFileContent = useCallback((path: string) => store.getFileContent(path), []);
  const exportNotebook = useCallback(() => store.exportNotebook(), []);
  const exportEntries = useCallback((entryIds?: string[]) => store.exportEntries(entryIds), []);
  const importNotebook = useCallback((data: any) => store.importNotebook(data), []);
  const setSelectedPaths = useCallback((pathsOrUpdater: Set<string> | ((prev: Set<string>) => Set<string>)) => store.setSelectedPaths(pathsOrUpdater), []);

  return {
    ...state,
    getDBName,
    disconnect,
    refreshProjects,
    selectProject,
    createEntry,
    deleteEntry,
    updateEntry,
    saveTeam,
    createGithubProject,
    createLocalProject,
    createTemporaryProject,
    commitAll,
    refreshPending,
    setEntryValidity,
    discardPendingChanges,
    navigateTo,
    handleUrlChange,
    getFileContent,
    exportNotebook,
    exportEntries,
    importNotebook,
    setSelectedPaths,
  };
}
