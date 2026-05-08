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

  return {
    ...state,
    getDBName: (id?: string) => store.getDBName(), // Keep for compatibility
    disconnect: () => store.disconnect(),
    refreshProjects: () => store.refreshProjects(),
    selectProject: (id: string) => store.selectProject(id),
    createEntry: () => store.createEntry(),
    deleteEntry: (file: any) => store.deleteEntry(file),
    updateEntry: (id: string, latex: string, content: string, info: any) => store.updateEntry(id, latex, content, info),
    saveTeam: (team: any, phases: any) => store.saveTeam(team, phases),
    createGithubProject: (config: any) => store.createGithubProject(config),
    createLocalProject: (handle: any, name: string) => store.createLocalProject(handle, name),
    createTemporaryProject: () => store.createTemporaryProject(),
    commitAll: (config: any) => store.commitAll(config),
    refreshPending: () => store.refreshPending(),
    navigateTo: (params: any, path?: string) => store.navigateTo(params, path),
    handleUrlChange: () => store.handleUrlChange(),
    getFileContent: (path: string) => store.getFileContent(path),
    exportNotebook: () => store.exportNotebook(),
    exportEntries: (entryIds?: string[]) => store.exportEntries(entryIds),
    importNotebook: (data: any) => store.importNotebook(data),
    setSelectedPaths: (pathsOrUpdater: Set<string> | ((prev: Set<string>) => Set<string>)) => store.setSelectedPaths(pathsOrUpdater),
  };
}
