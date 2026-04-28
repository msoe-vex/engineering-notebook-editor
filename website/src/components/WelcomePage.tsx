"use client";

import { BookOpen, FolderOpen, GitBranch, HardDrive, Plus, Wifi } from "lucide-react";

interface WorkspaceInfo {
  mode: "github" | "local" | "memory";
  label: string; // e.g. "owner/repo" or folder name or "Memory"
}

interface WelcomePageProps {
  workspace: WorkspaceInfo;
  onNewEntry: () => void;
  onDisconnect: () => void;
}

export default function WelcomePage({ workspace, onNewEntry, onDisconnect }: WelcomePageProps) {
  const ModeIcon =
    workspace.mode === "github" ? GitBranch :
    workspace.mode === "local"  ? HardDrive : Wifi;

  return (
    <div className="flex flex-col h-full items-center justify-center bg-white dark:bg-zinc-950 p-8">
      {/* Header */}
      <div className="flex flex-col items-center gap-4 mb-12">
        <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-2xl shadow-blue-500/30">
          <BookOpen size={32} className="text-white" />
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-black tracking-tighter dark:text-white">
            Engineering Notebook
          </h1>
          <div className="flex items-center gap-2 justify-center mt-2 text-sm text-gray-500 dark:text-gray-400">
            <ModeIcon size={13} />
            <span className="font-mono">{workspace.label}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-4 w-full max-w-sm">
        <button
          id="welcome-new-entry"
          onClick={onNewEntry}
          className="flex items-center gap-3 w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-2xl text-left font-bold shadow-xl shadow-blue-500/20 transition-all active:scale-95 group"
        >
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0 group-hover:bg-white/20 transition-colors">
            <Plus size={20} />
          </div>
          <div>
            <div className="font-black text-sm uppercase tracking-widest">New Entry</div>
            <div className="text-blue-200 text-xs font-normal mt-0.5">Start a new notebook entry</div>
          </div>
        </button>

        <button
          id="welcome-open-entry"
          className="flex items-center gap-3 w-full bg-gray-50 dark:bg-zinc-900 hover:bg-gray-100 dark:hover:bg-zinc-800 border border-gray-100 dark:border-zinc-800 px-6 py-4 rounded-2xl text-left transition-all active:scale-95 group"
          onClick={() => {/* Explorer is in sidebar — this just hints the user to look left */
            document.getElementById("explorer-entries-pane")?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-zinc-800 flex items-center justify-center shrink-0 group-hover:bg-gray-300 dark:group-hover:bg-zinc-700 transition-colors">
            <FolderOpen size={20} className="text-gray-600 dark:text-gray-300" />
          </div>
          <div>
            <div className="font-black text-sm uppercase tracking-widest dark:text-white">Open Entry</div>
            <div className="text-gray-500 dark:text-gray-400 text-xs font-normal mt-0.5">Select from the sidebar</div>
          </div>
        </button>
      </div>

      {/* Footer */}
      <div className="mt-12 text-center">
        <button
          id="welcome-disconnect"
          onClick={onDisconnect}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors underline underline-offset-2"
        >
          Change workspace
        </button>
      </div>
    </div>
  );
}
