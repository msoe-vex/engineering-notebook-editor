"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { saveAs } from "file-saver";
import {
  NOTEBOOK_SCHEMA_VERSION,
  type EntryMetadataV5,
  type NotebookSummaryV5,
} from "@engineering-notebook/shared";
import ConfirmationDialog from "@/components/dialogs/ConfirmationDialog";
import TextPromptDialog from "@/components/dialogs/TextPromptDialog";
import { Alert, Button, Dialog } from "@/components/ui";
import { cloudApi } from "@/lib/cloud/api";
import { exportNotebookZipV5, importNotebookZip } from "@/lib/cloud/zipV5";
import {
  activateCloudWorkspaceBridge,
  deactivateCloudWorkspaceBridge,
} from "@/lib/cloud/workspaceBridge";
import { setWorkspaceHeader } from "@/lib/cloud/workspaceHeaderStore";
import { store } from "@/lib/store";
import type { NotebookMetadata } from "@/lib/notebook/metadata";
import { NotebookEntryList } from "./NotebookEntryList";
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

const SUBNAV = [
  { id: "entries", label: "Entries", match: (p: string) => !p.includes("/schedule") && !p.includes("/members") && !p.includes("/setup") && !p.includes("/team") && !p.includes("/calendar") },
  { id: "schedule", label: "Schedule", match: (p: string) => p.includes("/schedule") || p.includes("/calendar") },
  { id: "members", label: "Members", match: (p: string) => p.includes("/members") },
  { id: "setup", label: "Setup", match: (p: string) => p.includes("/setup") || p.includes("/team") },
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

  const [notebookName, setNotebookName] = useState("Notebook");
  const [orgName, setOrgName] = useState("Organization");
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
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [prompt, setPrompt] = useState<PromptState>(null);
  const [listCollapsed, setListCollapsed] = useState(false);
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
        members: membersMap,
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
      const {
        summary,
        entries: imported,
        tipTapByEntryId,
        members: importedMembers,
      } = await importNotebookZip(buf, orgId, notebookName);
      await cloudApi.patchNotebook(orgId, notebookId, {
        name: summary.name || notebookName,
        title: summary.title,
        subtitle: summary.subtitle,
        logoAssetId: summary.logoAssetId,
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
            imageAssetId: m.imageAssetId,
            linkedUid: m.linkedUid,
          });
        } catch {
          /* ignore */
        }
      }
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

  const exportZipRef = useRef(handleExportZip);
  exportZipRef.current = handleExportZip;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    setWorkspaceHeader({
      orgId,
      notebookId,
      orgName,
      notebookName,
      menuItems: [
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
          label: "Audit",
          onSelect: () => {
            if (busyRef.current) return;
            void cloudApi
              .auditNotebook(orgId, notebookId, { provider: "byok" })
              .then((r) => setAuditResult(JSON.stringify(r, null, 2)))
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
  }, [orgId, notebookId, orgName, notebookName, showPrompt, showConfirm, router]);

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

  const activeNav = SUBNAV.find((t) => t.match(pathname || ""))?.id ?? "entries";

  return (
    <NotebookWorkspaceProvider value={ctx}>
      <div className="flex h-[calc(100vh-3.25rem)] min-h-0 flex-col overflow-hidden text-nb-on-surface">
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

        <div className="flex shrink-0 items-center gap-1 border-b border-nb-outline-variant/30 bg-nb-surface px-3 py-1.5">
          {SUBNAV.map((item) => {
            const href =
              item.id === "entries"
                ? basePath
                : item.id === "schedule"
                  ? `${basePath}/schedule`
                  : item.id === "members"
                    ? `${basePath}/members`
                    : `${basePath}/setup`;
            const active = activeNav === item.id;
            return (
              <Link
                key={item.id}
                href={href}
                className={`rounded-nb-lg px-3 py-1.5 text-nb-label font-semibold transition-colors ${
                  active
                    ? "bg-nb-primary/10 text-nb-primary"
                    : "text-nb-on-surface-variant hover:bg-nb-surface-low hover:text-nb-on-surface"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {error && (
          <Alert variant="error" className="shrink-0 rounded-none border-x-0 border-t-0">
            {error}
          </Alert>
        )}

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {showEntryList && (
            <NotebookEntryList
              activeEntryId={activeEntryId}
              collapsed={listCollapsed}
              onToggleCollapsed={() => setListCollapsed((v) => !v)}
              basePath={basePath}
            />
          )}
          <section className="min-h-0 min-w-0 flex-1 overflow-auto bg-nb-surface">
            <div className={showEntryList && activeEntryId ? "mx-auto max-w-3xl px-4 py-6" : "p-4 md:p-6"}>
              {children}
            </div>
          </section>
        </div>
      </div>

      <Dialog
        isOpen={Boolean(auditResult)}
        onClose={() => setAuditResult(null)}
        title="Audit result"
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
