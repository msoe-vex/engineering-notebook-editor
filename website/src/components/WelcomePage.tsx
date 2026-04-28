"use client";

import { BookOpen, FolderOpen, GitBranch, HardDrive, Plus, ArrowLeftRight } from "lucide-react";

interface WorkspaceInfo {
  mode: "github" | "local" | "memory";
  label: string; // e.g. "owner/repo" or folder name or "Memory"
}

interface WelcomePageProps {
  workspace: WorkspaceInfo;
  onNewEntry: () => void;
  onDisconnect: () => void;
  onOpenSidebar: () => void;
}

export default function WelcomePage({ workspace, onNewEntry, onDisconnect, onOpenSidebar }: WelcomePageProps) {
  const ModeIcon =
    workspace.mode === "github" ? GitBranch :
    workspace.mode === "local"  ? HardDrive : ArrowLeftRight;

  return (
    <div className="flex flex-col h-full items-center justify-center bg-nb-bg p-8">
      {/* Header */}
      <div className="flex flex-col items-center gap-6 mb-12">
        <div className="w-20 h-20 rounded-2xl bg-nb-primary flex items-center justify-center shadow-2xl shadow-nb-primary/30">
          <BookOpen size={40} className="text-white" />
        </div>
        <div className="text-center">
          <h1 className="text-4xl font-bold text-nb-on-surface">
            Engineering Notebook
          </h1>
          <div className="flex items-center gap-2 justify-center mt-3 text-sm text-nb-on-surface-variant">
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
            <div className="font-bold text-xs uppercase tracking-widest">New Entry</div>
            <div className="text-white/70 text-sm font-normal mt-0.5">Start a new notebook entry</div>
          </div>
        </button>

        <button
          id="welcome-open-entry"
          className="flex items-center gap-4 w-full bg-nb-surface hover:bg-nb-surface-low border border-nb-outline-variant px-6 py-5 rounded-2xl text-left transition-all active:scale-[0.98] group"
          onClick={onOpenSidebar}
        >
          <div className="w-12 h-12 rounded-xl bg-nb-surface-mid flex items-center justify-center shrink-0 group-hover:bg-nb-surface-high transition-colors">
            <FolderOpen size={24} className="text-nb-tertiary" />
          </div>
          <div>
            <div className="font-bold text-xs uppercase tracking-widest text-nb-on-surface">Open Entry</div>
            <div className="text-nb-on-surface-variant text-sm font-normal mt-0.5">Select from the sidebar</div>
          </div>
        </button>
      </div>

      {/* Footer */}
      <div className="mt-16 text-center">
        <button
          id="welcome-disconnect"
          onClick={onDisconnect}
          className="text-xs font-bold uppercase tracking-widest text-nb-on-surface-variant hover:text-nb-primary transition-colors border-b border-transparent hover:border-nb-primary pb-0.5"
        >
          Change workspace
        </button>
      </div>
    </div>
  );
}
