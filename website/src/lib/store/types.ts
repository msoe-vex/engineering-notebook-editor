import { NotebookMetadata, TeamMetadata, ProjectPhase, EntryMetadata } from "../notebook/metadata";
import { ExplorerFile, GitHubConfig, TeamTab } from "../types";
import { Project, PendingChange } from "../storage/db";
import { DebouncedFunction } from "../utils";

export type { DebouncedFunction };

export type WorkspaceMode = "local" | "github" | "temporary" | "none";

export type EntryImportMode = "keep" | "replace" | "clear" | "none";

export interface ImportOptions {
  entryImportMode?: EntryImportMode;
  overwriteTeam?: boolean;
  overwritePhases?: boolean;
  importProjectFiles?: boolean;
  overwriteMainTex?: boolean;
  overwriteStyles?: boolean;
  overwriteFonts?: boolean;
}

export interface OpenFileState {
  path: string;
  name: string;
  id: string;
  tiptapContent: string;
  latex: string;
  title: string;
  authors: string[];
  phase: string | null;
  createdAt: string;
  updatedAt: string;
  date: string;
}

export interface IWorkspaceStore {
  // ─── State ──────────────────────────────────────────────────────────────────
  mode: WorkspaceMode;
  config: GitHubConfig | null;
  dirHandle: FileSystemDirectoryHandle | null;
  entries: ExplorerFile[];
  workspaceVersion: number;
  metadata: NotebookMetadata;
  baseMetadata: NotebookMetadata | null;
  currentProjectId: string | null;
  currentProject: Project | null;
  hasEntryInUrl: boolean;
  showTeamEditor: boolean;
  teamTab: TeamTab;
  showHelp: boolean;
  helpPath: string | null;
  showCompiler: boolean;
  showCalendar: boolean;
  calendarMode: "month" | "week";
  calendarCursor: string;
  showAbout: boolean;
  showSettings: boolean;
  openFile: OpenFileState | null;
  isLoading: boolean;
  loadingLabel: string;
  isInitialized: boolean;
  projects: Project[];
  pendingChanges: PendingChange[];
  isMainTexPresent: boolean;
  assetCache: Map<string, string>;
  selectedPaths: Set<string>;
  isSaving: boolean;
  isPendingSave: boolean;
  isDiscarding: boolean;
  isCommitting: boolean;
  needsPermission: boolean;
  debouncedPersist: DebouncedFunction<() => Promise<void>>;
  queue: Promise<void>;
  lastSavedContents: Map<string, string>;
  savingCount: number;

  // ─── Core Helpers ───────────────────────────────────────────────────────────
  getDBName(): string;
  getFullPath(path: string): string;
  setLoading(val: boolean, label?: string): void;
  notifyStateChange(): void;
  setPendingSave(val: boolean): void;
  enqueue(op: () => Promise<void>): Promise<void>;
  persistFile(path: string, content: string, label: string, isBase64?: boolean): Promise<void>;
  reconcileAssetRefs(oldRefs: string[] | Record<string, string[]>, newRefs: string[] | Record<string, string[]>): Promise<void>;
  shouldStageDelete(path: string): Promise<boolean>;
  getCommittedFileContent(path: string, isBase64?: boolean): Promise<string | null>;
  reloadWorkspace(): Promise<void>;

  // ─── Public API ─────────────────────────────────────────────────────────────
  initialize(): Promise<void>;
  handleUrlChange(url?: URL): Promise<void>;
  setSelectedPaths(pathsOrUpdater: Set<string> | ((prev: Set<string>) => Set<string>)): void;
  navigateTo(params: Record<string, string | null>, pathname?: string, options?: { replace?: boolean }): void;
  refreshProjects(): Promise<void>;
  renameProject(id: string, name: string): Promise<void>;
  createGithubProject(config: { owner: string; repo: string; branch: string; folderPath: string; name: string }): Promise<string>;
  createLocalProject(handle: FileSystemDirectoryHandle, name: string): Promise<string>;
  grantLocalPermission(): Promise<boolean>;
  reselectLocalFolder(): Promise<boolean>;
  createTemporaryProject(): Promise<string>;
  selectProject(id: string): Promise<void>;
  openEntry(id: string): Promise<void>;
  updateDraft(tiptapContent: string | null, info: { title?: string; authors?: string[]; phase?: string | null; date?: string }): void;
  updateEntry(id: string, latex: string, tiptapContent: string, info: { title: string; authors: string[]; phase: string | null; date: string }): Promise<void>;
  createEntry(): Promise<string>;
  duplicateEntry(sourceId: string, options?: { asTemplate?: boolean; title?: string; authors?: string[]; phase?: string | null; date?: string }): Promise<string>;
  createTemplate(templateData?: Partial<EntryMetadata>): Promise<string>;
  createEntryFromTemplate(templateId: string): Promise<string>;
  repairDuplicateResourceIds(): Promise<boolean>;
  refreshPending(): Promise<PendingChange[]>;
  setEntryValidity(id: string, isValid: boolean, validationErrors?: string[]): void;
  discardPendingChanges(): Promise<void>;
  discardPathChange(path: string): Promise<void>;
  discardEntryChanges(entryId: string): Promise<void>;
  discardTeamChanges(): Promise<void>;
  discardPhaseChanges(): Promise<void>;
  deleteEntry(file: ExplorerFile): Promise<void>;
  updateLatexMetadata(): Promise<void>;
  saveTeam(team: TeamMetadata, phases?: Record<string, ProjectPhase>): Promise<void>;
  reorderCalendarEntry(movedId: string, targetDate: string, dayIds: string[], toIndex: number): Promise<void>;
  reorderTemplates(templateIds: string[]): Promise<void>;
  hydrateTeamAssets(): Promise<void>;
  commitAll(config: GitHubConfig, customMessage?: string): Promise<void>;
  getFileContent(path: string): Promise<string | null>;
  getBaseFileContent(path: string): Promise<string | null>;
  exportEntries(entryIds?: string[], mode?: 'data-only' | 'full'): Promise<void>;
  importNotebook(data: Record<string, unknown>, options?: ImportOptions): Promise<void>;
  importNotebookArchive(file: File, options?: ImportOptions): Promise<void>;
  getAssetBase64(path: string): Promise<string | null>;
  exportNotebook(mode?: 'data-only' | 'full'): Promise<void>;
  disconnect(): Promise<void>;
  saveCompiledPdf(pdfData: Uint8Array): Promise<void>;
  getCompiledPdfUrl(): Promise<string | null>;
}
