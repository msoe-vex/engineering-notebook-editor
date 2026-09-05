import { events, EventNames } from "../events";
import { TeamTab } from "../types";
import { IWorkspaceStore } from "./types";

export class NavigationManager {
  private store: IWorkspaceStore;

  constructor(store: IWorkspaceStore) {
    this.store = store;
  }

  async handleUrlChange(url: URL = new URL(window.location.href)) {
    const path = url.pathname;
    if (path.startsWith('/workspace/calendar')) {
      this.store.showCalendar = true;
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

    if (path.startsWith('/workspace/compile')) {
      this.store.showCompiler = true;
    } else {
      this.store.showCompiler = false;
    }

    const params = url.searchParams;
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

  navigateTo(params: Record<string, string | null>, pathname?: string) {
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
      window.history.pushState({}, '', url.toString());
    }
    if (params.resource) {
      events.emit(EventNames.SCROLL_TO_RESOURCE, params.resource);
    }
    this.handleUrlChange(url);
  }
}
