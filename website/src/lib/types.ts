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
  phase?: number | null;
  timestamp?: string;
  updatedAt?: string;
  isValid?: boolean;
  validationErrors?: string[];
}

export type TeamTab = "identity" | "members" | "phases";
