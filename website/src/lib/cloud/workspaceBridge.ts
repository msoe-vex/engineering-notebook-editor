"use client";

import { cloudApi } from "@/lib/cloud/api";
import { store } from "@/lib/store";
import {
  dehydrateTeamAssets,
  normalizeNotebookMetadata,
  type ProjectPhase,
  type TeamMetadata,
} from "@/lib/notebook/metadata";
import { moveEntryOnCalendar } from "@/lib/notebook/notebookSchema";
import type { TeamTab } from "@/lib/types";
import { getMimeTypeFromExtension } from "@/lib/utils";

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

async function cloudSaveTeam(team: TeamMetadata, phases?: Record<string, ProjectPhase>) {
  if (!active) return orig.saveTeam(team, phases);

  const { orgId, notebookId, refresh } = active;
  const { cleanTeam, newAssets } = await dehydrateTeamAssets(team);

  for (const asset of newAssets) {
    const contentType = getMimeTypeFromExtension(asset.path) || "application/octet-stream";
    const bin = atob(asset.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const { asset: created } = await cloudApi.createAsset(orgId, notebookId, {
      contentType,
      byteSize: bytes.byteLength,
    });
    await cloudApi.uploadAssetContent(orgId, notebookId, created.id, bytes, contentType);
    const dataUrl = `data:${contentType};base64,${asset.base64}`;
    store.assetCache.set(asset.path, dataUrl);
    store.assetCache.set(`cloud:${created.id}`, dataUrl);
  }

  const nextPhases = phases || store.metadata.phases || {};
  store.metadata = normalizeNotebookMetadata({
    ...store.metadata,
    team: cleanTeam,
    phases: nextPhases,
  });
  store.notifyStateChange();

  await cloudApi.patchNotebook(orgId, notebookId, {
    team: cleanTeam,
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

  if (path.includes("/calendar") || path.endsWith("calendar")) {
    const date = params.date || store.calendarCursor || todayYmd();
    const view = params.view === "week" ? "week" : params.view === "month" ? "month" : store.calendarMode || "month";
    store.calendarCursor = date;
    store.calendarMode = view;
    store.showCalendar = true;
    store.notifyStateChange();
    go(`${basePath}/calendar?date=${encodeURIComponent(date)}&view=${view}`);
    return;
  }

  if (path.includes("/team")) {
    const tab =
      (params.tab as string) ||
      path.split("/").pop() ||
      store.teamTab ||
      "identity";
    const safe = (["identity", "members", "phases"].includes(tab) ? tab : "identity") as TeamTab;
    store.teamTab = safe;
    store.showTeamEditor = true;
    store.notifyStateChange();
    go(`${basePath}/team/${safe}`);
    return;
  }

  if (path.includes("/settings")) {
    store.showSettings = true;
    store.notifyStateChange();
    go(`${basePath}/settings`);
    return;
  }

  if (path.includes("/compile")) {
    // Compiler deferred; stay on notebook root for now.
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

  // Date/view-only updates while already on calendar
  if (params.date || params.view) {
    const date = params.date || store.calendarCursor || todayYmd();
    const view =
      params.view === "week" ? "week" : params.view === "month" ? "month" : store.calendarMode || "month";
    store.calendarCursor = date;
    store.calendarMode = view;
    store.notifyStateChange();
    go(`${basePath}/calendar?date=${encodeURIComponent(date)}&view=${view}`);
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

/** Activate cloud persistence for TeamEditor / CalendarView while a notebook shell is mounted. */
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
