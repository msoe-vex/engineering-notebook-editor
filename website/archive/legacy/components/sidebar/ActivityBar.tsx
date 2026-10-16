"use client";

import React from "react";
import {
  FolderTree,
  Search,
  GitBranch,
  Users,
  HelpCircle,
  Play,
  Settings,
  CalendarDays,
  LucideIcon,
} from "lucide-react";
import { TeamTab } from "@/lib/types";

export type SidebarTab = "explorer" | "search" | "git";

export type WorkspaceMode = "entries" | "team" | "calendar" | "settings" | null;

interface ActivityBarProps {
  activeTab: SidebarTab;
  onSelectTab: (tab: SidebarTab) => void;
  pendingCount?: number;
  onOpenTeam: (tab?: TeamTab) => void;
  onOpenCalendar?: () => void;
  onOpenCompile?: () => void;
  onOpenHelp?: () => void;
  onOpenSettings?: () => void;
  settingsActive?: boolean;
  /** When set, highlight Team / Calendar / Settings from route. */
  workspaceMode?: WorkspaceMode;
  /** Cloud product: hide Git (live sync). */
  hideGit?: boolean;
  footer?: React.ReactNode;
}

interface TabButtonProps {
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  onClick: () => void;
  badge?: number;
}

function TabButton({ icon: Icon, label, isActive, onClick, badge }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`relative w-10 h-10 flex items-center justify-center rounded-xl transition-all group cursor-pointer ${
        isActive
          ? "bg-nb-primary/15 text-nb-primary border border-nb-primary/30 shadow-nb-xs"
          : "text-nb-on-surface-variant hover:text-nb-on-surface hover:bg-nb-surface-high/60"
      }`}
    >
      <Icon
        size={18}
        className={`transition-transform duration-150 ${isActive ? "scale-105" : "group-hover:scale-110"}`}
      />
      {typeof badge === "number" && badge > 0 && (
        <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 flex items-center justify-center text-[9px] font-black rounded-full shadow-nb-sm bg-nb-tertiary text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

function modeButtonClass(active: boolean) {
  return `w-10 h-10 flex items-center justify-center rounded-xl transition-all cursor-pointer group ${
    active
      ? "bg-nb-primary/15 text-nb-primary border border-nb-primary/30 shadow-nb-xs"
      : "text-nb-on-surface-variant hover:text-nb-on-surface hover:bg-nb-surface-high/60"
  }`;
}

export default function ActivityBar({
  activeTab,
  onSelectTab,
  pendingCount = 0,
  onOpenTeam,
  onOpenCalendar,
  onOpenCompile,
  onOpenHelp,
  onOpenSettings,
  settingsActive = false,
  workspaceMode = null,
  hideGit = false,
  footer,
}: ActivityBarProps) {
  const teamActive = workspaceMode === "team";
  const calendarActive = workspaceMode === "calendar";
  const settingsIsActive = settingsActive || workspaceMode === "settings";
  const explorerActive =
    activeTab === "explorer" && (!workspaceMode || workspaceMode === "entries");
  const searchActive = activeTab === "search" && (!workspaceMode || workspaceMode === "entries");

  return (
    <aside
      aria-label="Activity Bar"
      className="w-13 h-full flex flex-col items-center justify-between py-3 bg-nb-surface-lowest border-r border-nb-outline-variant/30 select-none z-20 shrink-0"
    >
      <div className="flex flex-col items-center gap-2">
        <TabButton
          icon={FolderTree}
          label="Explorer (Entries & Templates)"
          isActive={explorerActive}
          onClick={() => onSelectTab("explorer")}
        />
        <TabButton
          icon={Search}
          label="Search (Titles, Authors, Metadata)"
          isActive={searchActive}
          onClick={() => onSelectTab("search")}
        />
        {!hideGit && (
          <TabButton
            icon={GitBranch}
            label="Source Control & Pending Changes"
            isActive={activeTab === "git"}
            onClick={() => onSelectTab("git")}
            badge={pendingCount}
          />
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        {onOpenCompile && (
          <button
            onClick={onOpenCompile}
            title="Compile Notebook (PDF)"
            aria-label="Compile Notebook (PDF)"
            className={modeButtonClass(false)}
          >
            <Play size={18} className="group-hover:scale-110 transition-transform" />
          </button>
        )}

        <button
          onClick={() => onOpenTeam("identity")}
          title="Team settings"
          aria-label="Team settings"
          className={modeButtonClass(teamActive)}
        >
          <Users size={18} className="group-hover:scale-110 transition-transform" />
        </button>

        {onOpenCalendar && (
          <button
            onClick={onOpenCalendar}
            title="Calendar"
            aria-label="Calendar"
            className={modeButtonClass(calendarActive)}
          >
            <CalendarDays size={18} className="group-hover:scale-110 transition-transform" />
          </button>
        )}

        {onOpenHelp && (
          <button
            onClick={onOpenHelp}
            title="Documentation & Help"
            aria-label="Documentation & Help"
            className={modeButtonClass(false)}
          >
            <HelpCircle size={18} className="group-hover:scale-110 transition-transform" />
          </button>
        )}

        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            title="Settings"
            aria-label="Settings"
            className={modeButtonClass(settingsIsActive)}
          >
            <Settings size={18} className="group-hover:scale-110 transition-transform" />
          </button>
        )}

        {footer}
      </div>
    </aside>
  );
}
