// Shared light-weight type aliases used across the editor components
export type TiptapEditor = import('@tiptap/react').Editor;

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  baseDir: string;
  entriesDir: string;
  resourcesDir: string;
}

export interface ExplorerFile {
  name: string;
  path: string;
  title?: string;
  author?: string;
  phase?: string | null;
  timestamp?: string;
  updatedAt?: string;
  isValid?: boolean;
  isTemplate?: boolean;
  date?: string;
  validationErrors?: string[];
}

export type TeamTab = "identity" | "members" | "phases";
