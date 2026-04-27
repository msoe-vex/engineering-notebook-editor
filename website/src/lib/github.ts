import { Octokit } from "octokit";

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  entriesDir: string;
  resourcesDir: string;
}

export const getOctokit = (token: string) => {
  return new Octokit({ auth: token });
};

// Properly encode and decode base64 including UTF-8 characters
const encodeBase64 = (str: string) => {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (match, p1) {
      return String.fromCharCode(parseInt(p1, 16));
    })
  );
};

const decodeBase64 = (str: string) => {
  return decodeURIComponent(
    Array.prototype.map
      .call(atob(str), function (c) {
        return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join("")
  );
};

export interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string | null;
  type: string;
}

export const fetchEntries = async (config: GitHubConfig): Promise<GitHubFile[]> => {
  const octokit = getOctokit(config.token);
  try {
    const response = await octokit.rest.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path: config.entriesDir,
    });

    if (Array.isArray(response.data)) {
      return response.data.filter((file) => file.name.endsWith(".tex")) as GitHubFile[];
    }
    return [];
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "status" in error && (error as { status: number }).status === 404) {
      return []; // Directory might not exist yet
    }
    throw error;
  }
};

export const fetchDirectoryTree = async (config: GitHubConfig, path: string = "notebook"): Promise<GitHubFile[]> => {
  const octokit = getOctokit(config.token);
  const tree: GitHubFile[] = [];
  try {
    const response = await octokit.rest.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path: path,
    });

    if (Array.isArray(response.data)) {
      for (const item of response.data) {
        if (item.type === "dir") {
          const subTree = await fetchDirectoryTree(config, item.path);
          tree.push(item as GitHubFile, ...subTree);
        } else {
          tree.push(item as GitHubFile);
        }
      }
    } else if (response.data.type === "file") {
      tree.push(response.data as GitHubFile);
    }
    return tree;
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "status" in error && (error as { status: number }).status === 404) {
      return [];
    }
    throw error;
  }
};

export const fetchFileContent = async (config: GitHubConfig, path: string) => {
  const octokit = getOctokit(config.token);
  const response = await octokit.rest.repos.getContent({
    owner: config.owner,
    repo: config.repo,
    path,
  });

  if (!Array.isArray(response.data) && response.data.type === "file") {
    try {
      return decodeBase64(response.data.content);
    } catch (error) {
      throw new Error("Failed to decode file content. It may not be a valid UTF-8 encoded text file.");
    }
  }
  throw new Error("Not a file");
};

export const saveFile = async (
  config: GitHubConfig,
  path: string,
  content: string,
  message: string,
  sha?: string
) => {
  const octokit = getOctokit(config.token);

  // If we don't have a SHA, we need to try getting it first to allow updates
  if (!sha) {
    try {
      const existing = await octokit.rest.repos.getContent({
        owner: config.owner,
        repo: config.repo,
        path,
      });
      if (!Array.isArray(existing.data) && existing.data.type === "file") {
        sha = existing.data.sha;
      }
    } catch {
      // File doesn't exist, proceed with creation
    }
  }

  await octokit.rest.repos.createOrUpdateFileContents({
    owner: config.owner,
    repo: config.repo,
    path,
    message,
    content: encodeBase64(content),
    sha,
  });
};

export const deleteFile = async (
  config: GitHubConfig,
  path: string,
  message: string,
  sha?: string
) => {
  const octokit = getOctokit(config.token);

  if (!sha) {
    try {
      const existing = await octokit.rest.repos.getContent({
        owner: config.owner,
        repo: config.repo,
        path,
      });
      if (!Array.isArray(existing.data) && existing.data.type === "file") {
        sha = existing.data.sha;
      }
    } catch {
       throw new Error("File not found or unable to fetch SHA");
    }
  }

  if (!sha) {
     throw new Error("Cannot delete file without SHA");
  }

  await octokit.rest.repos.deleteFile({
    owner: config.owner,
    repo: config.repo,
    path,
    message,
    sha,
  });
};
