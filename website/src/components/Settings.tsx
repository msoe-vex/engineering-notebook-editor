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
    <div className="min-h-screen flex items-center justify-center bg-nb-surface dark:bg-nb-dark-bg p-6">
      <div className="flex flex-col gap-6 w-full max-w-md border border-nb-outline-variant dark:border-nb-dark-outline p-8 rounded-2xl shadow-nb-lg bg-nb-surface-lowest dark:bg-nb-dark-surface">
        {/* Logo */}
        <div className="flex items-center gap-4 mb-2">
          <div className="w-12 h-12 rounded-xl bg-nb-primary flex items-center justify-center shadow-lg shadow-nb-primary/20">
            <BookOpen size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-nb-secondary dark:text-nb-dark-on-surface">Engineering Notebook</h1>
            <p className="text-xs text-nb-on-surface-variant dark:text-nb-dark-on-variant">Choose a workspace to get started</p>
          </div>
        </div>

        <hr className="border-nb-surface-mid dark:border-nb-dark-outline-variant" />

        {/* Open local folder */}
        <div>
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-nb-on-surface-variant dark:text-nb-dark-on-variant mb-4">Local Workspace</h2>
          <button
            onClick={handleOpenFolder}
            className="w-full bg-nb-secondary hover:bg-slate-700 text-white py-3.5 px-4 rounded-xl font-bold text-sm transition-all active:scale-[0.98] shadow-nb-sm flex items-center justify-center gap-2"
          >
            Open Local Folder
          </button>
        </div>

        <div className="relative flex items-center py-2">
          <div className="flex-1 h-px bg-nb-surface-mid dark:bg-nb-dark-outline-variant" />
          <span className="px-3 text-[10px] text-nb-on-surface-variant dark:text-nb-dark-on-variant font-bold uppercase tracking-widest">or</span>
          <div className="flex-1 h-px bg-nb-surface-mid dark:bg-nb-dark-outline-variant" />
        </div>

        {/* GitHub */}
        <div>
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-nb-on-surface-variant dark:text-nb-dark-on-variant mb-4">GitHub Repository</h2>
          <div className="flex flex-col gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-nb-on-surface-variant dark:text-nb-dark-on-variant ml-1">Owner</label>
              <input
                type="text"
                className="w-full border border-nb-outline-variant dark:border-nb-dark-outline p-2.5 rounded-xl bg-nb-surface-low dark:bg-nb-dark-surface-low text-nb-on-surface dark:text-nb-dark-on-surface text-sm outline-none focus:ring-2 focus:ring-nb-tertiary/40 transition-all"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="username / org"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-nb-on-surface-variant dark:text-nb-dark-on-variant ml-1">Repository</label>
              <input
                type="text"
                className="w-full border border-nb-outline-variant dark:border-nb-dark-outline p-2.5 rounded-xl bg-nb-surface-low dark:bg-nb-dark-surface-low text-nb-on-surface dark:text-nb-dark-on-surface text-sm outline-none focus:ring-2 focus:ring-nb-tertiary/40 transition-all"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="notebook-repo"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-nb-on-surface-variant dark:text-nb-dark-on-variant ml-1">Token</label>
              <input
                type="password"
                className="w-full border border-nb-outline-variant dark:border-nb-dark-outline p-2.5 rounded-xl bg-nb-surface-low dark:bg-nb-dark-surface-low text-nb-on-surface dark:text-nb-dark-on-surface text-sm outline-none focus:ring-2 focus:ring-nb-tertiary/40 transition-all"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_..."
              />
            </div>
            <button
              onClick={handleSave}
              className="w-full bg-nb-primary hover:bg-nb-primary-dim text-white py-3.5 px-4 rounded-xl font-bold text-sm transition-all active:scale-[0.98] shadow-lg shadow-nb-primary/20 mt-2"
            >
              Connect to GitHub
            </button>
          </div>
        </div>

        <div className="relative flex items-center py-2">
          <div className="flex-1 h-px bg-nb-surface-mid dark:bg-nb-dark-outline-variant" />
          <span className="px-3 text-[10px] text-nb-on-surface-variant dark:text-nb-dark-on-variant font-bold uppercase tracking-widest">or</span>
          <div className="flex-1 h-px bg-nb-surface-mid dark:bg-nb-dark-outline-variant" />
        </div>

        {/* Offline */}
        <button
          onClick={onWorkOffline}
          className="w-full bg-nb-surface-mid dark:bg-nb-dark-surface-high hover:bg-nb-surface-high dark:hover:bg-nb-dark-outline text-nb-on-surface-variant dark:text-nb-dark-on-surface py-3 px-4 rounded-xl font-bold text-sm transition-all active:scale-[0.98]"
        >
          Work Offline (Memory Only)
        </button>
      </div>
    </div>
  );
}
