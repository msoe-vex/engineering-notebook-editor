import { events, EventNames } from "../events";
import { TeamTab } from "../types";
import { IWorkspaceStore } from "./types";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseMonthParam(value: string | null): Date | null {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDayParam(value: string | null): Date | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export class NavigationManager {
  private store: IWorkspaceStore;

  constructor(store: IWorkspaceStore) {
    this.store = store;
  }

  async handleUrlChange(url: URL = new URL(window.location.href)) {
    const path = url.pathname;
    const params = url.searchParams;

    if (path.startsWith('/workspace/calendar')) {
      this.store.showCalendar = true;
      const dateParam = parseDayParam(params.get("date"));
      const weekDate = parseDayParam(params.get("week"));
      const monthDate = parseMonthParam(params.get("month"));
      const viewParam = params.get("view");
      const now = new Date();

      if (dateParam) {
        this.store.calendarCursor = toYmd(dateParam);
        this.store.calendarMode = viewParam === "week" ? "week" : "month";
      } else if (weekDate) {
        this.store.calendarMode = "week";
        this.store.calendarCursor = toYmd(weekDate);
      } else if (monthDate) {
        this.store.calendarMode = "month";
        this.store.calendarCursor = toYmd(monthDate);
      } else {
        this.store.calendarMode = "month";
        this.store.calendarCursor = toYmd(now);
      }

      const nextDate = this.store.calendarCursor;
      const nextView = this.store.calendarMode;
      if (
        params.get("date") !== nextDate ||
        params.get("view") !== nextView ||
        params.has("month") ||
        params.has("week")
      ) {
        url.searchParams.set("date", nextDate);
        url.searchParams.set("view", nextView);
        url.searchParams.delete("month");
        url.searchParams.delete("week");
        window.history.replaceState({}, "", url.toString());
      }
    } else {
      this.store.showCalendar = false;
    }

    if (path.startsWith('/workspace/team')) {
      this.store.showTeamEditor = true;
      const tab = path.split('/').pop() as TeamTab;
      this.store.teamTab = ["identity", "members", "phases"].includes(tab) ? tab : "identity";
    } else {
      this.store.showTeamEditor = false;
    }

    if (path.startsWith('/help') || path.startsWith('/workspace/help')) {
      this.store.showHelp = true;
      this.store.helpPath = path;
    } else {
      this.store.showHelp = false;
      this.store.helpPath = null;
    }

    if (path === '/about' || path === '/workspace/about') {
      this.store.showAbout = true;
    } else {
      this.store.showAbout = false;
    }

    if (path === '/settings' || path === '/workspace/settings') {
      this.store.showSettings = true;
    } else {
      this.store.showSettings = false;
    }

    if (path.startsWith('/workspace/compile')) {
      this.store.showCompiler = true;
    } else {
      this.store.showCompiler = false;
    }

    this.store.hasEntryInUrl = params.has("entry");
    const projectId = params.get("project");
    const entryId = params.get("entry");
    const resourceId = params.get("resource");

    if (projectId && projectId !== this.store.currentProjectId) {
      await this.store.selectProject(projectId);
    } else if (!projectId) {
      await this.store.disconnect();
    }

    if (entryId && (!this.store.openFile || this.store.openFile.id !== entryId)) {
      await this.store.openEntry(entryId);
    } else if (!entryId) {
      this.store.openFile = null;
    }

    if (resourceId) {
      events.emit(EventNames.SCROLL_TO_RESOURCE, resourceId);
    }

    // Ensure the URL matches the state if we're in a workspace
    if (this.store.currentProjectId) {
      const url = new URL(window.location.href);
      if (url.searchParams.get('project') !== this.store.currentProjectId) {
        url.searchParams.set('project', this.store.currentProjectId);
        window.history.replaceState({}, '', url.toString());
      }
    }

    this.store.notifyStateChange();
  }

  setSelectedPaths(pathsOrUpdater: Set<string> | ((prev: Set<string>) => Set<string>)) {
    if (typeof pathsOrUpdater === "function") {
      this.store.selectedPaths = pathsOrUpdater(this.store.selectedPaths);
    } else {
      this.store.selectedPaths = pathsOrUpdater;
    }
    this.store.notifyStateChange();
  }

  navigateTo(params: Record<string, string | null>, pathname?: string, options?: { replace?: boolean }) {
    const url = new URL(window.location.href);
    if (pathname) url.pathname = pathname;

    // Preserve current project if not specified and not navigating to root
    if (this.store.currentProjectId && !params.project && url.pathname !== '/') {
      url.searchParams.set('project', this.store.currentProjectId);
    }

    // Clear resource if changing entry and no new resource specified
    if (params.entry && !params.resource) {
      url.searchParams.delete('resource');
    }

    for (const [k, v] of Object.entries(params)) {
      if (v === null) url.searchParams.delete(k);
      else url.searchParams.set(k, v);
    }
    if (window.location.href !== url.toString()) {
      if (options?.replace) window.history.replaceState({}, '', url.toString());
      else window.history.pushState({}, '', url.toString());
    }
    if (params.resource) {
      events.emit(EventNames.SCROLL_TO_RESOURCE, params.resource);
    }
    this.handleUrlChange(url);
  }
}
