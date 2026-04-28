"use client";

import { GitHubConfig } from "@/lib/github";
import { useState } from "react";
import { BookOpen } from "lucide-react";

export default function Settings({
  onSave,
  onWorkOffline,
  onOpenLocalFolder,
}: {
  onSave: (config: GitHubConfig) => void;
  onWorkOffline: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onOpenLocalFolder: (handle: any) => void;
}) {
  const [token, setToken] = useState("");
  const [owner, setOwner] = useState("");
  const [repo, setRepo]   = useState("");

  const handleSave = () => {
    onSave({
      token, owner, repo,
      entriesDir: "notebook/entries",
      resourcesDir: "notebook/resources",
    });
  };

  const handleOpenFolder = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      onOpenLocalFolder(handle);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-zinc-950 p-6">
      <div className="flex flex-col gap-5 w-full max-w-md border dark:border-zinc-800 p-8 rounded-2xl shadow-xl dark:bg-zinc-900">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <BookOpen size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight dark:text-white">Engineering Notebook</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Choose a workspace to get started</p>
          </div>
        </div>

        <hr className="border-gray-100 dark:border-zinc-800" />

        {/* Open local folder */}
        <div>
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-zinc-500 mb-3">Local Workspace</h2>
          <button
            onClick={handleOpenFolder}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-lg shadow-green-500/20"
          >
            Open Local Folder
          </button>
        </div>

        <div className="relative flex items-center">
          <div className="flex-1 h-px bg-gray-100 dark:bg-zinc-800" />
          <span className="px-3 text-[10px] text-gray-400 dark:text-zinc-600 font-bold uppercase tracking-widest">or</span>
          <div className="flex-1 h-px bg-gray-100 dark:bg-zinc-800" />
        </div>

        {/* GitHub */}
        <div>
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-zinc-500 mb-3">GitHub Repository</h2>
          <div className="flex flex-col gap-3">
            <input
              type="text"
              className="border dark:border-zinc-700 p-2.5 rounded-xl dark:bg-zinc-950 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500/40"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="Owner (username / org)"
            />
            <input
              type="text"
              className="border dark:border-zinc-700 p-2.5 rounded-xl dark:bg-zinc-950 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500/40"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="Repository name"
            />
            <input
              type="password"
              className="border dark:border-zinc-700 p-2.5 rounded-xl dark:bg-zinc-950 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500/40"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Personal Access Token (ghp_...)"
            />
            <button
              onClick={handleSave}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-lg shadow-blue-500/20"
            >
              Connect to GitHub
            </button>
          </div>
        </div>

        <div className="relative flex items-center">
          <div className="flex-1 h-px bg-gray-100 dark:bg-zinc-800" />
          <span className="px-3 text-[10px] text-gray-400 dark:text-zinc-600 font-bold uppercase tracking-widest">or</span>
          <div className="flex-1 h-px bg-gray-100 dark:bg-zinc-800" />
        </div>

        {/* Offline */}
        <button
          onClick={onWorkOffline}
          className="w-full bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 py-3 px-4 rounded-xl font-bold text-sm transition-all active:scale-95"
        >
          Work Offline (Memory Only)
        </button>
      </div>
    </div>
  );
}
