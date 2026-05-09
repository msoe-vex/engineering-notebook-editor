import { Menu, Sun, Moon, FolderGit } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import ViewToggle, { ViewMode } from "./ViewToggle";

interface ProjectHeaderProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  isMobile: boolean;
  viewMode: ViewMode;
  onSetViewMode: (mode: ViewMode) => void;
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
  viewMode,
  onSetViewMode,
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

      <div className="flex-1 flex justify-center min-w-0 px-4">
        {isEntryOpen && isMobile ? (
          <ViewToggle viewMode={viewMode} onSetViewMode={onSetViewMode} isMobile={true} />
        ) : (
          isRenamingProject && currentProject?.id !== "temporary" ? (
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
            <div className="flex items-center gap-2 max-w-[350px] min-w-0">
              <span
                onClick={() => {
                  if (currentProject?.id === "temporary") return;
                  onStartRename();
                }}
                className={`text-sm font-bold text-nb-on-surface truncate transition-colors px-2 py-1 rounded-md ${currentProject?.id === "temporary" ? "" : "cursor-pointer hover:text-nb-primary hover:bg-nb-surface-low"}`}
                title={currentProject?.id === "temporary" ? "" : "Click to rename project"}
              >
                {currentProject?.id === "temporary" ? "Temporary Workspace" : (currentProject?.name || "Engineering Notebook")}
              </span>
              {currentProject?.type === "github" && currentProject.githubConfig && (
                <a
                  href={`https://github.com/${currentProject.githubConfig.owner}/${currentProject.githubConfig.repo}/tree/${currentProject.githubConfig.branch}${currentProject.githubConfig.folderPath ? '/' + currentProject.githubConfig.folderPath : ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg text-nb-on-surface-variant/40 hover:text-nb-tertiary hover:bg-nb-tertiary/5 transition-all cursor-pointer shrink-0"
                  title="Open on GitHub"
                >
                  <FolderGit size={14} />
                </a>
              )}
            </div>
          )
        )}
      </div>

      <div className="flex items-center gap-2">
        {isEntryOpen && !isMobile && (
          <ViewToggle viewMode={viewMode} onSetViewMode={onSetViewMode} isMobile={false} />
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
