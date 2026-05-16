import { Octokit } from "octokit";

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  default_branch: string;
  updated_at?: string | null;
}

import { GitHubConfig } from "./types";
export type { GitHubConfig };

export interface GitChange {
  path: string;
  content: string | null; // null for deletion
  isBinary?: boolean;
}

export const getOctokit = (token: string) => {
  if (!token) {
    throw new Error("GitHub token is required");
  }

  const octokit = new Octokit({
    auth: token,
    headers: {
      "X-GitHub-Api-Version": "2026-03-10",
      "Accept": "application/vnd.github+json",
    }
  });

  octokit.hook.before("request", (options) => {
    options.headers["X-GitHub-Api-Version"] = "2026-03-10";
    options.headers["Accept"] = "application/vnd.github+json";
    // Ensure we use the 'token' prefix for OAuth tokens
    if (!options.headers.authorization) {
      options.headers.authorization = `token ${token}`;
    }
  });

  return octokit;
};

export const isGitHub401 = (error: unknown): boolean => {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status: number }).status === 401
  );
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
      ref: config.branch,
    });

    if (Array.isArray(response.data)) {
      return response.data.filter((file) => file.name.endsWith(".json")) as GitHubFile[];
    }
    return [];
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "status" in error && (error as { status: number }).status === 404) {
      return []; // Directory might not exist yet
    }
    throw error;
  }
};

export const fetchDirectoryTree = async (config: GitHubConfig, path: string = "notebook", recursive: boolean = false): Promise<GitHubFile[]> => {
  const octokit = getOctokit(config.token);
  const tree: GitHubFile[] = [];
  try {
    const response = await octokit.rest.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path: path,
      ref: config.branch,
      headers: { 'If-None-Match': '' } // Cache busting
    });

    if (Array.isArray(response.data)) {
      for (const item of response.data) {
        if (item.type === "dir" && recursive) {
          const subTree = await fetchDirectoryTree(config, item.path, true);
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
    ref: config.branch,
    headers: { 'If-None-Match': '' } // Cache busting
  });

  if (!Array.isArray(response.data) && response.data.type === "file") {
    try {
      return decodeBase64(response.data.content);
    } catch {
      throw new Error("Failed to decode file content. It may not be a valid UTF-8 encoded text file.");
    }
  }
  throw new Error("Not a file");
};

export const checkGitHubFileExists = async (config: GitHubConfig, path: string): Promise<boolean> => {
  const octokit = getOctokit(config.token);
  try {
    const response = await octokit.rest.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path,
      ref: config.branch,
      headers: { 'If-None-Match': '' }
    });
    return !Array.isArray(response.data) && response.data.type === "file";
  } catch {
    return false;
  }
};

export const fetchRawFileContent = async (config: GitHubConfig, path: string) => {
  const octokit = getOctokit(config.token);
  const response = await octokit.rest.repos.getContent({
    owner: config.owner,
    repo: config.repo,
    path,
    ref: config.branch,
    headers: { 'If-None-Match': '' } // Cache busting
  });

  if (!Array.isArray(response.data) && response.data.type === "file") {
    if (response.data.content) {
      const content = response.data.content.replace(/\s/g, '');
      return content;
    }

    // If content is missing, it's likely too large (> 1MB). Fetch blob directly.
    const blobResponse = await octokit.rest.git.getBlob({
      owner: config.owner,
      repo: config.repo,
      file_sha: response.data.sha,
    });
    const content = blobResponse.data.content.replace(/\s/g, '');
    return content;
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
        ref: config.branch,
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
    branch: config.branch,
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
        ref: config.branch,
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
    branch: config.branch,
  });
};

export const createBlob = async (config: GitHubConfig, content: string, encoding: "utf-8" | "base64" = "utf-8") => {
  const octokit = getOctokit(config.token);
  const response = await octokit.rest.git.createBlob({
    owner: config.owner,
    repo: config.repo,
    content,
    encoding,
  });
  return response.data.sha;
};

/**
 * Commit multiple changes in a single atomic commit.
 */
export const commitChanges = async (config: GitHubConfig, changes: GitChange[], message: string) => {
  const octokit = getOctokit(config.token);

  // 1. Get the latest commit SHA
  const { data: refData } = await octokit.rest.git.getRef({
    owner: config.owner,
    repo: config.repo,
    ref: `heads/${config.branch}`,
  });
  const latestCommitSha = refData.object.sha;

  // 2. Get the tree SHA of the latest commit
  const { data: commitData } = await octokit.rest.git.getCommit({
    owner: config.owner,
    repo: config.repo,
    commit_sha: latestCommitSha,
  });
  const baseTreeSha = commitData.tree.sha;

  // 3. Process changes into tree items
  const treeItems = await Promise.all(changes.map(async (change) => {
    if (change.content === null) {
      return null;
    }

    const item: { path: string; mode: "100644" | "100755" | "040000" | "160000" | "120000"; type: "blob" | "tree" | "commit"; sha?: string; content?: string } = {
      path: change.path,
      mode: "100644",
      type: "blob",
    };

    if (change.isBinary && change.content) {
      item.sha = await createBlob(config, change.content, "base64");
    } else {
      item.content = change.content;
    }
    return item;
  }));

  const upserts = treeItems.filter(Boolean);
  const hasDeletes = changes.some(c => c.content === null);

  let finalTreeSha: string;

  if (hasDeletes) {
    // If we have deletes, we need to get the full tree and filter it.
    const { data: fullTree } = await octokit.rest.git.getTree({
      owner: config.owner,
      repo: config.repo,
      tree_sha: baseTreeSha,
      recursive: "true",
    });

    const deletePaths = new Set(changes.filter(c => c.content === null).map(c => c.path));
    type TreeItem = {
      path: string;
      mode: "100644" | "100755" | "040000" | "160000" | "120000";
      type: "blob" | "tree" | "commit";
      sha?: string;
      content?: string;
    };

    const newTreeItems: TreeItem[] = fullTree.tree
      .filter(item => !deletePaths.has(item.path!) && item.type === "blob")
      .map(item => ({
        path: item.path!,
        mode: item.mode as "100644" | "100755" | "040000" | "160000" | "120000",
        type: item.type as "blob" | "tree" | "commit",
        sha: item.sha!
      }));

    // Add/Update upserts
    for (const upsert of upserts) {
      if (!upsert) continue;
      const idx = newTreeItems.findIndex(it => it.path === upsert.path);
      if (idx >= 0) newTreeItems[idx] = upsert;
      else newTreeItems.push(upsert);
    }

    const { data: newTree } = await octokit.rest.git.createTree({
      owner: config.owner,
      repo: config.repo,
      tree: newTreeItems,
    });
    finalTreeSha = newTree.sha;
  } else {
    // Only upserts, we can use base_tree safely
    const { data: newTree } = await octokit.rest.git.createTree({
      owner: config.owner,
      repo: config.repo,
      base_tree: baseTreeSha,
      tree: upserts.filter((i): i is NonNullable<typeof i> => i !== null),
    });
    finalTreeSha = newTree.sha;
  }

  // 4. Create commit
  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner: config.owner,
    repo: config.repo,
    message,
    tree: finalTreeSha,
    parents: [latestCommitSha],
  });

  // 5. Update ref
  await octokit.rest.git.updateRef({
    owner: config.owner,
    repo: config.repo,
    ref: `heads/${config.branch}`,
    sha: newCommit.sha,
    force: true,
  });
};

export const fetchUserRepositories = async (token: string) => {
  const octokit = getOctokit(token);
  try {
    // 1. Get all installations that the user can access for this app
    const { data } = await octokit.rest.apps.listInstallationsForAuthenticatedUser({
      per_page: 100,
    });

    const installations = data.installations;
    if (!installations || installations.length === 0) {
      console.warn("No installations found for the authenticated user.");
      return [];
    }

    // 2. Fetch repositories for each installation explicitly
    const allRepos: GitHubRepo[] = [];
    for (const inst of installations) {
      try {
        const { data: repoData } = await octokit.rest.apps.listInstallationReposForAuthenticatedUser({
          installation_id: inst.id,
          per_page: 100,
        });
        allRepos.push(...repoData.repositories.map(r => ({
          id: r.id,
          name: r.name,
          full_name: r.full_name,
          owner: { login: r.owner.login },
          default_branch: r.default_branch,
          updated_at: r.updated_at
        })));
      } catch (err) {
        console.error(`Failed to fetch repos for installation ${inst.id}:`, err);
      }
    }

    // Deduplicate by ID and sort by most recently updated
    const uniqueRepos = Array.from(new Map(allRepos.map(r => [r.id, r])).values());
    return uniqueRepos.sort((a, b) => {
      const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return dateB - dateA;
    });
  } catch (e) {
    console.error("Failed to fetch repositories via installations:", e);
    if (isGitHub401(e)) throw e;
    // If the installation check fails, we return an empty list to stay strict
    return [];
  }
};



export const fetchRepoFolders = async (token: string, owner: string, repo: string, path: string = "") => {
  const octokit = getOctokit(token);
  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
    });
    if (Array.isArray(response.data)) {
      return response.data.filter(item => item.type === 'dir');
    }
    return [];
  } catch (e) {
    console.error("Failed to fetch folders", e);
    if (isGitHub401(e)) throw e;
    return [];
  }
};

export const fetchGitHubUser = async (token: string) => {
  const octokit = getOctokit(token);
  const response = await octokit.rest.users.getAuthenticated();
  return response.data;
};

export const initiateGitHubLogin = (clientId: string | undefined, redirectUri: string, state?: string) => {
  if (!clientId) {
    alert("GitHub Client ID not configured in .env.local");
    return;
  }
  const scope = ""; // No 'repo' scope so we respect GitHub App installations
  let url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
  if (state) {
    url += `&state=${encodeURIComponent(state)}`;
  }
  window.location.href = url;
};

