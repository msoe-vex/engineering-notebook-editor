"use client";

import { cloudApi } from "@/lib/cloud/api";
import { store } from "@/lib/store";
import {
  normalizeNotebookMetadata,
  type ProjectPhase,
  type TeamMetadata,
} from "@/lib/notebook/metadata";
import { moveEntryOnCalendar } from "@/lib/notebook/notebookSchema";

export type CloudWorkspaceBridge = {
  orgId: string;
  notebookId: string;
  basePath: string;
  router: { push: (href: string) => void; replace: (href: string) => void };
  refresh: () => void;
};

let active: CloudWorkspaceBridge | null = null;
let installed = false;

const orig = {
  saveTeam: store.saveTeam.bind(store),
  reorderCalendarEntry: store.reorderCalendarEntry.bind(store),
  navigateTo: store.navigateTo.bind(store),
  setPendingSave: store.setPendingSave.bind(store),
};

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Persist notebook phases only (legacy TeamEditor roster no longer maps to notebook.team). */
async function cloudSaveTeam(_team: TeamMetadata, phases?: Record<string, ProjectPhase>) {
  if (!active) return orig.saveTeam(_team, phases);

  const { orgId, notebookId, refresh } = active;
  const nextPhases = phases || store.metadata.phases || {};
  store.metadata = normalizeNotebookMetadata({
    ...store.metadata,
    phases: nextPhases,
  });
  store.notifyStateChange();

  await cloudApi.patchNotebook(orgId, notebookId, {
    phases: nextPhases,
  });
  refresh();
}

async function cloudReorderCalendarEntry(
  movedId: string,
  targetDate: string,
  dayIds: string[],
  toIndex: number
) {
  if (!active) return orig.reorderCalendarEntry(movedId, targetDate, dayIds, toIndex);

  const { orgId, notebookId, refresh } = active;
  const next = moveEntryOnCalendar(store.metadata, movedId, targetDate, dayIds, toIndex);
  store.metadata = next;
  store.notifyStateChange();

  const patches = Object.entries(next.entries).map(([id, e]) =>
    cloudApi.patchEntry(orgId, notebookId, id, {
      date: e.date,
      order: e.order,
    })
  );
  await Promise.all(patches);
  refresh();
}

function cloudNavigateTo(
  params: Record<string, string | null>,
  pathname?: string,
  options?: { replace?: boolean }
) {
  if (!active) return orig.navigateTo(params, pathname, options);

  const { basePath, router } = active;
  const go = options?.replace ? router.replace.bind(router) : router.push.bind(router);
  const path = pathname || "";

  if (path.includes("/calendar") || path.includes("/schedule") || path.endsWith("calendar")) {
    const date = params.date || store.calendarCursor || todayYmd();
    const view =
      params.view === "week" ? "week" : params.view === "month" ? "month" : store.calendarMode || "month";
    store.calendarCursor = date;
    store.calendarMode = view;
    store.showCalendar = true;
    store.notifyStateChange();
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
    store.showSettings = true;
    store.notifyStateChange();
    go("/account");
    return;
  }

  if (path.includes("/compile")) {
    go(basePath);
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
    const date = params.date || store.calendarCursor || todayYmd();
    const view =
      params.view === "week" ? "week" : params.view === "month" ? "month" : store.calendarMode || "month";
    store.calendarCursor = date;
    store.calendarMode = view;
    store.notifyStateChange();
    go(`${basePath}/schedule?date=${encodeURIComponent(date)}&view=${view}`);
  }
}

function ensureInstalled() {
  if (installed) return;
  installed = true;
  store.saveTeam = cloudSaveTeam;
  store.reorderCalendarEntry = cloudReorderCalendarEntry;
  store.navigateTo = cloudNavigateTo;
  store.setPendingSave = (val: boolean) => {
    if (active) {
      store.isPendingSave = val;
      store.notifyStateChange();
      return;
    }
    orig.setPendingSave(val);
  };
}

export function activateCloudWorkspaceBridge(ctx: CloudWorkspaceBridge) {
  ensureInstalled();
  active = ctx;
}

export function deactivateCloudWorkspaceBridge(ctx: CloudWorkspaceBridge) {
  if (active === ctx) active = null;
}

export function getCloudWorkspaceBridge() {
  return active;
}
