import { useState, useRef, useEffect } from "react";
import GithubIcon from "./GithubIcon";
import {
  Menu, HelpCircle, Play, Loader2, Check,
  MoreVertical, Download, Upload, ArrowLeftRight, Users, Edit3, CalendarDays
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { ViewMode } from "./editor/ui/ViewToggle";

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
  onOpenHelp: () => void;
  onOpenTeam: () => void;
  onOpenCalendar: () => void;
  onOpenCompiler: () => void;
  onImport: () => void;
  onExport: () => void;
  onDisconnect: () => void;
  onGoHome: () => void;
}

export default function ProjectHeader({
  isSidebarOpen,
  onToggleSidebar,
  isRenamingProject,
  projectRenameValue,
  onSetProjectRenameValue,
  onStartRename,
  onEndRename,
  onOpenHelp,
  onOpenTeam,
  onOpenCalendar,
  onOpenCompiler,
  onImport,
  onExport,
  onDisconnect,
}: ProjectHeaderProps) {
  const { currentProject, isSaving, isPendingSave } = useWorkspace();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMenu]);

  const githubUrl = currentProject?.type === "github" && currentProject.githubConfig
    ? `https://github.com/${currentProject.githubConfig.owner}/${currentProject.githubConfig.repo}/tree/${currentProject.githubConfig.branch}${currentProject.githubConfig.folderPath ? '/' + currentProject.githubConfig.folderPath : ''}`
    : null;

  return (
    <div className="flex items-center justify-between px-4 h-14 bg-nb-surface border-b border-nb-outline-variant shrink-0 relative z-[200]">
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-lg bg-nb-surface-low text-nb-on-surface-variant hover:text-nb-primary transition-colors cursor-pointer"
          title={isSidebarOpen ? "Close Sidebar" : "Open Sidebar"}
        >
          <Menu size={18} />
        </button>
      </div>

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
          <div className="flex items-center gap-1 max-w-full min-w-0 relative" ref={menuRef}>
            <div
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-nb-surface-low transition-all cursor-pointer group min-w-0 max-w-full"
            >
              <span className="text-sm font-black text-nb-on-surface truncate tracking-tight">
                {currentProject?.id === "temporary" ? "Temporary Workspace" : (currentProject?.name || "ENGen Project")}
              </span>
              <MoreVertical size={14} className="text-nb-on-surface-variant/40 group-hover:text-nb-primary transition-colors shrink-0" />
            </div>

            {showMenu && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-nb-surface border border-nb-outline-variant shadow-nb-2xl rounded-2xl py-2 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-3 py-2 border-b border-nb-outline-variant/30 mb-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-nb-on-surface-variant/40 px-1">Project Actions</p>
                </div>

                <MenuButton icon={<Play size={14} />} label="Compile Notebook" onClick={() => { onOpenCompiler(); setShowMenu(false); }} />
                <MenuButton icon={<CalendarDays size={14} />} label="View Calendar" onClick={() => { onOpenCalendar(); setShowMenu(false); }} />
                <MenuButton icon={<Users size={14} />} label="Team Configuration" onClick={() => { onOpenTeam(); setShowMenu(false); }} />

                <div className="h-px bg-nb-outline-variant/30 my-1 mx-2" />

                {currentProject?.id !== "temporary" && (
                  <MenuButton icon={<Edit3 size={14} />} label="Rename Project" onClick={() => { onStartRename(); setShowMenu(false); }} />
                )}
                {githubUrl && (
                  <MenuButton icon={<GithubIcon size={14} />} label="Open in GitHub" onClick={() => { window.open(githubUrl, '_blank'); setShowMenu(false); }} />
                )}

                {(currentProject?.id !== "temporary" || githubUrl) && (
                  <div className="h-px bg-nb-outline-variant/30 my-1 mx-2" />
                )}


                <MenuButton icon={<Upload size={14} />} label="Import ENGen Data" onClick={() => { onImport(); setShowMenu(false); }} />
                <MenuButton icon={<Download size={14} />} label="Export ENGen Data" onClick={() => { onExport(); setShowMenu(false); }} />

                <div className="h-px bg-nb-outline-variant/30 my-1 mx-2" />

                <MenuButton icon={<HelpCircle size={14} />} label="Help & Documentation" onClick={() => { onOpenHelp(); setShowMenu(false); }} />
                <MenuButton icon={<ArrowLeftRight size={14} />} label="Change Workspace" onClick={() => { onDisconnect(); setShowMenu(false); }} />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 mr-2">
          {isSaving || isPendingSave ? (
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-nb-primary animate-pulse">
              <Loader2 size={12} className="animate-spin" />
              <span>SAVING...</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-nb-on-surface-variant/40">
              <Check size={12} />
              <span>SAVED</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuButton({ icon, label, onClick, color = "text-nb-on-surface-variant" }: { icon: React.ReactNode, label: string, onClick: () => void, color?: string }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2 text-sm font-bold text-nb-on-surface hover:bg-nb-surface-mid transition-colors cursor-pointer"
    >
      <div className={color}>{icon}</div>
      <span>{label}</span>
    </button>
  );
}
