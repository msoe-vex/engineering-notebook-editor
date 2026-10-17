"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { saveAs } from "file-saver";
import {
  NOTEBOOK_SCHEMA_VERSION,
  type EntryMetadataV5,
  type NotebookSummaryV5,
} from "@engineering-notebook/shared";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import TextPromptDialog from "@/components/dialogs/TextPromptDialog";
import { Button, Dialog, EmptyState, LoadingBlock, Skeleton, SkeletonLines } from "@/components/ui";
import { showNotification } from "@/components/overlays/Notification";
import { cloudApi } from "@/lib/cloud/api";
import { formatCloudError, isForbiddenError, isNotFoundError } from "@/lib/cloud/errors";
import { ShareNotebookDialog } from "./ShareNotebookDialog";
import {
  subscribeNotebookEvents,
  type NotebookRealtimeEvent,
} from "@/lib/cloud/notebookEvents";
import {
  collectAssetIdsFromTipTap,
  remapIdList,
  remapTipTapAssetIds,
} from "@/lib/cloud/zipAssets";
import { exportNotebookZipV5, importNotebookZip, type ZipAssetBlob } from "@/lib/cloud/zipV5";
import {
  activateCloudWorkspaceBridge,
  deactivateCloudWorkspaceBridge,
} from "@/lib/cloud/workspaceBridge";
import { setWorkspaceHeader } from "@/lib/cloud/workspaceHeaderStore";
import { runNotebookAudit } from "@/lib/genai/auditJudge";
import { workspaceState } from "@/lib/cloud/workspaceState";
import type { NotebookMetadata } from "@/lib/notebook/metadata";
import { NotebookEntryList } from "./NotebookEntryList";
import { NotebookWorkspaceProvider } from "./NotebookWorkspaceContext";
import type { EntryMeta } from "./notebook-types";

function entryFromRealtime(raw: Record<string, unknown>): EntryMeta {
  return {
    title: String(raw.title ?? ""),
    folderId: (raw.folderId as string | null | undefined) ?? null,
    order: Number(raw.order ?? 0),
    explorerOrder:
      raw.explorerOrder !== undefined ? Number(raw.explorerOrder) : undefined,
    date: String(raw.date ?? ""),
    phase: (raw.phase as string | null | undefined) ?? null,
    authors: Array.isArray(raw.authors) ? (raw.authors as string[]) : [],
    assetIds: Array.isArray(raw.assetIds) ? (raw.assetIds as string[]) : undefined,
    isTemplate: Boolean(raw.isTemplate),
    isValid: raw.isValid as boolean | undefined,
    validationErrors: Array.isArray(raw.validationErrors)
      ? (raw.validationErrors as string[])
      : undefined,
    createdAt: raw.createdAt ? String(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : undefined,
  };
}

type ConfirmState = {
  title: string;
  message: string;
  variant: "danger" | "warning" | "info";
  onConfirm: () => void;
} | null;

type PromptState = {
  title: string;
  label?: string;
  initialValue: string;
  onConfirm: (value: string) => void;
} | null;

const SUBNAV = [
  {
    id: "entries",
    label: "Entries",
    match: (p: string) =>
      !p.includes("/schedule") &&
      !p.includes("/members") &&
      !p.includes("/setup") &&
      !p.includes("/team") &&
      !p.includes("/calendar") &&
      !p.includes("/compile"),
  },
  { id: "schedule", label: "Calendar", match: (p: string) => p.includes("/schedule") || p.includes("/calendar") },
  { id: "compile", label: "Compile", match: (p: string) => p.includes("/compile") },
  { id: "members", label: "Contributors", match: (p: string) => p.includes("/members") || p.includes("/contributors") },
  { id: "setup", label: "Settings", match: (p: string) => p.includes("/setup") || p.includes("/team") || p.includes("/settings") },
] as const;

export function NotebookShell({ children }: { children: ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const orgId = String(params.orgId);
  const notebookId = String(params.notebookId);
  const basePath = `/orgs/${orgId}/notebooks/${notebookId}`;
  const activeEntryId = pathname.includes("/entries/")
    ? pathname.split("/entries/")[1]?.split("/")[0] ?? null
    : null;
  const showEntryList = SUBNAV[0].match(pathname || "");

  const [notebookName, setNotebookName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [notebookSummary, setNotebookSummary] = useState<NotebookSummaryV5 | null>(null);
  const [folders, setFolders] = useState<
    Record<string, { name: string; parentId: string | null; order: number }>
  >({});
  const [entries, setEntries] = useState<Record<string, EntryMeta>>({});
  const [assets, setAssets] = useState<Awaited<ReturnType<typeof cloudApi.listAssets>>>([]);
  const [error, setErrorState] = useState<string | null>(null);
  const [notebookUnavailable, setNotebookUnavailable] = useState(false);
  const [auditResult, setAuditResult] = useState<string | null>(null);
  const [auditHistory, setAuditHistory] = useState<
    Awaited<ReturnType<typeof cloudApi.listAudits>> | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  /** Action/load errors → toast (no sticky banner). Keep `error` in context for rare inline use. */
  const setError = useCallback((message: string | null) => {
    setErrorState(message);
    if (message) showNotification(formatCloudError(message), "error");
  }, []);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [prompt, setPrompt] = useState<PromptState>(null);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  function refresh() {
    setReloadToken((n) => n + 1);
  }

  const showConfirm = useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => void,
      variant: "danger" | "warning" | "info" = "danger"
    ) => {
      setConfirm({ title, message, variant, onConfirm });
    },
    []
  );

  const showPrompt = useCallback(
    (title: string, initialValue: string, onConfirm: (value: string) => void, label?: string) => {
      setPrompt({ title, initialValue, onConfirm, label });
    },
    []
  );

  // Hard reset chrome only when switching notebooks (not on soft refresh / SSE).
  useEffect(() => {
    setInitialLoaded(false);
    setNotebookUnavailable(false);
  }, [orgId, notebookId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      void (async () => {
        try {
          const [nb, entryRes, assetList, org] = await Promise.all([
            cloudApi.getNotebook(orgId, notebookId),
            cloudApi.listEntries(orgId, notebookId),
            cloudApi.listAssets(orgId, notebookId).catch(() => [] as typeof assets),
            cloudApi.getOrg(orgId).catch(() => null),
          ]);
          if (cancelled) return;
          setNotebookName(nb.title || nb.name);
          if (org?.name) setOrgName(org.name);
          setFolders(nb.folders ?? {});
          setEntries(entryRes.entries);
          setAssets(assetList);
          setNotebookSummary({
            schemaVersion: NOTEBOOK_SCHEMA_VERSION,
            orgId,
            name: nb.name,
            title: nb.title,
            subtitle: nb.subtitle,
            logoAssetId: nb.logoAssetId,
            folders: nb.folders ?? {},
            access: nb.access,
            phases: nb.phases as NotebookSummaryV5["phases"],
            lastCompiled: nb.lastCompiled,
            createdAt: nb.createdAt,
            updatedAt: nb.updatedAt ?? new Date().toISOString(),
          });
          setNotebookUnavailable(false);
          setErrorState(null);
        } catch (err) {
          if (cancelled) return;
          setNotebookSummary(null);
          setEntries({});
          setFolders({});
          setAssets([]);
          setNotebookUnavailable(true);
          setErrorState(formatCloudError(err, "Notebook unavailable"));
          // No toast on missing/forbidden notebook — EmptyState is the UI.
          if (!isNotFoundError(err) && !isForbiddenError(err)) {
            showNotification(formatCloudError(err), "error");
          }
        } finally {
          if (!cancelled) setInitialLoaded(true);
        }
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [orgId, notebookId, reloadToken]);

  useEffect(() => {
    if (!initialLoaded || notebookUnavailable) return;
    const ac = new AbortController();
    const onEvent = (event: NotebookRealtimeEvent) => {
      if (event.type === "ping") return;
      if (event.type === "entry.upserted") {
        const next = entryFromRealtime(event.entry);
        setEntries((prev) => ({ ...prev, [event.entryId]: next }));
        return;
      }
      if (event.type === "entry.deleted") {
        setEntries((prev) => {
          if (!(event.entryId in prev)) return prev;
          const copy = { ...prev };
          delete copy[event.entryId];
          return copy;
        });
        return;
      }
      if (event.type === "notebook.updated") {
        const nb = event.notebook;
        setNotebookSummary((prev) => {
          if (!prev) return prev;
          const next = { ...prev };
          if (nb.name !== undefined) next.name = String(nb.name);
          if (nb.title !== undefined) next.title = String(nb.title);
          if (nb.subtitle !== undefined) next.subtitle = nb.subtitle as string | undefined;
          if (nb.logoAssetId !== undefined) {
            next.logoAssetId = nb.logoAssetId as string | undefined;
          }
          if (nb.folders !== undefined) {
            next.folders = nb.folders as NotebookSummaryV5["folders"];
          }
          if (nb.access !== undefined) {
            next.access = nb.access as NotebookSummaryV5["access"];
          }
          if (nb.phases !== undefined) {
            next.phases = nb.phases as NotebookSummaryV5["phases"];
          }
          if (nb.lastCompiled !== undefined) {
            next.lastCompiled = nb.lastCompiled as string | undefined;
          }
          next.updatedAt = String(nb.updatedAt ?? prev.updatedAt);
          return next;
        });
        if (nb.name !== undefined || nb.title !== undefined) {
          setNotebookName(String(nb.title || nb.name || ""));
        }
        if (nb.folders !== undefined) {
          setFolders(
            nb.folders as Record<
              string,
              { name: string; parentId: string | null; order: number }
            >
          );
        }
        return;
      }
      if (event.type === "entries.changed") {
        // Soft refetch entry list — do not bump reloadToken (that flashed the full shell).
        void cloudApi
          .listEntries(orgId, notebookId)
          .then((res) => {
            if (!ac.signal.aborted) setEntries(res.entries);
          })
          .catch(() => {
            /* keep current */
          });
      }
    };
    subscribeNotebookEvents(orgId, notebookId, onEvent, ac.signal);
    return () => ac.abort();
  }, [orgId, notebookId, initialLoaded, notebookUnavailable]);

  const notebookMetadata: NotebookMetadata = useMemo(
    () => ({
      version: 5,
      entries: Object.fromEntries(
        Object.entries(entries).map(([id, e]) => [
          id,
          {
            title: e.title,
            authors: e.authors ?? [],
            phase: e.phase,
            createdAt: e.createdAt ?? "",
            updatedAt: e.updatedAt ?? "",
            date: e.date,
            filename: id,
            order: e.order,
            isTemplate: e.isTemplate,
          },
        ])
      ),
      phases: (notebookSummary?.phases as NotebookMetadata["phases"]) || {},
      team: {
        teamName: "",
        teamNumber: "",
        organization: "",
        members: {},
      },
    }),
    [entries, notebookSummary]
  );

  useEffect(() => {
    workspaceState.setMetadata(notebookMetadata);
  }, [notebookMetadata]);

  useEffect(() => {
    const bridge = {
      orgId,
      notebookId,
      basePath,
      router: { push: router.push.bind(router), replace: router.replace.bind(router) },
      refresh,
    };
    activateCloudWorkspaceBridge(bridge);
    return () => deactivateCloudWorkspaceBridge(bridge);
  }, [orgId, notebookId, basePath, router]);

  async function handleExportZip() {
    setBusy(true);
    setError(null);
    try {
      const tipTapByEntryId: Record<string, unknown> = {};
      const entryMeta: Record<string, EntryMetadataV5> = {};
      const assetIds = new Set<string>();

      for (const [id, meta] of Object.entries(entries)) {
        entryMeta[id] = {
          title: meta.title,
          authors: meta.authors ?? [],
          phase: meta.phase,
          createdAt: meta.createdAt ?? new Date().toISOString(),
          updatedAt: meta.updatedAt ?? new Date().toISOString(),
          date: meta.date,
          folderId: meta.folderId,
          order: meta.order,
          explorerOrder: meta.explorerOrder,
          isTemplate: meta.isTemplate,
          assetIds: meta.assetIds,
          resources: undefined,
          references: undefined,
        };
        for (const aid of meta.assetIds || []) assetIds.add(aid);
        try {
          const doc = await cloudApi.getEntryContent(orgId, notebookId, id);
          tipTapByEntryId[id] = doc;
          collectAssetIdsFromTipTap(doc, assetIds);
        } catch {
          tipTapByEntryId[id] = { type: "doc", content: [] };
        }
      }

      const membersList = await cloudApi.listNotebookMembers(orgId, notebookId).catch(() => []);
      const membersMap = Object.fromEntries(
        membersList.map((m) => [
          m.id,
          {
            name: m.name,
            role: m.role,
            order: m.order,
            imageAssetId: m.imageAssetId,
            linkedUid: m.linkedUid,
          },
        ])
      );
      for (const m of membersList) {
        if (m.imageAssetId) assetIds.add(m.imageAssetId);
      }

      const summary: NotebookSummaryV5 = {
        ...(notebookSummary ?? {
          schemaVersion: NOTEBOOK_SCHEMA_VERSION,
          orgId,
          name: notebookName,
          folders,
          updatedAt: new Date().toISOString(),
        }),
        folders: notebookSummary?.folders ?? folders,
        logoAssetId: notebookSummary?.logoAssetId,
        phases: notebookSummary?.phases,
        access: notebookSummary?.access,
      };
      if (summary.logoAssetId) assetIds.add(summary.logoAssetId);

      // Prefer listed assets; also pull any referenced ids not in the list.
      const assetBlobs: Record<string, ZipAssetBlob> = {};
      const listed = new Map(assets.map((a) => [a.id, a]));
      for (const assetId of assetIds) {
        try {
          const { url, asset } = await cloudApi.getAssetUrl(orgId, notebookId, assetId);
          const res = await fetch(url);
          if (!res.ok) continue;
          const bytes = new Uint8Array(await res.arrayBuffer());
          assetBlobs[assetId] = {
            bytes,
            contentType:
              asset.contentType || listed.get(assetId)?.contentType || res.headers.get("content-type") || undefined,
          };
        } catch (err) {
          console.warn("ZIP export skipped asset", assetId, err);
        }
      }

      const blob = await exportNotebookZipV5({
        summary,
        entries: entryMeta,
        tipTapByEntryId,
        members: membersMap,
        assets: assetBlobs,
      });
      saveAs(blob, `${notebookName.replace(/\s+/g, "-").toLowerCase() || "notebook"}.v5.zip`);
      showNotification("Notebook exported", "success");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleImportZip(file: File) {
    setBusy(true);
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const {
        summary,
        entries: imported,
        tipTapByEntryId,
        members: importedMembers,
        assets: importedAssets,
      } = await importNotebookZip(buf, orgId, notebookName);

      // Re-upload binaries → new asset ids (always remap so TipTap / logo / roster stay consistent).
      const assetIdMap = new Map<string, string>();
      for (const [oldId, blob] of Object.entries(importedAssets)) {
        try {
          const contentType = blob.contentType || "application/octet-stream";
          const { asset } = await cloudApi.createAsset(orgId, notebookId, {
            contentType,
            byteSize: blob.bytes.byteLength,
          });
          await cloudApi.uploadAssetContent(
            orgId,
            notebookId,
            asset.id,
            blob.bytes,
            contentType
          );
          assetIdMap.set(oldId, asset.id);
        } catch (err) {
          console.warn("ZIP import skipped asset", oldId, err);
        }
      }

      const remapAsset = (id?: string | null) =>
        id ? assetIdMap.get(id) ?? id : undefined;

      await cloudApi.patchNotebook(orgId, notebookId, {
        name: summary.name || notebookName,
        title: summary.title,
        subtitle: summary.subtitle,
        logoAssetId: remapAsset(summary.logoAssetId),
        folders: summary.folders,
        access: summary.access,
        phases: summary.phases,
      });

      for (const [, m] of Object.entries(importedMembers)) {
        try {
          await cloudApi.createNotebookMember(orgId, notebookId, {
            name: m.name,
            role: m.role,
            order: m.order,
            imageAssetId: remapAsset(m.imageAssetId),
            linkedUid: m.linkedUid,
          });
        } catch {
          /* ignore duplicates / ACL */
        }
      }

      for (const [id, meta] of Object.entries(imported)) {
        const assetIds = remapIdList(meta.assetIds, assetIdMap);
        try {
          await cloudApi.patchEntry(orgId, notebookId, id, {
            title: meta.title,
            authors: meta.authors,
            phase: meta.phase,
            date: meta.date,
            folderId: meta.folderId,
            order: meta.order,
            explorerOrder: meta.explorerOrder,
            isTemplate: meta.isTemplate,
            assetIds,
            resources: meta.resources,
            references: meta.references,
          });
        } catch {
          await cloudApi.createEntry(orgId, notebookId, {
            id,
            title: meta.title,
            folderId: meta.folderId,
            order: meta.order,
            explorerOrder: meta.explorerOrder,
            date: meta.date,
            phase: meta.phase,
            authors: meta.authors,
            isTemplate: meta.isTemplate,
          });
          if (assetIds?.length) {
            await cloudApi.patchEntry(orgId, notebookId, id, { assetIds }).catch(() => undefined);
          }
        }
        const rawDoc = tipTapByEntryId[id];
        if (rawDoc !== undefined) {
          const doc = remapTipTapAssetIds(rawDoc, assetIdMap);
          await cloudApi.putEntryContent(orgId, notebookId, id, doc);
        }
      }
      refresh();
      showNotification("Notebook imported", "success");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const exportZipRef = useRef(handleExportZip);
  exportZipRef.current = handleExportZip;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const activeNav = SUBNAV.find((t) => t.match(pathname || ""))?.id ?? "entries";

  const navItems = useMemo(
    () =>
      SUBNAV.map((item) => ({
        id: item.id,
        label: item.label,
        href:
          item.id === "entries"
            ? basePath
            : item.id === "schedule"
              ? `${basePath}/schedule`
              : item.id === "compile"
                ? `${basePath}/compile`
                : item.id === "members"
                  ? `${basePath}/members`
                  : `${basePath}/setup`,
      })),
    [basePath]
  );

  useEffect(() => {
    setWorkspaceHeader({
      orgId,
      notebookId,
      orgName,
      notebookName,
      navItems: notebookUnavailable ? [] : navItems,
      activeNavId: activeNav,
      menuItems: notebookUnavailable
        ? []
        : [
            {
              id: "rename",
              label: "Rename notebook",
              onSelect: () =>
                showPrompt("Rename notebook", notebookName, (next) => {
                  void cloudApi
                    .patchNotebook(orgId, notebookId, { name: next, title: next })
                    .then(refresh)
                    .catch((err) => setError((err as Error).message));
                }),
            },
            {
              id: "share",
              label: "Share…",
              onSelect: () => setShareOpen(true),
            },
            {
              id: "export",
              label: "Export ZIP",
              onSelect: () => {
                if (!busyRef.current) void exportZipRef.current();
              },
            },
            {
              id: "import",
              label: "Import ZIP",
              onSelect: () => {
                if (!busyRef.current) importRef.current?.click();
              },
            },
            {
              id: "audit",
              label: "Run audit",
              onSelect: () => {
                if (busyRef.current) return;
                setBusy(true);
                setAuditResult("Starting audit…");
                void runNotebookAudit(orgId, notebookId, {
                  onProgress: (a) => {
                    const last = a.steps?.[a.steps.length - 1]?.message;
                    setAuditResult(
                      [
                        `status: ${a.status ?? "running"}`,
                        last ? `step: ${last}` : null,
                        a.summary ? `summary: ${a.summary}` : null,
                        a.error ? `error: ${a.error}` : null,
                        a.scores && Object.keys(a.scores).length
                          ? `scores: ${JSON.stringify(a.scores, null, 2)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join("\n\n")
                    );
                  },
                })
                  .then((r) => setAuditResult(JSON.stringify(r, null, 2)))
                  .catch((err) => {
                    setError((err as Error).message);
                    setAuditResult(null);
                  })
                  .finally(() => setBusy(false));
              },
            },
            {
              id: "audit-history",
              label: "Audit history",
              onSelect: () => {
                void cloudApi
                  .listAudits(orgId, notebookId)
                  .then(setAuditHistory)
                  .catch((err) => setError((err as Error).message));
              },
            },
            {
              id: "delete",
              label: "Delete notebook",
              danger: true,
              onSelect: () =>
                showConfirm(
                  "Delete notebook?",
                  "Delete this notebook and all entries? This cannot be undone.",
                  () => {
                    void cloudApi
                      .deleteNotebook(orgId, notebookId)
                      .then(() => router.push(`/orgs/${orgId}`))
                      .catch((err) => setError((err as Error).message));
                  },
                  "danger"
                ),
            },
          ],
    });
    return () => setWorkspaceHeader(null);
  }, [
    orgId,
    notebookId,
    orgName,
    notebookName,
    notebookUnavailable,
    navItems,
    activeNav,
    showPrompt,
    showConfirm,
    router,
  ]);

  const ctx = {
    orgId,
    notebookId,
    notebookName,
    notebookSummary,
    initialLoaded,
    notebookUnavailable,
    folders,
    entries,
    assets,
    error,
    busy,
    auditResult,
    refresh,
    setEntries,
    setFolders,
    setError,
    setBusy,
    setAuditResult,
    setNotebookSummary,
    showConfirm,
    showPrompt,
  };

  return (
    <NotebookWorkspaceProvider value={ctx}>
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden text-nb-on-surface">
        <input
          ref={importRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleImportZip(file);
          }}
        />

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          {initialLoaded && notebookUnavailable && (
            <div className="flex min-h-0 flex-1 items-center justify-center p-6">
              <EmptyState
                className="max-w-md"
                title={
                  error === "You don’t have access"
                    ? "You don’t have access to this notebook"
                    : "Notebook not found"
                }
                description={
                  error === "You don’t have access"
                    ? "Ask an org admin to grant access, or open a notebook from your org list."
                    : "This notebook may have been deleted, or the link is wrong. Fresh local data won’t match old URLs."
                }
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => router.push(`/orgs/${orgId}`)}>
                      Back to org
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => router.push("/")}>
                      Home
                    </Button>
                  </div>
                }
              />
            </div>
          )}
          {!initialLoaded && (
            <div className="absolute inset-0 z-40 flex bg-nb-surface">
              <aside className="flex w-[22%] min-w-[10rem] flex-col gap-2 border-r border-nb-outline-variant/20 p-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-7 w-24" />
                <SkeletonLines lines={8} className="mt-2" />
              </aside>
              <div className="flex min-w-0 flex-1 flex-col gap-3 p-6">
                <Skeleton className="h-8 w-1/2 max-w-md" />
                <Skeleton className="h-4 w-1/3 max-w-xs" />
                <SkeletonLines lines={6} className="mt-4 max-w-xl" />
                <div className="mt-auto">
                  <LoadingBlock label="Loading notebook…" />
                </div>
              </div>
            </div>
          )}
          {!notebookUnavailable && showEntryList && listCollapsed ? (
            <>
              <NotebookEntryList
                activeEntryId={activeEntryId}
                collapsed
                onToggleCollapsed={() => setListCollapsed(false)}
                basePath={basePath}
              />
              <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-nb-surface">
                <div
                  className={
                    activeEntryId
                      ? "flex h-full min-h-0 flex-col overflow-hidden"
                      : "min-h-0 flex-1 overflow-y-auto p-4 md:p-6"
                  }
                >
                  {children}
                </div>
              </section>
            </>
          ) : !notebookUnavailable && showEntryList ? (
            <PanelGroup
              direction="horizontal"
              autoSaveId="nb-explorer-width"
              className="min-h-0 flex-1"
            >
              <Panel defaultSize={22} minSize={14} maxSize={42} className="min-h-0">
                <NotebookEntryList
                  activeEntryId={activeEntryId}
                  collapsed={false}
                  onToggleCollapsed={() => setListCollapsed(true)}
                  basePath={basePath}
                />
              </Panel>
              <PanelResizeHandle className="w-1.5 shrink-0 bg-nb-outline-variant/20 transition-colors hover:bg-nb-primary/40 data-[resize-handle-active]:bg-nb-primary/50" />
              <Panel defaultSize={78} minSize={40} className="min-h-0">
                <section className="flex h-full min-h-0 flex-col overflow-hidden bg-nb-surface">
                  <div
                    className={
                      activeEntryId
                        ? "flex h-full min-h-0 flex-col overflow-hidden"
                        : "h-full min-h-0 overflow-y-auto p-4 md:p-6"
                    }
                  >
                    {children}
                  </div>
                </section>
              </Panel>
            </PanelGroup>
          ) : !notebookUnavailable ? (
            <section className="min-h-0 min-w-0 flex-1 overflow-auto bg-nb-surface">
              <div className="p-4 md:p-6">{children}</div>
            </section>
          ) : null}
        </div>
      </div>

      <Dialog
        isOpen={Boolean(auditResult)}
        onClose={() => setAuditResult(null)}
        title="Audit result"
        wide
      >
        <pre className="max-h-[60vh] overflow-auto rounded-nb-lg bg-nb-surface-low p-3 text-nb-caption">
          {auditResult}
        </pre>
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="secondary" onClick={() => setAuditResult(null)}>
            Close
          </Button>
        </div>
      </Dialog>

      <Dialog
        isOpen={auditHistory !== null}
        onClose={() => setAuditHistory(null)}
        title="Audit history"
        wide
      >
        <div className="flex max-h-[60vh] flex-col gap-2 overflow-auto">
          {(auditHistory || []).length === 0 && (
            <p className="text-nb-caption text-nb-on-surface-variant">No audits yet.</p>
          )}
          {(auditHistory || []).map((a) => (
            <button
              key={a.id}
              type="button"
              className="rounded-nb-xl border border-nb-outline-variant/25 bg-nb-surface-low px-3 py-2 text-left hover:border-nb-primary/40"
              onClick={() => {
                setAuditResult(JSON.stringify(a, null, 2));
                setAuditHistory(null);
              }}
            >
              <div className="text-nb-label font-semibold text-nb-on-surface">
                {a.rubric || "Rubric audit"}
              </div>
              <div className="text-nb-caption text-nb-on-surface-variant">
                {a.createdAt ? new Date(a.createdAt).toLocaleString() : "Unknown date"}
                {a.provider ? ` · ${a.provider}` : ""}
                {a.summary ? ` — ${a.summary.slice(0, 80)}` : ""}
              </div>
            </button>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="secondary" onClick={() => setAuditHistory(null)}>
            Close
          </Button>
        </div>
      </Dialog>

      <ShareNotebookDialog open={shareOpen} onClose={() => setShareOpen(false)} />

      <ConfirmationDialog
        isOpen={Boolean(confirm)}
        title={confirm?.title || ""}
        message={confirm?.message || ""}
        variant={confirm?.variant || "danger"}
        onConfirm={() => {
          const fn = confirm?.onConfirm;
          setConfirm(null);
          fn?.();
        }}
        onCancel={() => setConfirm(null)}
      />
      <TextPromptDialog
        isOpen={Boolean(prompt)}
        title={prompt?.title || ""}
        label={prompt?.label}
        initialValue={prompt?.initialValue || ""}
        onConfirm={(value) => {
          const fn = prompt?.onConfirm;
          setPrompt(null);
          fn?.(value);
        }}
        onCancel={() => setPrompt(null)}
      />
    </NotebookWorkspaceProvider>
  );
}
