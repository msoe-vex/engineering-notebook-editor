import { useState, useMemo, useEffect, useCallback } from "react";
import FileExplorer from "./FileExplorer";
import PendingChangesPanel from "./PendingChangesPanel";
import { ExplorerFile, TeamTab } from "@/lib/types";
import { useWorkspace } from "@/hooks/useWorkspace";
import { LATEX_DIR } from "@/lib/constants";
import { showNotification } from "./Notification";

interface SidebarProps {
  selectedPaths: Set<string>;
  onSelectEntry: (file: ExplorerFile, multi: boolean, range: boolean, visiblePaths: string[]) => void;
  onOpenTeam: (tab?: TeamTab) => void;
  showConfirm: (title: string, message: string, onConfirm: () => void, variant?: "danger" | "warning" | "info") => void;
  onNewEntry?: () => Promise<void>;
  onOpenEntry?: (file: ExplorerFile) => void;
}

export default function Sidebar({
  selectedPaths,
  onSelectEntry,
  showConfirm,
  onNewEntry,
  onOpenEntry,
}: SidebarProps) {
  const {
    entries,
    openFile,
    metadata,
    pendingChanges,
    mode,
    createEntry,
    deleteEntry,
    commitAll,
    discardPendingChanges,
    config,
    navigateTo,
    getFileContent,
    exportEntries
  } = useWorkspace();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "title">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  const handleConfirmDelete = useCallback((files: ExplorerFile[]) => {
    if (files.length === 0) return;

    const title = files.length === 1 ? "Delete Entry" : "Delete Multiple Entries";
    const message = files.length === 1
      ? `Are you sure you want to delete "${files[0].title || "Untitled Entry"}"? This action cannot be undone and will permanently remove the entry and its associated LaTeX file.`
      : `Are you sure you want to delete ${files.length} entries? This action cannot be undone and will permanently remove all selected entries and their associated LaTeX files.`;

    showConfirm(
      title,
      message,
      () => {
        files.forEach(f => deleteEntry(f));
      },
      "danger"
    );
  }, [showConfirm, deleteEntry]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedPaths.size === 0) return;
      if (e.key === "Delete" || (e.key === "Backspace" && (e.metaKey || e.ctrlKey))) {
        // Don't trigger if typing in an input
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

        const toDelete = entries.filter(f => selectedPaths.has(f.path));
        if (toDelete.length > 0) {
          e.preventDefault();
          handleConfirmDelete(toDelete);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPaths, entries, handleConfirmDelete]);

  const pendingPaths = useMemo(() => new Set((pendingChanges || []).map(p => p.path)), [pendingChanges]);
  const deletedPaths = useMemo(() => new Set((pendingChanges || []).filter(p => p.operation === "delete").map(p => p.path)), [pendingChanges]);

  const augmentedEntries = useMemo(() => {
    return entries.map(f => {
      const entryId = f.name.replace('.json', '');
      const meta = metadata.entries[entryId];
      return {
        ...f,
        title: meta?.title || "",
        phase: meta?.phase ?? null,
        timestamp: meta?.createdAt,
        updatedAt: meta?.updatedAt,
        date: meta?.date,
        isValid: meta?.isValid !== false,
        validationErrors: meta?.validationErrors || []
      };
    });
  }, [entries, metadata]);

  const filteredEntries = useMemo(() => {
    const list = augmentedEntries.filter(f => {
      if (search) {
        const q = search.toLowerCase();
        if (!(f.title?.toLowerCase().includes(q) || f.name.toLowerCase().includes(q))) return false;
      }
      if (dateRange) {
        const dStr = f.date || (f.timestamp ? f.timestamp.split('T')[0] : null);
        if (!dStr) return false;
        
        const ts = new Date(dStr);
        if (dateRange.start && ts < new Date(dateRange.start)) return false;
        if (dateRange.end) {
          const end = new Date(dateRange.end);
          end.setHours(23, 59, 59, 999);
          if (ts > end) return false;
        }
      }
      return true;
    });

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
      
      // Tie-breaker: updatedAt (timestamp)
      const tsA = a.updatedAt || a.timestamp || "";
      const tsB = b.updatedAt || b.timestamp || "";
      if (tsA < tsB) return sortDirection === "asc" ? -1 : 1;
      if (tsA > tsB) return sortDirection === "asc" ? 1 : -1;

      return 0;
    });

    return list;
  }, [augmentedEntries, search, sortBy, sortDirection, dateRange]);

  const handleOpenEntry = (file: ExplorerFile) => {
    if (onOpenEntry) {
      onOpenEntry(file);
    } else {
      const id = file.name.replace('.json', '');
      navigateTo({ entry: id, resource: null }, '/workspace/editor');
    }
  };

  const handleDiscard = async () => {
    try {
      setIsDiscarding(true);
      await discardPendingChanges();
      showNotification("Discarded all pending changes.", "info");
    } catch (e) {
      console.error("Discard failed", e);
      showNotification("Failed to discard changes.", "error");
    } finally {
      setIsDiscarding(false);
    }
  };

  const handleCommit = async (message?: string) => {
    if (!config) {
      showNotification("GitHub is not configured for this project.", "error");
      return;
    }

    try {
      setIsCommitting(true);
      await commitAll(config, message);
      showNotification("Synced changes to GitHub.", "success");
    } catch (error) {
      console.error("GitHub sync failed", error);
      showNotification(error instanceof Error ? error.message : "Failed to sync to GitHub", "error");
    } finally {
      setIsCommitting(false);
    }
  };

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

  return (
    <div className="flex flex-col h-full overflow-hidden min-h-0">
      <FileExplorer
        entries={filteredEntries}
        activePath={openFile?.path || null}
        selectedPaths={selectedPaths}
        pendingPaths={pendingPaths}
        deletedPaths={deletedPaths}
        onSelectEntry={(file, multi, range) => onSelectEntry(file, multi, range, filteredEntries.map(e => e.path))}
        onOpenEntry={handleOpenEntry}
        onCloseEntry={() => {
          navigateTo({ entry: null });
        }}
        onDownloadLatex={handleDownloadLatex}
        onDownloadJson={handleDownloadJson}
        onDeleteEntry={(file) => handleConfirmDelete([file])}
        onDownloadMulti={handleDownloadMulti}
        onDeleteMulti={handleConfirmDelete}
        onNewEntry={onNewEntry || createEntry}
        search={search}
        onSearchChange={setSearch}
        sortBy={sortBy}
        onSortChange={setSortBy}
        sortDirection={sortDirection}
        onSortDirectionToggle={() => setSortDirection(prev => prev === "asc" ? "desc" : "asc")}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        notebookMetadata={metadata}
      />

      <div className={`grid transition-all duration-500 ease-in-out ${pendingChanges.length > 0 || isCommitting || isDiscarding ? 'grid-rows-[1fr] opacity-100 border-t border-nb-outline-variant' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="p-4 bg-nb-surface">
            <PendingChangesPanel
              pendingChanges={pendingChanges}
              isCommitting={isCommitting}
              isDiscarding={isDiscarding}
              onCommit={handleCommit}
              onDiscard={handleDiscard}
              workspaceMode={mode as "github" | "local" | "temporary"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
