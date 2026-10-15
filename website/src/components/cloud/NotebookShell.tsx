"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { saveAs } from "file-saver";
import {
  NOTEBOOK_SCHEMA_VERSION,
  type EntryMetadataV5,
  type NotebookSummaryV5,
} from "@engineering-notebook/shared";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import TextPromptDialog from "@/components/dialogs/TextPromptDialog";
import { cloudApi } from "@/lib/cloud/api";
import { exportNotebookZipV5, importNotebookZip } from "@/lib/cloud/zipV5";
import {
  activateCloudWorkspaceBridge,
  deactivateCloudWorkspaceBridge,
} from "@/lib/cloud/workspaceBridge";
import { store } from "@/lib/store";
import type { NotebookMetadata } from "@/lib/notebook/metadata";
import type { ExplorerFile } from "@/lib/types";
import { CloudNotebookSidebar } from "./CloudNotebookSidebar";
import { NotebookWorkspaceProvider } from "./NotebookWorkspaceContext";
import type { EntryMeta } from "./notebook-types";

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
  const settingsActive = pathname.includes("/settings");

  const [notebookName, setNotebookName] = useState("Notebook");
  const [notebookSummary, setNotebookSummary] = useState<NotebookSummaryV5 | null>(null);
  const [folders, setFolders] = useState<
    Record<string, { name: string; parentId: string | null; order: number }>
  >({});
  const [entries, setEntries] = useState<Record<string, EntryMeta>>({});
  const [assets, setAssets] = useState<Awaited<ReturnType<typeof cloudApi.listAssets>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [prompt, setPrompt] = useState<PromptState>(null);
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

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      void (async () => {
        try {
          const [nb, entryRes, assetList] = await Promise.all([
            cloudApi.getNotebook(orgId, notebookId),
            cloudApi.listEntries(orgId, notebookId),
            cloudApi.listAssets(orgId, notebookId).catch(() => [] as typeof assets),
          ]);
          if (cancelled) return;
          setNotebookName(nb.name);
          setFolders(nb.folders ?? {});
          setEntries(entryRes.entries);
          setAssets(assetList);
          setNotebookSummary({
            schemaVersion: NOTEBOOK_SCHEMA_VERSION,
            orgId,
            name: nb.name,
            folders: nb.folders ?? {},
            team: nb.team as NotebookSummaryV5["team"],
            phases: nb.phases as NotebookSummaryV5["phases"],
            lastCompiled: nb.lastCompiled,
            updatedAt: nb.updatedAt ?? new Date().toISOString(),
          });
          setError(null);
        } catch (err) {
          if (!cancelled) setError((err as Error).message);
        }
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [orgId, notebookId, reloadToken]);

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
      team: notebookSummary?.team as NotebookMetadata["team"],
    }),
    [entries, notebookSummary]
  );

  // Bridge metadata into the legacy store so TipTap / Team / Calendar keep working.
  useEffect(() => {
    store.isInitialized = true;
    store.metadata = notebookMetadata;
    store.notifyStateChange();
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
          isTemplate: meta.isTemplate,
        };
        try {
          tipTapByEntryId[id] = await cloudApi.getEntryContent(orgId, notebookId, id);
        } catch {
          tipTapByEntryId[id] = { type: "doc", content: [] };
        }
      }
      const summary: NotebookSummaryV5 = notebookSummary ?? {
        schemaVersion: NOTEBOOK_SCHEMA_VERSION,
        orgId,
        name: notebookName,
        folders,
        updatedAt: new Date().toISOString(),
      };
      const blob = await exportNotebookZipV5({
        summary,
        entries: entryMeta,
        tipTapByEntryId,
      });
      saveAs(blob, `${notebookName.replace(/\s+/g, "-").toLowerCase() || "notebook"}.v5.zip`);
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
      const { summary, entries: imported, tipTapByEntryId } = await importNotebookZip(
        buf,
        orgId,
        notebookName
      );
      await cloudApi.patchNotebook(orgId, notebookId, {
        name: summary.name || notebookName,
        folders: summary.folders,
        team: summary.team,
        phases: summary.phases,
      });
      for (const [id, meta] of Object.entries(imported)) {
        try {
          await cloudApi.patchEntry(orgId, notebookId, id, meta);
        } catch {
          await cloudApi.createEntry(orgId, notebookId, {
            id,
            title: meta.title,
            folderId: meta.folderId,
            order: meta.order,
            date: meta.date,
            phase: meta.phase,
            authors: meta.authors,
            isTemplate: meta.isTemplate,
          });
        }
        const doc = tipTapByEntryId[id];
        if (doc !== undefined) {
          await cloudApi.putEntryContent(orgId, notebookId, id, doc);
        }
      }
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const handleSelectEntry = useCallback(
    (file: ExplorerFile, multi: boolean, range: boolean, visiblePaths: string[]) => {
      setSelectedPaths((prev) => {
        const next = new Set(multi || range ? prev : []);
        if (range && prev.size > 0) {
          const anchor = [...prev][0];
          const a = visiblePaths.indexOf(anchor);
          const b = visiblePaths.indexOf(file.path);
          if (a >= 0 && b >= 0) {
            const [lo, hi] = a < b ? [a, b] : [b, a];
            for (let i = lo; i <= hi; i++) next.add(visiblePaths[i]);
            return next;
          }
        }
        if (multi && next.has(file.path)) next.delete(file.path);
        else next.add(file.path);
        return next;
      });
    },
    []
  );

  const ctx = {
    orgId,
    notebookId,
    notebookName,
    notebookSummary,
    folders,
    entries,
    assets,
    error,
    busy,
    auditResult,
    refresh,
    setError,
    setBusy,
    setAuditResult,
    setNotebookSummary,
    showConfirm,
    showPrompt,
  };

  return (
    <NotebookWorkspaceProvider value={ctx}>
      <div className="flex h-[calc(100vh-4.5rem)] min-h-0 flex-col overflow-hidden text-nb-on-surface">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-nb-outline-variant/30 bg-nb-surface px-4 py-2">
          <div className="min-w-0">
            <Link href={`/orgs/${orgId}`} className="text-xs text-nb-on-surface-variant underline">
              Notebooks
            </Link>
            <h1 className="truncate text-lg font-semibold tracking-tight">{notebookName}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-nb-outline-variant/40 px-3 py-1.5 text-xs font-medium"
              onClick={() =>
                showPrompt("Rename notebook", notebookName, (next) => {
                  void cloudApi
                    .patchNotebook(orgId, notebookId, { name: next })
                    .then(refresh)
                    .catch((err) => setError((err as Error).message));
                })
              }
            >
              Rename
            </button>
            <button
              type="button"
              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700"
              onClick={() =>
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
                )
              }
            >
              Delete
            </button>
            <button
              type="button"
              className="rounded-lg border border-nb-outline-variant/40 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              disabled={busy}
              onClick={() => void handleExportZip()}
            >
              Export ZIP
            </button>
            <button
              type="button"
              className="rounded-lg border border-nb-outline-variant/40 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              disabled={busy}
              onClick={() => importRef.current?.click()}
            >
              Import ZIP
            </button>
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
            <button
              type="button"
              className="rounded-lg border border-nb-outline-variant/40 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              disabled={busy}
              onClick={() => {
                void cloudApi
                  .auditNotebook(orgId, notebookId, { provider: "byok" })
                  .then((r) => setAuditResult(JSON.stringify(r, null, 2)))
                  .catch((err) => setError((err as Error).message));
              }}
            >
              Audit
            </button>
          </div>
        </div>

        {error && (
          <p className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex w-[320px] shrink-0 flex-col border-r border-nb-outline-variant/30 md:w-[360px]">
            <CloudNotebookSidebar
              activeEntryId={activeEntryId}
              notebookMetadata={notebookMetadata}
              selectedPaths={selectedPaths}
              onSelectEntry={handleSelectEntry}
              onSelectAll={(paths) => setSelectedPaths(new Set(paths))}
              showConfirm={showConfirm}
              settingsActive={settingsActive}
            />
          </div>
          <section className="min-h-0 min-w-0 flex-1 overflow-auto bg-nb-surface p-4">
            {children}
            {auditResult && (
              <pre className="mt-6 overflow-auto rounded border border-neutral-200 bg-neutral-900 p-4 text-xs text-neutral-100">
                {auditResult}
              </pre>
            )}
          </section>
        </div>
      </div>

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
