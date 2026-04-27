"use client";

import { GitHubConfig } from "@/lib/github";
import { useState } from "react";

export default function Settings({
  onSave,
  onWorkOffline,
  onOpenLocalFolder,
}: {
  onSave: (config: GitHubConfig) => void;
  onWorkOffline: () => void;
  onOpenLocalFolder: (handle: FileSystemDirectoryHandle, entriesDir: string, resourcesDir: string) => void;
}) {
  const [token, setToken] = useState("");
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [entriesDir, setEntriesDir] = useState("notebook/entries");
  const [resourcesDir, setResourcesDir] = useState("notebook/resources");

  const handleSave = () => {
    onSave({ token, owner, repo, entriesDir, resourcesDir });
  };

  const handleOpenFolder = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      onOpenLocalFolder(handle, entriesDir, resourcesDir);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col gap-4 max-w-md mx-auto mt-20 border dark:border-zinc-800 p-6 rounded-lg shadow-sm dark:bg-zinc-900">
      <h2 className="text-xl font-bold dark:text-white">GitHub Configuration</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Enter your GitHub Personal Access Token (PAT) and repository details to
        connect to your Git-based CMS.
      </p>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium dark:text-gray-200">Owner (Username / Org)</label>
        <input
          type="text"
          className="border dark:border-zinc-700 p-2 rounded dark:bg-zinc-950 dark:text-white"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="e.g. octocat"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium dark:text-gray-200">Repository</label>
        <input
          type="text"
          className="border dark:border-zinc-700 p-2 rounded dark:bg-zinc-950 dark:text-white"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="e.g. vex-notebook"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium dark:text-gray-200">Personal Access Token</label>
        <input
          type="password"
          className="border dark:border-zinc-700 p-2 rounded dark:bg-zinc-950 dark:text-white"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ghp_..."
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium dark:text-gray-200">Entries Directory</label>
        <input
          type="text"
          className="border dark:border-zinc-700 p-2 rounded dark:bg-zinc-950 dark:text-white"
          value={entriesDir}
          onChange={(e) => setEntriesDir(e.target.value)}
          placeholder="notebook/entries"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium dark:text-gray-200">Resources Directory (Images)</label>
        <input
          type="text"
          className="border dark:border-zinc-700 p-2 rounded dark:bg-zinc-950 dark:text-white"
          value={resourcesDir}
          onChange={(e) => setResourcesDir(e.target.value)}
          placeholder="notebook/resources"
        />
      </div>
      <div className="flex gap-4 mt-2">
        <button
          onClick={handleSave}
          className="flex-1 bg-blue-600 text-white p-2 rounded hover:bg-blue-700 transition"
        >
          Save & Connect
        </button>
        <button
          onClick={handleOpenFolder}
          className="flex-1 bg-green-600 text-white p-2 rounded hover:bg-green-700 transition"
        >
          Open Local Folder
        </button>
        <button
          onClick={onWorkOffline}
          className="flex-1 bg-gray-200 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 p-2 rounded hover:bg-gray-300 dark:hover:bg-zinc-700 transition"
        >
          Work Offline (Memory)
        </button>
      </div>
    </div>
  );
}
