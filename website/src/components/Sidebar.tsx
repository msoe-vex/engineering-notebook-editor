import React, { useState, useMemo } from "react";
import FileExplorer from "./FileExplorer";
import { ExplorerFile } from "@/lib/types";
import { NotebookMetadata } from "@/lib/metadata";
import { PendingChange } from "@/lib/db";

interface SidebarProps {
  entries: ExplorerFile[];
  openFile: { path: string } | null;
  notebookMetadata: NotebookMetadata;
  pendingChanges: PendingChange[];
  onSelectEntry: (file: ExplorerFile) => void;
  onNewEntry: () => void;
}

export default function Sidebar({
  entries,
  openFile,
  notebookMetadata,
  pendingChanges,
  onSelectEntry,
  onNewEntry
}: SidebarProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"created" | "updated" | "title">("updated");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);

  const pendingPaths = useMemo(() => new Set(pendingChanges.map(p => p.path)), [pendingChanges]);
  const deletedPaths = useMemo(() => new Set(pendingChanges.filter(p => p.operation === "delete").map(p => p.path)), [pendingChanges]);

  const augmentedEntries = useMemo(() => {
    return entries.map(f => {
      const entryId = f.name.replace('.json', '');
      const meta = notebookMetadata.entries[entryId];
      return {
        ...f,
        title: meta?.title || "",
        timestamp: meta?.createdAt,
        updatedAt: meta?.updatedAt,
        isValid: meta?.isValid !== false
      };
    });
  }, [entries, notebookMetadata]);

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

  return (
    <FileExplorer
      entries={filteredEntries}
      activePath={openFile?.path || null}
      pendingPaths={pendingPaths}
      deletedPaths={deletedPaths}
      onSelectEntry={onSelectEntry}
      onNewEntry={onNewEntry}
      search={search}
      onSearchChange={setSearch}
      sortBy={sortBy}
      onSortChange={setSortBy}
      sortDirection={sortDirection}
      onSortDirectionToggle={() => setSortDirection(prev => prev === "asc" ? "desc" : "asc")}
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
    />
  );
}
