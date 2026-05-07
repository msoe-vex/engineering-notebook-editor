import React, { useState, useMemo } from "react";
import FileExplorer from "./FileExplorer";
import PendingChangesPanel from "./PendingChangesPanel";
import { ExplorerFile } from "@/lib/types";
import { NotebookMetadata } from "@/lib/metadata";
import { PendingChange, clearAllPending } from "@/lib/db";
import { useWorkspace } from "@/hooks/useWorkspace";

interface SidebarProps {
  selectedPaths: Set<string>;
  onSelectEntry: (file: ExplorerFile, multi: boolean, range: boolean, visiblePaths: string[]) => void;
  onOpenTeam: (tab?: any) => void;
}

export default function Sidebar({
  selectedPaths,
  onSelectEntry,
  onOpenTeam,
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
    config,
    refreshPending,
    currentProjectId
  } = useWorkspace();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"created" | "updated" | "title">("created");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);

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
        isValid: meta?.isValid !== false
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
        const ts = f.timestamp ? new Date(f.timestamp) : null;
        if (!ts) return false;
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
      } else if (sortBy === "updated") {
        valA = a.updatedAt || a.timestamp || "";
        valB = b.updatedAt || b.timestamp || "";
      } else {
        valA = a.timestamp || "";
        valB = b.timestamp || "";
      }

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [augmentedEntries, search, sortBy, sortDirection, dateRange]);

  const handleOpenEntry = (file: ExplorerFile) => {
    const id = file.name.replace('.json', '');
    const url = new URL(window.location.href);
    url.searchParams.set('entry', id);
    window.history.pushState({}, '', url.toString());
    // Store handles URL changes
  };

  const handleDiscard = async () => {
    const dbName = currentProjectId ? `notebook-project-${currentProjectId}` : "notebook-default";
    await clearAllPending(dbName);
    await refreshPending();
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
           const url = new URL(window.location.href);
           url.searchParams.delete('entry');
           window.history.pushState({}, '', url.toString());
        }}
        onDownloadLatex={() => {}} // TODO: implement in store if needed
        onDownloadJson={() => {}} // TODO: implement in store if needed
        onDeleteEntry={(file) => deleteEntry(file)}
        onDownloadMulti={() => {}}
        onDeleteMulti={(files) => files.forEach(f => deleteEntry(f))}
        onNewEntry={createEntry}
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

      {pendingChanges.length > 0 && (
        <div className="p-4 bg-nb-surface border-t border-nb-outline-variant animate-in slide-in-from-bottom-2 duration-300">
          <PendingChangesPanel
            pendingChanges={pendingChanges}
            isCommitting={false} // Store handles this now
            onCommit={() => config && commitAll(config)}
            onDiscard={handleDiscard}
            workspaceMode={mode as "github" | "local" | "temporary"}
          />
        </div>
      )}
    </div>
  );
}
