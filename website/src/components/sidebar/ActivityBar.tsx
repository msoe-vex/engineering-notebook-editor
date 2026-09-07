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
  LucideIcon
} from "lucide-react";
import { TeamTab } from "@/lib/types";

export type SidebarTab = "explorer" | "search" | "git";

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
          ? "bg-nb-primary/15 text-nb-primary border border-nb-primary/30 shadow-xs"
          : "text-nb-on-surface-variant hover:text-nb-on-surface hover:bg-nb-surface-high/60"
      }`}
    >
      <Icon size={18} className={`transition-transform duration-150 ${isActive ? "scale-105" : "group-hover:scale-110"}`} />
      
      {/* Pending Badge */}
      {typeof badge === "number" && badge > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-4 h-4 px-1 flex items-center justify-center text-[9px] font-black rounded-full shadow-sm bg-nb-tertiary text-white"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
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
}: ActivityBarProps) {
  return (
    <aside
      aria-label="Activity Bar"
      className="w-13 h-full flex flex-col items-center justify-between py-3 bg-nb-surface-lowest border-r border-nb-outline-variant/30 select-none z-20 shrink-0"
    >
      {/* Top Primary Navigation Tabs */}
      <div className="flex flex-col items-center gap-2">
        <TabButton
          icon={FolderTree}
          label="Explorer (Entries & Templates)"
          isActive={activeTab === "explorer"}
          onClick={() => onSelectTab("explorer")}
        />
        <TabButton
          icon={Search}
          label="Search (Titles, Authors, Metadata)"
          isActive={activeTab === "search"}
          onClick={() => onSelectTab("search")}
        />
        <TabButton
          icon={GitBranch}
          label="Source Control & Pending Changes"
          isActive={activeTab === "git"}
          onClick={() => onSelectTab("git")}
          badge={pendingCount}
        />
      </div>

      {/* Bottom Actions */}
      <div className="flex flex-col items-center gap-2">
        {onOpenCompile && (
          <button
            onClick={onOpenCompile}
            title="Compile Notebook (PDF)"
            aria-label="Compile Notebook (PDF)"
            className="w-10 h-10 flex items-center justify-center rounded-xl text-nb-on-surface-variant hover:text-nb-primary hover:bg-nb-primary/10 transition-all cursor-pointer group"
          >
            <Play size={18} className="group-hover:scale-110 transition-transform" />
          </button>
        )}

        <button
          onClick={() => onOpenTeam("identity")}
          title="Team & Project Settings"
          aria-label="Team & Project Settings"
          className="w-10 h-10 flex items-center justify-center rounded-xl text-nb-on-surface-variant hover:text-nb-on-surface hover:bg-nb-surface-high/60 transition-all cursor-pointer group"
        >
          <Users size={18} className="group-hover:scale-110 transition-transform" />
        </button>

        {onOpenCalendar && (
          <button
            onClick={onOpenCalendar}
            title="Calendar"
            aria-label="Calendar"
            className="w-10 h-10 flex items-center justify-center rounded-xl text-nb-on-surface-variant hover:text-nb-on-surface hover:bg-nb-surface-high/60 transition-all cursor-pointer group"
          >
            <CalendarDays size={18} className="group-hover:scale-110 transition-transform" />
          </button>
        )}

        {onOpenHelp && (
          <button
            onClick={onOpenHelp}
            title="Documentation & Help"
            aria-label="Documentation & Help"
            className="w-10 h-10 flex items-center justify-center rounded-xl text-nb-on-surface-variant hover:text-nb-on-surface hover:bg-nb-surface-high/60 transition-all cursor-pointer group"
          >
            <HelpCircle size={18} className="group-hover:scale-110 transition-transform" />
          </button>
        )}

        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            title="Settings"
            aria-label="Settings"
            className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all cursor-pointer group ${
              settingsActive
                ? "bg-nb-primary/15 text-nb-primary border border-nb-primary/30 shadow-xs"
                : "text-nb-on-surface-variant hover:text-nb-on-surface hover:bg-nb-surface-high/60"
            }`}
          >
            <Settings size={18} className="group-hover:scale-110 transition-transform" />
          </button>
        )}
      </div>
    </aside>
  );
}
