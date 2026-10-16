"use client";

import { events, EventNames } from "@/lib/events";
import {
  EMPTY_METADATA,
  hydrateTeamAssets,
  type NotebookMetadata,
  type ProjectPhase,
  type TeamMetadata,
} from "@/lib/notebook/metadata";
import { moveEntryOnCalendar } from "@/lib/notebook/notebookSchema";

/**
 * Thin in-browser workspace state for the cloud shell.
 * Replaces the legacy `@/lib/store` singleton (GitHub / local FS) for live routes.
 */
export type CloudNavigateParams = Record<string, string | null>;

type CloudHandlers = {
  navigateTo: (
    params: CloudNavigateParams,
    pathname?: string,
    options?: { replace?: boolean }
  ) => void;
  reorderCalendarEntry: (
    movedId: string,
    targetDate: string,
    dayIds: string[],
    toIndex: number
  ) => void | Promise<void>;
  saveTeam: (team: TeamMetadata, phases?: Record<string, ProjectPhase>) => void | Promise<void>;
};

const defaultNavigate: CloudHandlers["navigateTo"] = () => {
  /* installed by workspaceBridge when a notebook is open */
};

const handlers: CloudHandlers = {
  navigateTo: defaultNavigate,
  reorderCalendarEntry: async () => undefined,
  saveTeam: async () => undefined,
};

class CloudWorkspaceState {
  metadata: NotebookMetadata = EMPTY_METADATA;
  isInitialized = false;
  calendarMode: "month" | "week" = "month";
  calendarCursor = "";
  assetCache = new Map<string, string>();

  get hydratedMetadata(): NotebookMetadata {
    return {
      ...this.metadata,
      team: this.metadata.team
        ? hydrateTeamAssets(this.metadata.team, this.assetCache)
        : undefined,
    };
  }

  notifyStateChange() {
    events.emit(EventNames.STATE_CHANGED, this);
  }

  setMetadata(next: NotebookMetadata) {
    this.metadata = next;
    this.isInitialized = true;
    this.notifyStateChange();
  }

  setCalendar(cursor: string, mode: "month" | "week") {
    this.calendarCursor = cursor;
    this.calendarMode = mode;
    this.notifyStateChange();
  }

  installHandlers(next: Partial<CloudHandlers>) {
    Object.assign(handlers, next);
  }

  navigateTo(
    params: CloudNavigateParams,
    pathname?: string,
    options?: { replace?: boolean }
  ) {
    handlers.navigateTo(params, pathname, options);
  }

  async reorderCalendarEntry(
    movedId: string,
    targetDate: string,
    dayIds: string[],
    toIndex: number
  ) {
    await handlers.reorderCalendarEntry(movedId, targetDate, dayIds, toIndex);
  }

  async saveTeam(team: TeamMetadata, phases?: Record<string, ProjectPhase>) {
    await handlers.saveTeam(team, phases);
  }

  /** Optimistic calendar reorder against local densified metadata. */
  applyCalendarMove(
    movedId: string,
    targetDate: string,
    dayIds: string[],
    toIndex: number
  ) {
    this.metadata = moveEntryOnCalendar(
      this.metadata,
      movedId,
      targetDate,
      dayIds,
      toIndex
    );
    this.notifyStateChange();
  }
}

export const workspaceState = new CloudWorkspaceState();
