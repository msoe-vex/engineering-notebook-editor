"use client";

import { useCallback, useEffect, useState } from "react";
import { events, EventNames } from "@/lib/events";
import { workspaceState } from "@/lib/cloud/workspaceState";
import type { NotebookMetadata, ProjectPhase, TeamMetadata } from "@/lib/notebook/metadata";

/** Subscribe to densified notebook metadata + calendar UI state for cloud routes. */
export function useCloudWorkspace() {
  const [snapshot, setSnapshot] = useState(() => ({
    metadata: workspaceState.hydratedMetadata,
    calendarMode: workspaceState.calendarMode,
    calendarCursor: workspaceState.calendarCursor,
    isInitialized: workspaceState.isInitialized,
  }));

  useEffect(() => {
    const sync = () => {
      setSnapshot({
        metadata: workspaceState.hydratedMetadata,
        calendarMode: workspaceState.calendarMode,
        calendarCursor: workspaceState.calendarCursor,
        isInitialized: workspaceState.isInitialized,
      });
    };
    sync();
    return events.on(EventNames.STATE_CHANGED, sync);
  }, []);

  const navigateTo = useCallback(
    (params: Record<string, string | null>, path?: string, options?: { replace?: boolean }) =>
      workspaceState.navigateTo(params, path, options),
    []
  );

  const reorderCalendarEntry = useCallback(
    (movedId: string, targetDate: string, dayIds: string[], toIndex: number) =>
      workspaceState.reorderCalendarEntry(movedId, targetDate, dayIds, toIndex),
    []
  );

  const saveTeam = useCallback(
    (team: TeamMetadata, phases?: Record<string, ProjectPhase>) =>
      workspaceState.saveTeam(team, phases),
    []
  );

  return {
    ...snapshot,
    navigateTo,
    reorderCalendarEntry,
    saveTeam,
  };
}

export type { NotebookMetadata };
