import { Menu, Sun, Moon } from "lucide-react";

import { useWorkspace } from "@/hooks/useWorkspace";

interface ProjectHeaderProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  isMobile: boolean;
  mobileTab: "editor" | "preview";
  onSetMobileTab: (tab: "editor" | "preview") => void;
  desktopViewMode: "editor" | "split" | "preview";
  onSetDesktopViewMode: (mode: "editor" | "split" | "preview") => void;
  isRenamingProject: boolean;
  projectRenameValue: string;
  onSetProjectRenameValue: (val: string) => void;
  onStartRename: () => void;
  onEndRename: (save: boolean) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  mounted: boolean;
}

export default function ProjectHeader({
  isSidebarOpen,
  onToggleSidebar,
  isMobile,
  mobileTab,
  onSetMobileTab,
  desktopViewMode,
  onSetDesktopViewMode,
  isRenamingProject,
  projectRenameValue,
  onSetProjectRenameValue,
  onStartRename,
  onEndRename,
  isDarkMode,
  onToggleTheme,
  mounted
}: ProjectHeaderProps) {
  const { currentProject, openFile } = useWorkspace();
  const isEntryOpen = !!openFile;
  return (
    <div className="flex items-center justify-between px-4 h-14 bg-nb-surface border-b border-nb-outline-variant shrink-0">
      <button
        onClick={onToggleSidebar}
        className="p-2 rounded-lg bg-nb-surface-low text-nb-on-surface-variant hover:text-nb-primary transition-colors cursor-pointer"
        title={isSidebarOpen ? "Close Sidebar" : "Open Sidebar"}
      >
        <Menu size={18} />
      </button>

      {isEntryOpen && isMobile ? (
        <div className="flex bg-nb-surface-low rounded-lg p-0.5 border border-nb-outline-variant/30">
          <button
            onClick={() => onSetMobileTab("editor")}
            className={`px-3 py-1 rounded-md text-[9px] font-bold tracking-widest transition-all cursor-pointer ${mobileTab === 'editor' ? 'bg-nb-surface text-nb-primary shadow-sm' : 'text-nb-on-surface-variant/60'}`}
          >
            Editor
          </button>
          <button
            onClick={() => onSetMobileTab("preview")}
            className={`px-3 py-1 rounded-md text-[9px] font-bold tracking-widest transition-all cursor-pointer ${mobileTab === 'preview' ? 'bg-nb-surface text-nb-primary shadow-sm' : 'text-nb-on-surface-variant/60'}`}
          >
            Preview
          </button>
        </div>
      ) : (
        <div className="flex-1 flex justify-center min-w-0 px-4">
          {isRenamingProject && currentProject?.id !== "temporary" ? (
            <input
              autoFocus
              type="text"
              value={projectRenameValue}
              onChange={(e) => onSetProjectRenameValue(e.target.value)}
              onBlur={() => onEndRename(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onEndRename(true);
                if (e.key === 'Escape') onEndRename(false);
              }}
              className="bg-nb-surface-low border border-nb-primary/30 px-3 py-1 rounded-lg text-sm font-bold text-nb-on-surface outline-none focus:ring-2 focus:ring-nb-primary/30 w-full max-w-[300px]"
            />
          ) : (
            <span
              onClick={() => {
                if (currentProject?.id === "temporary") return;
                onStartRename();
              }}
              className={`text-sm font-bold text-nb-on-surface truncate max-w-[300px] transition-colors px-2 py-1 rounded-md ${currentProject?.id === "temporary" ? "" : "cursor-pointer hover:text-nb-primary hover:bg-nb-surface-low"}`}
              title={currentProject?.id === "temporary" ? "" : "Click to rename project"}
            >
              {currentProject?.id === "temporary" ? "Temporary Workspace" : (currentProject?.name || "Engineering Notebook")}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        {isEntryOpen && !isMobile && (
          <div className="flex bg-nb-surface-low rounded-lg p-0.5 border border-nb-outline-variant/30 mr-2 shadow-sm">
            <button
              onClick={() => onSetDesktopViewMode("editor")}
              className={`px-3 py-1.5 rounded-md text-[9px] font-bold tracking-widest transition-all cursor-pointer ${desktopViewMode === "editor" ? 'bg-nb-surface text-nb-primary shadow-sm' : 'text-nb-on-surface-variant/60 hover:text-nb-primary'}`}
            >
              Editor
            </button>
            <button
              onClick={() => onSetDesktopViewMode("split")}
              className={`px-3 py-1.5 rounded-md text-[9px] font-bold tracking-widest transition-all cursor-pointer ${desktopViewMode === "split" ? 'bg-nb-surface text-nb-primary shadow-sm' : 'text-nb-on-surface-variant/60 hover:text-nb-primary'}`}
            >
              Split
            </button>
            <button
              onClick={() => onSetDesktopViewMode("preview")}
              className={`px-3 py-1.5 rounded-md text-[9px] font-bold tracking-widest transition-all cursor-pointer ${desktopViewMode === "preview" ? 'bg-nb-surface text-nb-primary shadow-sm' : 'text-nb-on-surface-variant/60 hover:text-nb-primary'}`}
            >
              LaTeX
            </button>
          </div>
        )}
        <button
          onClick={onToggleTheme}
          className="p-2 rounded-lg bg-nb-surface-low text-nb-on-surface-variant hover:text-nb-on-surface transition-colors cursor-pointer"
        >
          {!mounted ? <div className="w-4 h-4" /> : isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </div>
  );
}
