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
    <div className="flex flex-col h-full items-center justify-center bg-nb-surface dark:bg-nb-dark-bg p-8">
      {/* Header */}
      <div className="flex flex-col items-center gap-6 mb-12">
        <div className="w-20 h-20 rounded-2xl bg-nb-primary flex items-center justify-center shadow-2xl shadow-nb-primary/30">
          <BookOpen size={40} className="text-white" />
        </div>
        <div className="text-center">
          <h1 className="text-4xl font-black tracking-tighter text-nb-secondary dark:text-nb-dark-on-surface">
            Engineering Notebook
          </h1>
          <div className="flex items-center gap-2 justify-center mt-3 text-sm text-nb-on-surface-variant dark:text-nb-dark-on-variant">
            <ModeIcon size={14} className="text-nb-tertiary" />
            <span className="font-mono tracking-tight">{workspace.label}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-5 w-full max-w-sm">
        <button
          id="welcome-new-entry"
          onClick={onNewEntry}
          className="flex items-center gap-4 w-full bg-nb-primary hover:bg-nb-primary-dim text-white px-6 py-5 rounded-2xl text-left font-bold shadow-nb-lg transition-all active:scale-[0.98] group"
        >
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0 group-hover:bg-white/20 transition-colors">
            <Plus size={24} />
          </div>
          <div>
            <div className="font-black text-xs uppercase tracking-[0.2em]">New Entry</div>
            <div className="text-white/70 text-sm font-normal mt-0.5">Start a new notebook entry</div>
          </div>
        </button>

        <button
          id="welcome-open-entry"
          className="flex items-center gap-4 w-full bg-nb-surface-lowest dark:bg-nb-dark-surface hover:bg-nb-surface-low dark:hover:bg-nb-dark-surface-low border border-nb-outline-variant dark:border-nb-dark-outline px-6 py-5 rounded-2xl text-left transition-all active:scale-[0.98] group"
          onClick={() => {
            document.getElementById("explorer-entries-pane")?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <div className="w-12 h-12 rounded-xl bg-nb-surface-mid dark:bg-nb-dark-surface-high flex items-center justify-center shrink-0 group-hover:bg-nb-surface-high dark:group-hover:bg-nb-dark-outline transition-colors">
            <FolderOpen size={24} className="text-nb-tertiary dark:text-nb-tertiary" />
          </div>
          <div>
            <div className="font-black text-xs uppercase tracking-[0.2em] text-nb-secondary dark:text-nb-dark-on-surface">Open Entry</div>
            <div className="text-nb-on-surface-variant dark:text-nb-dark-on-variant text-sm font-normal mt-0.5">Select from the sidebar</div>
          </div>
        </button>
      </div>

      {/* Footer */}
      <div className="mt-16 text-center">
        <button
          id="welcome-disconnect"
          onClick={onDisconnect}
          className="text-xs font-bold uppercase tracking-widest text-nb-on-surface-variant hover:text-nb-primary dark:text-nb-dark-on-variant dark:hover:text-nb-primary transition-colors border-b border-transparent hover:border-nb-primary pb-0.5"
        >
          Change workspace
        </button>
      </div>
    </div>
  );
}
