"use client";

import { cloudApi } from "@/lib/cloud/api";
import { workspaceState } from "@/lib/cloud/workspaceState";
import {
  normalizeNotebookMetadata,
  type ProjectPhase,
  type TeamMetadata,
} from "@/lib/notebook/metadata";

export type CloudWorkspaceBridge = {
  orgId: string;
  notebookId: string;
  basePath: string;
  router: { push: (href: string) => void; replace: (href: string) => void };
  refresh: () => void;
};

let active: CloudWorkspaceBridge | null = null;

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function cloudSaveTeam(_team: TeamMetadata, phases?: Record<string, ProjectPhase>) {
  if (!active) return;
  const { orgId, notebookId, refresh } = active;
  const nextPhases = phases || workspaceState.metadata.phases || {};
  workspaceState.setMetadata(
    normalizeNotebookMetadata({
      ...workspaceState.metadata,
      phases: nextPhases,
    })
  );
  await cloudApi.patchNotebook(orgId, notebookId, { phases: nextPhases });
  refresh();
}

async function cloudReorderCalendarEntry(
  movedId: string,
  targetDate: string,
  dayIds: string[],
  toIndex: number
) {
  if (!active) return;
  const { orgId, notebookId, refresh } = active;
  workspaceState.applyCalendarMove(movedId, targetDate, dayIds, toIndex);

  const without = dayIds.filter((id) => id !== movedId);
  const insertAt = Math.max(0, Math.min(toIndex, without.length));
  without.splice(insertAt, 0, movedId);
  const date = targetDate === "__undated__" ? "" : targetDate;

  await cloudApi.reorderEntries(orgId, notebookId, {
    mode: "day",
    orderedIds: without,
    date,
  });
  refresh();
}

function cloudNavigateTo(
  params: Record<string, string | null>,
  pathname?: string,
  options?: { replace?: boolean }
) {
  if (!active) return;
  const { basePath, router } = active;
  const go = options?.replace ? router.replace.bind(router) : router.push.bind(router);
  const path = pathname || "";

  if (path.includes("/calendar") || path.includes("/schedule") || path.endsWith("calendar")) {
    const date = params.date || workspaceState.calendarCursor || todayYmd();
    const view =
      params.view === "week" ? "week" : params.view === "month" ? "month" : workspaceState.calendarMode || "month";
    workspaceState.setCalendar(date, view);
    go(`${basePath}/schedule?date=${encodeURIComponent(date)}&view=${view}`);
    return;
  }

  if (path.includes("/team") || path.includes("/setup") || path.includes("/members")) {
    if (path.includes("/members") || params.tab === "members") {
      go(`${basePath}/members`);
      return;
    }
    go(`${basePath}/setup`);
    return;
  }

  if (path.includes("/settings") || path === "/account") {
    go("/account");
    return;
  }

  if (path.includes("/compile")) {
    go(`${basePath}/compile`);
    return;
  }

  if (params.entry) {
    go(`${basePath}/entries/${params.entry}`);
    return;
  }

  if (params.entry === null) {
    go(basePath);
    return;
  }

  if (params.date || params.view) {
    const date = params.date || workspaceState.calendarCursor || todayYmd();
    const view =
      params.view === "week" ? "week" : params.view === "month" ? "month" : workspaceState.calendarMode || "month";
    workspaceState.setCalendar(date, view);
    go(`${basePath}/schedule?date=${encodeURIComponent(date)}&view=${view}`);
  }
}

function ensureHandlers() {
  workspaceState.installHandlers({
    navigateTo: cloudNavigateTo,
    reorderCalendarEntry: cloudReorderCalendarEntry,
    saveTeam: cloudSaveTeam,
  });
}

export function activateCloudWorkspaceBridge(ctx: CloudWorkspaceBridge) {
  ensureHandlers();
  active = ctx;
}

export function deactivateCloudWorkspaceBridge(ctx: CloudWorkspaceBridge) {
  if (active === ctx) active = null;
}

export function getCloudWorkspaceBridge() {
  return active;
}
