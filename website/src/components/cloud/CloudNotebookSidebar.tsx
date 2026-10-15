"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ActivityBar, { type SidebarTab } from "@/components/sidebar/ActivityBar";
import FileExplorer from "@/components/workspace/FileExplorer";
import SearchTab from "@/components/sidebar/SearchTab";
import { showNotification } from "@/components/overlays/Notification";
import { cloudApi } from "@/lib/cloud/api";
import {
  cloudEntriesToExplorerFiles,
  explorerFileEntryId,
} from "@/lib/cloud/explorerFiles";
import type { ExplorerFile, TeamTab } from "@/lib/types";
import type { NotebookMetadata } from "@/lib/notebook/metadata";
import { useNotebookWorkspace } from "./NotebookWorkspaceContext";

type Props = {
  activeEntryId: string | null;
  notebookMetadata: NotebookMetadata;
  selectedPaths: Set<string>;
  onSelectEntry: (
    file: ExplorerFile,
    multi: boolean,
    range: boolean,
    visiblePaths: string[]
  ) => void;
  onSelectAll: (paths: string[]) => void;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    variant?: "danger" | "warning" | "info"
  ) => void;
  settingsActive?: boolean;
};

export function CloudNotebookSidebar({
  activeEntryId,
  notebookMetadata,
  selectedPaths,
  onSelectEntry,
  onSelectAll,
  showConfirm,
  settingsActive,
}: Props) {
  const router = useRouter();
  const { orgId, notebookId, entries, refresh, setError, setBusy, busy } =
    useNotebookWorkspace();
  const basePath = `/orgs/${orgId}/notebooks/${notebookId}`;

  const [activeTab, setActiveTab] = useState<SidebarTab>("explorer");
  const [sortBy, setSortBy] = useState<"date" | "title">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const explorerFiles = useMemo(
    () => cloudEntriesToExplorerFiles(entries),
    [entries]
  );

  const filteredEntries = useMemo(() => {
    const byPath = (a: ExplorerFile, b: ExplorerFile) =>
      (a.path || a.name).localeCompare(b.path || b.name);
    const entriesOnly = explorerFiles.filter((e) => !e.isTemplate);
    const templates = explorerFiles.filter((e) => e.isTemplate);

    entriesOnly.sort((a, b) => {
      if (sortBy === "title") {
        const valA = (a.title || a.name).toLowerCase();
        const valB = (b.title || b.name).toLowerCase();
        if (valA !== valB) {
          return sortDirection === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
      }
      const orderA = a.order ?? 0;
      const orderB = b.order ?? 0;
      if (orderA !== orderB) {
        return sortDirection === "asc" ? orderA - orderB : orderB - orderA;
      }
      return byPath(a, b);
    });

    templates.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || byPath(a, b));
    return [...entriesOnly, ...templates];
  }, [explorerFiles, sortBy, sortDirection]);

  const activePath = activeEntryId
    ? explorerFiles.find((f) => explorerFileEntryId(f) === activeEntryId)?.path ?? null
    : null;

  const openEntry = useCallback(
    (file: ExplorerFile) => {
      router.push(`${basePath}/entries/${explorerFileEntryId(file)}`);
    },
    [router, basePath]
  );

  const handleNewEntry = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const e = await cloudApi.createEntry(orgId, notebookId, {
        title: "New Entry",
        isTemplate: false,
      });
      refresh();
      router.push(`${basePath}/entries/${e.id}`);
    } catch (err) {
      setError((err as Error).message);
      showNotification("Failed to create entry.", "error");
    } finally {
      setBusy(false);
    }
  }, [busy, orgId, notebookId, refresh, router, basePath, setBusy, setError]);

  const handleCreateTemplate = useCallback(async () => {
    try {
      const e = await cloudApi.createEntry(orgId, notebookId, {
        title: "Untitled Template",
        isTemplate: true,
      });
      refresh();
      router.push(`${basePath}/entries/${e.id}`);
      showNotification("Created new blank template.", "success");
    } catch (err) {
      setError((err as Error).message);
      showNotification("Failed to create template.", "error");
    }
  }, [orgId, notebookId, refresh, router, basePath, setError]);

  const handleDuplicate = useCallback(
    async (file: ExplorerFile, asTemplate = false) => {
      const sourceId = explorerFileEntryId(file);
      const meta = entries[sourceId];
      try {
        const content = await cloudApi.getEntryContent(orgId, notebookId, sourceId).catch(() => null);
        const created = await cloudApi.createEntry(orgId, notebookId, {
          title: asTemplate
            ? `${meta?.title || "Entry"} (template)`
            : `${meta?.title || "Entry"} (copy)`,
          isTemplate: asTemplate || Boolean(meta?.isTemplate),
          authors: meta?.authors,
          phase: meta?.phase ?? null,
          date: meta?.date,
          folderId: meta?.folderId ?? null,
        });
        if (content != null) {
          await cloudApi.putEntryContent(orgId, notebookId, created.id, content);
        }
        refresh();
        router.push(`${basePath}/entries/${created.id}`);
        showNotification(
          asTemplate ? "Saved as reusable template." : "Entry duplicated successfully.",
          "success"
        );
      } catch (err) {
        setError((err as Error).message);
        showNotification(
          asTemplate ? "Failed to save as template." : "Failed to duplicate entry.",
          "error"
        );
      }
    },
    [entries, orgId, notebookId, refresh, router, basePath, setError]
  );

  const handleCreateFromTemplate = useCallback(
    async (templateId: string) => {
      const meta = entries[templateId];
      try {
        const content = await cloudApi
          .getEntryContent(orgId, notebookId, templateId)
          .catch(() => null);
        const created = await cloudApi.createEntry(orgId, notebookId, {
          title: meta?.title || "New Entry",
          isTemplate: false,
          authors: meta?.authors,
          phase: meta?.phase ?? null,
          date: new Date().toISOString().slice(0, 10),
        });
        if (content != null) {
          await cloudApi.putEntryContent(orgId, notebookId, created.id, content);
        }
        refresh();
        router.push(`${basePath}/entries/${created.id}`);
        showNotification("Created new entry from template.", "success");
      } catch (err) {
        setError((err as Error).message);
        showNotification("Failed to create entry from template.", "error");
      }
    },
    [entries, orgId, notebookId, refresh, router, basePath, setError]
  );

  const deleteFiles = useCallback(
    (files: ExplorerFile[]) => {
      if (files.length === 0) return;
      const isTemplate = files.some((f) => f.isTemplate);
      const itemType = isTemplate ? "Template" : "Entry";
      const displayTitle =
        (files[0].title || "").trim() || (isTemplate ? "Untitled Template" : "Untitled Entry");
      showConfirm(
        files.length === 1 ? `Delete ${itemType}` : `Delete Multiple ${itemType}s`,
        files.length === 1
          ? `Are you sure you want to delete "${displayTitle}"? This action cannot be undone.`
          : `Are you sure you want to delete ${files.length} items? This action cannot be undone.`,
        () => {
          void (async () => {
            try {
              await Promise.all(
                files.map((f) =>
                  cloudApi.deleteEntry(orgId, notebookId, explorerFileEntryId(f))
                )
              );
              refresh();
              if (files.some((f) => explorerFileEntryId(f) === activeEntryId)) {
                router.push(basePath);
              }
            } catch (err) {
              setError((err as Error).message);
            }
          })();
        },
        "danger"
      );
    },
    [
      showConfirm,
      orgId,
      notebookId,
      refresh,
      activeEntryId,
      router,
      basePath,
      setError,
    ]
  );

  const handleReorderTemplates = useCallback(
    (templateIds: string[]) => {
      void (async () => {
        try {
          await Promise.all(
            templateIds.map((id, index) =>
              cloudApi.patchEntry(orgId, notebookId, id, { order: index })
            )
          );
          refresh();
        } catch (err) {
          setError((err as Error).message);
        }
      })();
    },
    [orgId, notebookId, refresh, setError]
  );

  const emptySet = useMemo(() => new Set<string>(), []);

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-nb-surface-lowest">
      <ActivityBar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          if (tab === "git") {
            showNotification("Source control is local/GitHub-only; cloud uses live sync.", "info");
            return;
          }
          setActiveTab(tab);
        }}
        pendingCount={0}
        onOpenTeam={(tab?: TeamTab) => router.push(`${basePath}/team/${tab || "identity"}`)}
        onOpenCalendar={() => router.push(`${basePath}/calendar`)}
        onOpenSettings={() => router.push(`${basePath}/settings`)}
        settingsActive={settingsActive}
      />

      <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-nb-surface-low">
        <div
          className={`flex h-full min-h-0 flex-1 flex-col overflow-hidden ${
            activeTab === "explorer" ? "" : "hidden"
          }`}
        >
          <FileExplorer
            entries={filteredEntries}
            activePath={activePath}
            selectedPaths={selectedPaths}
            pendingPaths={emptySet}
            deletedPaths={emptySet}
            onSelectEntry={onSelectEntry}
            onOpenEntry={openEntry}
            onCloseEntry={() => router.push(basePath)}
            onDownloadLatex={() =>
              showNotification("LaTeX download comes with the compiler (later).", "info")
            }
            onDownloadJson={async (file) => {
              try {
                const id = explorerFileEntryId(file);
                const content = await cloudApi.getEntryContent(orgId, notebookId, id);
                const { saveAs } = await import("file-saver");
                saveAs(
                  new Blob([JSON.stringify(content, null, 2)], { type: "application/json" }),
                  `${id}.json`
                );
              } catch (err) {
                setError((err as Error).message);
              }
            }}
            onDeleteEntry={(file) => deleteFiles([file])}
            onDuplicateEntry={(file) => void handleDuplicate(file, false)}
            onSaveAsTemplate={(file) => void handleDuplicate(file, true)}
            onCreateTemplate={() => void handleCreateTemplate()}
            onCreateFromTemplate={(id) => void handleCreateFromTemplate(id)}
            onDownloadMulti={async (files) => {
              for (const file of files) {
                try {
                  const id = explorerFileEntryId(file);
                  const content = await cloudApi.getEntryContent(orgId, notebookId, id);
                  const { saveAs } = await import("file-saver");
                  saveAs(
                    new Blob([JSON.stringify(content, null, 2)], { type: "application/json" }),
                    `${id}.json`
                  );
                } catch (err) {
                  setError((err as Error).message);
                }
              }
            }}
            onDeleteMulti={deleteFiles}
            onNewEntry={() => void handleNewEntry()}
            onReorderTemplates={handleReorderTemplates}
            sortBy={sortBy}
            onSortChange={(val) => {
              setSortBy(val);
              setSortDirection(val === "title" ? "asc" : "desc");
            }}
            sortDirection={sortDirection}
            onSortDirectionToggle={() =>
              setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
            }
            notebookMetadata={notebookMetadata}
            isVisible={activeTab === "explorer"}
          />
        </div>

        <div
          className={`flex h-full min-h-0 flex-1 flex-col overflow-hidden ${
            activeTab === "search" ? "" : "hidden"
          }`}
        >
          <SearchTab entries={filteredEntries} onSelectEntry={openEntry} />
        </div>
      </div>
    </div>
  );
}
