import { useState, useEffect, useCallback } from "react";
import { store, WorkspaceMode } from "@/lib/store";
import { events, EventNames } from "@/lib/events";
import { ExplorerFile, GitHubConfig } from "@/lib/types";
import { TeamMetadata, ProjectPhase } from "@/lib/metadata";
import { ImportOptions } from "@/lib/store/types";

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
    loadingLabel: store.loadingLabel,
    isInitialized: store.isInitialized,
    projects: store.projects,
    openFile: store.openFile,
    pendingChanges: store.pendingChanges,
    currentProject: store.currentProject,
    selectedPaths: store.selectedPaths,
    hasEntryInUrl: store.hasEntryInUrl,
    showTeamEditor: store.showTeamEditor,
    teamTab: store.teamTab,
    showHelp: store.showHelp,
    helpPath: store.helpPath,
    showCompiler: store.showCompiler,
    showAbout: store.showAbout,
    isMainTexPresent: store.isMainTexPresent,
    workspaceVersion: store.workspaceVersion,
    isSaving: store.isSaving,
    isPendingSave: store.isPendingSave,
    isDiscarding: store.isDiscarding,
    isCommitting: store.isCommitting,
    needsPermission: store.needsPermission,
  });

  useEffect(() => {
    const unsub = events.on(EventNames.STATE_CHANGED, (newStore: unknown) => {
      const s = newStore as typeof store;
      setState({
        mode: s.mode,
        config: s.config,
        dirHandle: s.dirHandle,
        entries: s.entries,
        metadata: s.hydratedMetadata,
        currentProjectId: s.currentProjectId,
        isLoading: s.isLoading,
        loadingLabel: s.loadingLabel,
        isInitialized: s.isInitialized,
        projects: s.projects,
        openFile: s.openFile,
        pendingChanges: s.pendingChanges,
        currentProject: s.currentProject,
        selectedPaths: s.selectedPaths,
        hasEntryInUrl: s.hasEntryInUrl,
        showTeamEditor: s.showTeamEditor,
        teamTab: s.teamTab,
        showHelp: s.showHelp,
        helpPath: s.helpPath,
        showCompiler: s.showCompiler,
        showAbout: s.showAbout,
        isMainTexPresent: s.isMainTexPresent,
        workspaceVersion: s.workspaceVersion,
        isSaving: s.isSaving,
        isPendingSave: s.isPendingSave,
        isDiscarding: s.isDiscarding,
        isCommitting: s.isCommitting,
        needsPermission: s.needsPermission,
      });
    });

    // Handle initial state if we missed it
    if (!store.isInitialized && !store.isLoading) {
      store.initialize();
    }

    return unsub;
  }, []);

  const getDBName = useCallback(() => store.getDBName(), []);
  const disconnect = useCallback(() => store.disconnect(), []);
  const refreshProjects = useCallback(() => store.refreshProjects(), []);
  const renameProject = useCallback((id: string, name: string) => store.renameProject(id, name), []);
  const selectProject = useCallback((id: string) => store.selectProject(id), []);
  const createEntry = useCallback(() => store.createEntry(), []);
  const deleteEntry = useCallback((file: ExplorerFile) => store.deleteEntry(file), []);
  const updateDraft = useCallback((tiptapContent: string | null, info: { title?: string; author?: string; phase?: number | null; date?: string }) => store.updateDraft(tiptapContent, info), []);
  const updateEntry = useCallback((id: string, latex: string, content: string, info: { title: string; author: string; phase: number | null; date: string }) => store.updateEntry(id, latex, content, info), []);
  const saveTeam = useCallback((team: TeamMetadata, phases: ProjectPhase[]) => store.saveTeam(team, phases), []);
  const createGithubProject = useCallback((config: { owner: string; repo: string; branch: string; folderPath: string; name: string }) => store.createGithubProject(config), []);
  const createLocalProject = useCallback((handle: FileSystemDirectoryHandle, name: string) => store.createLocalProject(handle, name), []);
  const createTemporaryProject = useCallback(() => store.createTemporaryProject(), []);
  const commitAll = useCallback((config: GitHubConfig, customMessage?: string) => store.commitAll(config, customMessage), []);
  const refreshPending = useCallback(() => store.refreshPending(), []);
  const setEntryValidity = useCallback((id: string, isValid: boolean, validationErrors?: string[]) => store.setEntryValidity(id, isValid, validationErrors), []);
  const discardPendingChanges = useCallback(() => store.discardPendingChanges(), []);
  const navigateTo = useCallback((params: Record<string, string | null>, path?: string) => store.navigateTo(params, path), []);
  const handleUrlChange = useCallback(() => store.handleUrlChange(), []);
  const getFileContent = useCallback((path: string) => store.getFileContent(path), []);
  const exportNotebook = useCallback((mode?: 'data-only' | 'full') => store.exportNotebook(mode), []);
  const exportEntries = useCallback((entryIds?: string[], mode?: 'data-only' | 'full') => store.exportEntries(entryIds, mode), []);
  const importNotebook = useCallback((data: Record<string, unknown>, options?: ImportOptions) => store.importNotebook(data, options), []);
  const importNotebookArchive = useCallback((file: File, options?: ImportOptions) => store.importNotebookArchive(file, options), []);
  const setSelectedPaths = useCallback((pathsOrUpdater: Set<string> | ((prev: Set<string>) => Set<string>)) => store.setSelectedPaths(pathsOrUpdater), []);
  const getCompiledPdfUrl = useCallback(() => store.getCompiledPdfUrl(), []);
  const saveCompiledPdf = useCallback((pdf: Uint8Array) => store.saveCompiledPdf(pdf), []);

  return {
    ...state,
    getDBName,
    disconnect,
    refreshProjects,
    renameProject,
    selectProject,
    createEntry,
    deleteEntry,
    updateDraft,
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
    importNotebookArchive,
    setSelectedPaths,
    getCompiledPdfUrl,
    saveCompiledPdf,
    isSaving: state.isSaving,
    isPendingSave: state.isPendingSave,
    isDiscarding: state.isDiscarding,
    isCommitting: state.isCommitting,
    needsPermission: state.needsPermission,
    grantLocalPermission: useCallback(() => store.grantLocalPermission(), []),
    reselectLocalFolder: useCallback(() => store.reselectLocalFolder(), []),
    setPendingSave: useCallback((val: boolean) => store.setPendingSave(val), []),
  };
}
