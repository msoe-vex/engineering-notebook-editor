"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import ActivityBar, { SidebarTab } from "./sidebar/ActivityBar";
import FileExplorer from "./FileExplorer";
import SearchTab from "./sidebar/SearchTab";
import VersionControlTab from "./sidebar/VersionControlTab";
import { ExplorerFile, TeamTab } from "@/lib/types";
import { useWorkspace } from "@/hooks/useWorkspace";
import { LATEX_DIR, ENTRIES_DIR } from "@/lib/constants";
import { showNotification } from "./Notification";

interface SidebarProps {
  selectedPaths: Set<string>;
  onSelectEntry: (file: ExplorerFile, multi: boolean, range: boolean, visiblePaths: string[]) => void;
  onOpenTeam: (tab?: TeamTab) => void;
  showConfirm: (title: string, message: string, onConfirm: () => void, variant?: "danger" | "warning" | "info") => void;
  onNewEntry?: () => Promise<void>;
  onOpenEntry?: (file: ExplorerFile) => void;
  onSelectAll: (paths: string[]) => void;
}

export default function Sidebar({
  selectedPaths,
  onSelectEntry,
  onOpenTeam,
  showConfirm,
  onNewEntry,
  onOpenEntry,
  onSelectAll,
}: SidebarProps) {
  const {
    entries,
    openFile,
    metadata,
    pendingChanges,
    mode,
    createEntry,
    duplicateEntry,
    createTemplate,
    createEntryFromTemplate,
    deleteEntry,
    navigateTo,
    getFileContent,
    exportEntries
  } = useWorkspace();

  const [activeTab, setActiveTab] = useState<SidebarTab>("explorer");
  const [sortBy, setSortBy] = useState<"date" | "title">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const handleConfirmDelete = useCallback((files: ExplorerFile[]) => {
    if (files.length === 0) return;

    const isTemplate = files.some(f => f.isTemplate);
    const itemType = isTemplate ? "Template" : "Entry";
    const title = files.length === 1 ? `Delete ${itemType}` : `Delete Multiple ${itemType}s`;
    const message = files.length === 1
      ? `Are you sure you want to delete "${files[0].title || "Untitled"}"? This action cannot be undone.`
      : `Are you sure you want to delete ${files.length} items? This action cannot be undone.`;

    showConfirm(
      title,
      message,
      () => {
        files.forEach(f => deleteEntry(f));
      },
      "danger"
    );
  }, [showConfirm, deleteEntry]);

  const pendingPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const p of pendingChanges || []) {
      paths.add(p.path);
      if (p.path.startsWith(`${LATEX_DIR}/`) && p.path.endsWith(".tex")) {
        const entryId = p.path.replace(`${LATEX_DIR}/`, "").replace(".tex", "");
        paths.add(`${ENTRIES_DIR}/${entryId}.json`);
      }
    }
    return paths;
  }, [pendingChanges]);

  const deletedPaths = useMemo(() => new Set((pendingChanges || []).filter(p => p.operation === "delete").map(p => p.path)), [pendingChanges]);

  const augmentedEntries = useMemo(() => {
    return entries.map(f => {
      const entryId = f.name.replace('.json', '');
      const meta = metadata.entries[entryId];
      return {
        ...f,
        title: meta?.title || "",
        author: meta?.author || "",
        phase: meta?.phase ?? null,
        timestamp: meta?.createdAt,
        updatedAt: meta?.updatedAt,
        date: meta?.date,
        isTemplate: meta?.isTemplate || false,
        isValid: meta?.isValid !== false,
        validationErrors: meta?.validationErrors || []
      };
    });
  }, [entries, metadata]);

  const filteredEntries = useMemo(() => {
    const list = [...augmentedEntries];

    list.sort((a, b) => {
      let valA, valB;
      if (sortBy === "title") {
        valA = a.title || a.name;
        valB = b.title || b.name;
      } else {
        valA = a.date || a.timestamp || "";
        valB = b.date || b.timestamp || "";
      }

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      
      const tsA = a.updatedAt || a.timestamp || "";
      const tsB = b.updatedAt || b.timestamp || "";
      if (tsA < tsB) return sortDirection === "asc" ? -1 : 1;
      if (tsA > tsB) return sortDirection === "asc" ? 1 : -1;

      return 0;
    });

    return list;
  }, [augmentedEntries, sortBy, sortDirection]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || (e.key === "Backspace" && (e.metaKey || e.ctrlKey))) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

        if (selectedPaths.size === 0) return;
        const toDelete = entries.filter(f => selectedPaths.has(f.path));
        if (toDelete.length > 0) {
          e.preventDefault();
          handleConfirmDelete(toDelete);
        }
      }

      if (e.key === "a" && (e.metaKey || e.ctrlKey)) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable || target.closest('.ProseMirror') || target.closest('[tabindex="0"]')) return;

        e.preventDefault();
        onSelectAll(filteredEntries.map(f => f.path));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPaths, entries, handleConfirmDelete, onSelectAll, filteredEntries]);

  const handleOpenEntry = useCallback((file: ExplorerFile, resourceId?: string) => {
    if (onOpenEntry && !resourceId) {
      onOpenEntry(file);
    } else {
      const id = file.name.replace('.json', '');
      navigateTo({ entry: id, resource: resourceId || null }, '/workspace/editor');
    }
  }, [onOpenEntry, navigateTo]);

  const handleDuplicateEntry = useCallback(async (file: ExplorerFile) => {
    try {
      const id = file.name.replace('.json', '');
      const newId = await duplicateEntry(id);
      showNotification("Entry duplicated successfully.", "success");
    } catch (e) {
      console.error("Duplicate failed", e);
      showNotification("Failed to duplicate entry.", "error");
    }
  }, [duplicateEntry]);

  const handleSaveAsTemplate = useCallback(async (file: ExplorerFile) => {
    try {
      const id = file.name.replace('.json', '');
      await duplicateEntry(id, { asTemplate: true });
      showNotification("Saved as reusable template.", "success");
    } catch (e) {
      console.error("Save as template failed", e);
      showNotification("Failed to save as template.", "error");
    }
  }, [duplicateEntry]);

  const handleCreateFromTemplate = useCallback(async (templateId: string) => {
    try {
      const newId = await createEntryFromTemplate(templateId);
      if (newId) {
        navigateTo({ entry: newId, resource: null }, '/workspace/editor');
      }
      showNotification("Created new entry from template.", "success");
    } catch (e) {
      console.error("Create from template failed", e);
      showNotification("Failed to create entry from template.", "error");
    }
  }, [createEntryFromTemplate, navigateTo]);

  const handleCreateTemplate = useCallback(async () => {
    try {
      const newTemplateId = await createTemplate();
      if (newTemplateId) {
        navigateTo({ entry: newTemplateId, resource: null }, '/workspace/editor');
      }
      showNotification("Created new blank template.", "success");
    } catch (e) {
      console.error("Create template failed", e);
      showNotification("Failed to create template.", "error");
    }
  }, [createTemplate, navigateTo]);

  const handleDownloadJson = async (file: ExplorerFile) => {
    const id = file.name.replace('.json', '');
    await exportEntries([id]);
  };

  const handleDownloadLatex = async (file: ExplorerFile) => {
    try {
      const id = file.name.replace('.json', '');
      const path = `${LATEX_DIR}/${id}.tex`;
      const content = await getFileContent(path);
      if (content) {
        const { saveAs } = await import("file-saver");
        const blob = new Blob([content], { type: "text/plain" });
        saveAs(blob, `${id}.tex`);
        showNotification(`Downloaded ${id}.tex`, "success");
      } else {
        showNotification(`Could not find LaTeX for ${file.name}`, "error");
      }
    } catch (e) {
      console.error("Download failed", e);
      showNotification("Download failed", "error");
    }
  };

  const handleDownloadMulti = async (files: ExplorerFile[]) => {
    const ids = files.map(f => f.name.replace('.json', ''));
    await exportEntries(ids);
  };

  const handleCloseEntry = useCallback(() => {
    navigateTo({ entry: null, resource: null });
  }, [navigateTo]);

  return (
    <div className="flex h-full overflow-hidden min-h-0 bg-nb-surface-lowest">
      {/* Activity Bar (VS Code style slim icon column) */}
      <ActivityBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        pendingCount={(pendingChanges || []).length}
        onOpenTeam={onOpenTeam}
        onOpenCompile={() => navigateTo({}, '/workspace/compile')}
        onOpenHelp={() => navigateTo({}, '/workspace/help/getting-started')}
      />

      {/* Main Tab Panel */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-h-0 bg-nb-surface-low">
        {activeTab === "explorer" && (
          <FileExplorer
            entries={filteredEntries}
            activePath={openFile?.path || null}
            selectedPaths={selectedPaths}
            pendingPaths={pendingPaths}
            deletedPaths={deletedPaths}
            onSelectEntry={(file, multi, range) => onSelectEntry(file, multi, range, filteredEntries.map(e => e.path))}
            onOpenEntry={handleOpenEntry}
            onCloseEntry={handleCloseEntry}
            onDownloadLatex={handleDownloadLatex}
            onDownloadJson={handleDownloadJson}
            onDeleteEntry={(file) => handleConfirmDelete([file])}
            onDuplicateEntry={handleDuplicateEntry}
            onSaveAsTemplate={handleSaveAsTemplate}
            onCreateTemplate={handleCreateTemplate}
            onCreateFromTemplate={handleCreateFromTemplate}
            onDownloadMulti={handleDownloadMulti}
            onDeleteMulti={handleConfirmDelete}
            onNewEntry={onNewEntry || createEntry}
            sortBy={sortBy}
            onSortChange={setSortBy}
            sortDirection={sortDirection}
            onSortDirectionToggle={() => setSortDirection(prev => prev === "asc" ? "desc" : "asc")}
            notebookMetadata={metadata}
          />
        )}

        {activeTab === "search" && (
          <SearchTab
            entries={augmentedEntries}
            onSelectEntry={handleOpenEntry}
          />
        )}

        {activeTab === "git" && (
          <VersionControlTab
            showConfirm={showConfirm}
          />
        )}
      </div>
    </div>
  );
}
