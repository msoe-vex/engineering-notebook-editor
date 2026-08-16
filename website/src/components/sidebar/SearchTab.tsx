"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  Search,
  X,
  User,
  Calendar,
  ChevronRight,
  ChevronDown,
  Layers,
  Image as ImageIcon,
  SlidersHorizontal,
  Check,
  Filter
} from "lucide-react";
import { ExplorerFile } from "@/lib/types";
import { useWorkspace } from "@/hooks/useWorkspace";
import { DEFAULT_PHASES } from "@/lib/phases";

interface SearchTabProps {
  entries: ExplorerFile[];
  onSelectEntry: (file: ExplorerFile, resourceId?: string) => void;
}

interface ResourceMatch {
  id: string;
  title?: string;
  caption?: string;
  snippet: string;
}

interface GroupedEntryResult {
  file: ExplorerFile;
  matchesTitle: boolean;
  matchesAuthor: boolean;
  matchesDate: boolean;
  resourceMatches: ResourceMatch[];
}

interface SearchFieldFilters {
  titles: boolean;
  authors: boolean;
  figures: boolean;
  dates: boolean;
}

export default function SearchTab({
  entries,
  onSelectEntry
}: SearchTabProps) {
  const { metadata } = useWorkspace();
  const [query, setQuery] = useState("");
  const [selectedPhase, setSelectedPhase] = useState<number | null>(null);
  const [isPhaseDropdownOpen, setIsPhaseDropdownOpen] = useState(false);
  const [isSearchFieldsCollapsed, setIsSearchFieldsCollapsed] = useState(true);
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(true);
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);

  const [filters, setFilters] = useState<SearchFieldFilters>({
    titles: true,
    authors: true,
    figures: true,
    dates: true
  });

  const phases = metadata.phases || DEFAULT_PHASES;
  const phaseMap = useMemo(() => new Map(phases.map(p => [p.index, p])), [phases]);

  const allFieldsSelected = filters.titles && filters.authors && filters.figures && filters.dates;

  const toggleAllFields = useCallback(() => {
    if (allFieldsSelected) {
      setFilters({ titles: false, authors: false, figures: false, dates: false });
    } else {
      setFilters({ titles: true, authors: true, figures: true, dates: true });
    }
  }, [allFieldsSelected]);

  const toggleFilter = useCallback((key: keyof SearchFieldFilters) => {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const augmentedEntries = useMemo(() => {
    return entries.map(f => {
      const entryId = f.name.replace(".json", "");
      const meta = metadata.entries[entryId];
      return {
        ...f,
        id: entryId,
        title: meta?.title || f.title || "Untitled Entry",
        author: meta?.author || f.author || "",
        phase: meta?.phase ?? f.phase ?? null,
        date: meta?.date || f.date || "",
        createdAt: meta?.createdAt,
        updatedAt: meta?.updatedAt,
        resources: meta?.resources,
        isTemplate: meta?.isTemplate ?? f.isTemplate ?? false
      };
    });
  }, [entries, metadata]);

  // High-performance instant in-memory metadata search grouped by Entry
  const results = useMemo<GroupedEntryResult[]>(() => {
    const q = query.trim().toLowerCase();

    const matchesList: GroupedEntryResult[] = [];

    for (const entry of augmentedEntries) {
      if (selectedPhase !== null && entry.phase !== selectedPhase) {
        continue;
      }

      // Date Range filter
      if (dateRange) {
        const dStr = entry.date || (entry.createdAt ? entry.createdAt.split('T')[0] : null);
        if (!dStr) continue;
        const ts = new Date(dStr);
        if (dateRange.start && ts < new Date(dateRange.start)) continue;
        if (dateRange.end) {
          const end = new Date(dateRange.end);
          end.setHours(23, 59, 59, 999);
          if (ts > end) continue;
        }
      }

      if (!q) {
        if (selectedPhase !== null || dateRange !== null) {
          matchesList.push({
            file: entry,
            matchesTitle: true,
            matchesAuthor: false,
            matchesDate: false,
            resourceMatches: []
          });
        }
        continue;
      }

      const titleLower = entry.title.toLowerCase();
      const authorLower = entry.author.toLowerCase();
      const dateLower = entry.date.toLowerCase();

      const matchesTitle = Boolean(filters.titles && titleLower.includes(q));
      const matchesAuthor = Boolean(filters.authors && authorLower.includes(q));
      const matchesDate = Boolean(filters.dates && dateLower.includes(q));

      const resourceMatches: ResourceMatch[] = [];
      if (filters.figures && entry.resources) {
        for (const [resId, res] of Object.entries(entry.resources)) {
          const resTitle = (res.title || "").toLowerCase();
          const resCaption = (res.caption || "").toLowerCase();
          if (resTitle.includes(q) || resCaption.includes(q)) {
            const snippet = res.title ? `${res.title}${res.caption ? ` - ${res.caption}` : ""}` : res.caption || "Figure";
            resourceMatches.push({
              id: resId,
              title: res.title,
              caption: res.caption,
              snippet
            });
          }
        }
      }

      if (matchesTitle || matchesAuthor || matchesDate || resourceMatches.length > 0) {
        matchesList.push({
          file: entry,
          matchesTitle,
          matchesAuthor,
          matchesDate,
          resourceMatches
        });
      }
    }

    return matchesList;
  }, [query, selectedPhase, dateRange, filters, augmentedEntries]);

  const highlightMatch = useCallback((text: string, q: string) => {
    if (!q.trim() || !text) return text;
    const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === q.toLowerCase() ? (
            <mark key={i} className="bg-amber-300/60 dark:bg-amber-400/30 text-amber-950 dark:text-amber-100 font-bold px-0.5 rounded shadow-xs">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  }, []);

  const selectedPhaseObj = selectedPhase !== null ? phaseMap.get(selectedPhase) : null;
  const activeFieldCount = (filters.titles ? 1 : 0) + (filters.authors ? 1 : 0) + (filters.figures ? 1 : 0) + (filters.dates ? 1 : 0);
  const activeFiltersCount = (selectedPhase !== null ? 1 : 0) + (dateRange !== null ? 1 : 0);

  return (
    <div className="flex flex-col h-full bg-nb-surface-low select-none relative">
      {/* Search Header */}
      <div className="p-3 border-b border-nb-outline-variant/30 space-y-2.5 relative z-20 bg-nb-surface-low">
        <div className="flex items-center justify-between h-5">
          <span className="text-[11px] font-black uppercase tracking-wider text-nb-on-surface-variant leading-none">
            Search Workspace
          </span>
          {results.length > 0 && (
            <span className="text-[10px] font-bold text-nb-primary bg-nb-primary/10 px-2 py-0.5 rounded-full leading-none animate-in fade-in duration-100">
              {results.length} {results.length === 1 ? "entry" : "entries"}
            </span>
          )}
        </div>

        {/* Search Input with inline Fields Toggle */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-nb-on-surface-variant/60" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, authors, figures..."
            className="w-full pl-8 pr-16 py-2 bg-nb-surface border border-nb-outline-variant/50 rounded-xl text-[11px] text-nb-on-surface placeholder:text-nb-on-surface-variant/40 focus:outline-none focus:ring-1.5 focus:ring-nb-primary transition-all shadow-nb-xs"
            autoFocus
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            {query && (
              <button
                onClick={() => setQuery("")}
                className="p-1 rounded-md text-nb-on-surface-variant/50 hover:text-nb-on-surface transition-colors cursor-pointer"
                title="Clear Search"
              >
                <X size={12} />
              </button>
            )}
            <button
              onClick={() => setIsSearchFieldsCollapsed(!isSearchFieldsCollapsed)}
              className={`p-1.5 rounded-lg transition-all cursor-pointer relative ${
                !isSearchFieldsCollapsed
                  ? "bg-nb-primary text-nb-on-primary shadow-xs"
                  : activeFieldCount < 4
                  ? "text-nb-primary bg-nb-primary/10"
                  : "text-nb-on-surface-variant/70 hover:text-nb-on-surface hover:bg-nb-surface-high/60"
              }`}
              title={`Toggle Search Fields (${activeFieldCount}/4 active)`}
            >
              <SlidersHorizontal size={12} />
              {activeFieldCount < 4 && isSearchFieldsCollapsed && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-nb-primary" />
              )}
            </button>
          </div>
        </div>

        {/* Section 1: Collapsible Search Fields (Expanded from icon) */}
        {!isSearchFieldsCollapsed && (
          <div className="border border-nb-outline-variant/30 rounded-xl overflow-hidden bg-nb-surface-lowest/40 p-2 text-[10px] animate-in fade-in zoom-in-98 duration-150">
            <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-nb-outline-variant/20">
              <span className="text-[9px] font-black uppercase tracking-wider text-nb-on-surface-variant/80">
                Match Against
              </span>
              <button
                onClick={toggleAllFields}
                className="text-[9px] font-bold text-nb-primary hover:underline cursor-pointer"
              >
                {allFieldsSelected ? "Deselect All" : "Select All"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {/* All Fields Checkbox */}
              <button
                onClick={toggleAllFields}
                className="col-span-2 flex items-center gap-2 p-1.5 rounded-lg hover:bg-nb-surface-high/40 transition-colors cursor-pointer text-left bg-nb-surface-high/20 border border-nb-outline-variant/30"
              >
                <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-all ${allFieldsSelected ? "bg-nb-primary border-nb-primary text-nb-on-primary" : activeFieldCount > 0 ? "border-nb-primary bg-nb-primary/20 text-nb-primary" : "border-nb-outline-variant bg-nb-surface"}`}>
                  {allFieldsSelected ? (
                    <Check size={10} strokeWidth={3} />
                  ) : activeFieldCount > 0 ? (
                    <span className="w-1.5 h-0.5 bg-nb-primary rounded-full" />
                  ) : null}
                </div>
                <span className="font-bold text-nb-on-surface">All Fields</span>
              </button>

              {/* Titles Checkbox */}
              <button
                onClick={() => toggleFilter("titles")}
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-nb-surface-high/40 transition-colors cursor-pointer text-left"
              >
                <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-all ${filters.titles ? "bg-nb-primary border-nb-primary text-nb-on-primary" : "border-nb-outline-variant bg-nb-surface"}`}>
                  {filters.titles && <Check size={10} strokeWidth={3} />}
                </div>
                <span className="text-nb-on-surface-variant font-medium">Titles</span>
              </button>

              {/* Authors Checkbox */}
              <button
                onClick={() => toggleFilter("authors")}
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-nb-surface-high/40 transition-colors cursor-pointer text-left"
              >
                <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-all ${filters.authors ? "bg-nb-primary border-nb-primary text-nb-on-primary" : "border-nb-outline-variant bg-nb-surface"}`}>
                  {filters.authors && <Check size={10} strokeWidth={3} />}
                </div>
                <span className="text-nb-on-surface-variant font-medium">Authors</span>
              </button>

              {/* Figures Checkbox */}
              <button
                onClick={() => toggleFilter("figures")}
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-nb-surface-high/40 transition-colors cursor-pointer text-left"
              >
                <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-all ${filters.figures ? "bg-nb-primary border-nb-primary text-nb-on-primary" : "border-nb-outline-variant bg-nb-surface"}`}>
                  {filters.figures && <Check size={10} strokeWidth={3} />}
                </div>
                <span className="text-nb-on-surface-variant font-medium">Figures</span>
              </button>

              {/* Dates Checkbox */}
              <button
                onClick={() => toggleFilter("dates")}
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-nb-surface-high/40 transition-colors cursor-pointer text-left"
              >
                <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-all ${filters.dates ? "bg-nb-primary border-nb-primary text-nb-on-primary" : "border-nb-outline-variant bg-nb-surface"}`}>
                  {filters.dates && <Check size={10} strokeWidth={3} />}
                </div>
                <span className="text-nb-on-surface-variant font-medium">Dates</span>
              </button>
            </div>
          </div>
        )}

        {/* Section 2: Collapsible Filter Options (Phase & Date Range) */}
        <div className="border border-nb-outline-variant/30 rounded-xl bg-nb-surface-lowest/40 relative z-30">
          <button
            onClick={() => setIsFiltersCollapsed(!isFiltersCollapsed)}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-nb-surface-high/30 transition-colors cursor-pointer select-none ${
              !isFiltersCollapsed ? "rounded-t-xl" : "rounded-xl"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Filter size={11} className="text-nb-on-surface-variant/70" />
              <span className="text-[10px] font-bold text-nb-on-surface-variant">Filters</span>
              {activeFiltersCount > 0 && (
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-nb-tertiary/15 text-nb-tertiary">
                  {activeFiltersCount} active
                </span>
              )}
            </div>
            <ChevronDown size={11} className={`text-nb-on-surface-variant/60 transition-transform ${!isFiltersCollapsed ? "rotate-180" : ""}`} />
          </button>

          {!isFiltersCollapsed && (
            <div className="p-2.5 pt-1.5 border-t border-nb-outline-variant/20 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
              {activeFiltersCount > 0 && (
                <div className="flex items-center justify-between pb-1 border-b border-nb-outline-variant/15">
                  <span className="text-[9px] font-bold text-nb-on-surface-variant/70">Active Filters</span>
                  <button
                    onClick={() => {
                      setSelectedPhase(null);
                      setDateRange(null);
                    }}
                    className="text-[9px] font-bold text-red-500 hover:underline cursor-pointer"
                  >
                    Reset All Filters
                  </button>
                </div>
              )}

              {/* Phase Filter Dropdown */}
              <div className="space-y-1">
                <label className="text-[8px] font-bold uppercase tracking-wider text-nb-on-surface-variant/60 block">Phase</label>
                <div className="relative w-full min-w-0">
                  <button
                    onClick={() => setIsPhaseDropdownOpen(!isPhaseDropdownOpen)}
                    className="w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 bg-nb-surface border border-nb-outline-variant/50 rounded-lg text-[10px] font-bold text-nb-on-surface hover:border-nb-primary transition-all cursor-pointer shadow-nb-xs min-w-0"
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                      {selectedPhaseObj ? (
                        <>
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: selectedPhaseObj.color }} />
                          <span className="truncate block flex-1 text-left">{selectedPhaseObj.name}</span>
                        </>
                      ) : (
                        <>
                          <Layers size={12} className="text-nb-on-surface-variant/60 shrink-0" />
                          <span className="text-nb-on-surface-variant/80 truncate block flex-1 text-left">All Phases</span>
                        </>
                      )}
                    </div>
                    <ChevronDown size={11} className={`text-nb-on-surface-variant/60 shrink-0 transition-transform ${isPhaseDropdownOpen ? "rotate-180" : ""}`} />
                  </button>

                  {isPhaseDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsPhaseDropdownOpen(false)} />
                      <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-nb-surface border border-nb-outline-variant rounded-xl shadow-nb-lg py-1 animate-in fade-in zoom-in-95 duration-150 max-h-48 overflow-y-auto w-full min-w-0">
                        <button
                          onClick={() => {
                            setSelectedPhase(null);
                            setIsPhaseDropdownOpen(false);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold transition-colors cursor-pointer min-w-0 overflow-hidden text-left ${
                            selectedPhase === null
                              ? "text-nb-primary bg-nb-primary/10"
                              : "text-nb-on-surface-variant hover:bg-nb-surface-low hover:text-nb-on-surface"
                          }`}
                        >
                          <Layers size={12} className="shrink-0" />
                          <span className="truncate flex-1">All Phases</span>
                        </button>

                        {phases.map(phase => (
                          <button
                            key={phase.id}
                            onClick={() => {
                              setSelectedPhase(phase.index);
                              setIsPhaseDropdownOpen(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold transition-colors cursor-pointer min-w-0 overflow-hidden text-left ${
                              selectedPhase === phase.index
                                ? "text-nb-primary bg-nb-primary/10"
                                : "text-nb-on-surface-variant hover:bg-nb-surface-low hover:text-nb-on-surface"
                            }`}
                          >
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: phase.color }} />
                            <span className="truncate flex-1">{phase.name}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Date Range Section */}
              <div className="space-y-1 pt-1 border-t border-nb-outline-variant/15">
                <div className="flex items-center justify-between">
                  <label className="text-[8px] font-bold uppercase tracking-wider text-nb-on-surface-variant/60 block">Date Range</label>
                  {dateRange && (
                    <button
                      onClick={() => setDateRange(null)}
                      className="text-[9px] font-bold text-red-500 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <input
                      type="date"
                      value={dateRange?.start || ""}
                      onChange={(e) => setDateRange({ start: e.target.value, end: dateRange?.end || "" })}
                      className="w-full bg-nb-surface border border-nb-outline-variant/60 rounded-lg px-2 py-1 text-[10px] text-nb-on-surface focus:outline-none focus:border-nb-primary"
                    />
                  </div>
                  <div>
                    <input
                      type="date"
                      value={dateRange?.end || ""}
                      onChange={(e) => setDateRange({ start: dateRange?.start || "", end: e.target.value })}
                      className="w-full bg-nb-surface border border-nb-outline-variant/60 rounded-lg px-2 py-1 text-[10px] text-nb-on-surface focus:outline-none focus:border-nb-primary"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 relative z-0">
        {results.length > 0 ? (
          results.map(({ file, matchesTitle, matchesAuthor, matchesDate, resourceMatches }) => {
            const phase = file.phase ? phaseMap.get(file.phase) : null;
            return (
              <div
                key={file.path}
                onClick={() => onSelectEntry(file)}
                className="w-full text-left p-2.5 rounded-xl bg-nb-surface hover:bg-nb-surface-high/80 border border-nb-outline-variant/30 hover:border-nb-primary/40 transition-all cursor-pointer group shadow-nb-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {/* Title */}
                    <div className="text-[12px] font-bold text-nb-on-surface truncate group-hover:text-nb-primary transition-colors">
                      {matchesTitle ? highlightMatch(file.title || "Untitled Entry", query) : (file.title || "Untitled Entry")}
                    </div>

                    {/* Metadata Row */}
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-nb-on-surface-variant">
                      {file.author && (
                        <span className="flex items-center gap-1 truncate">
                          <User size={10} className="shrink-0 opacity-70" />
                          <span className="truncate">
                            {matchesAuthor ? highlightMatch(file.author, query) : file.author}
                          </span>
                        </span>
                      )}
                      {file.date && (
                        <span className="flex items-center gap-1 shrink-0">
                          <Calendar size={10} className="shrink-0 opacity-70" />
                          <span>
                            {matchesDate ? highlightMatch(file.date, query) : file.date}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Phase Badge & Arrow */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {phase && (
                      <span
                        style={{ backgroundColor: `${phase.color}15`, color: phase.color, borderColor: `${phase.color}30` }}
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-md border"
                      >
                        {phase.name}
                      </span>
                    )}
                    <ChevronRight size={14} className="text-nb-on-surface-variant/40 group-hover:text-nb-primary group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>

                {/* Nested Resource Matches Jump Chips */}
                {resourceMatches.length > 0 && (
                  <div className="mt-2 pt-1.5 border-t border-nb-outline-variant/20 flex flex-col gap-1">
                    <span className="text-[8px] font-black uppercase tracking-wider text-nb-on-surface-variant/60 px-0.5">
                      Matched {resourceMatches.length === 1 ? "Figure / Resource" : `${resourceMatches.length} Figures / Resources`}:
                    </span>
                    {resourceMatches.map(res => (
                      <div
                        key={res.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectEntry(file, res.id);
                        }}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-nb-surface-low hover:bg-nb-primary/10 hover:text-nb-primary text-nb-on-surface-variant transition-colors cursor-pointer text-[10px] group/res border border-nb-outline-variant/20 hover:border-nb-primary/30"
                        title="Click to jump directly to this figure"
                      >
                        <ImageIcon size={11} className="text-nb-primary shrink-0" />
                        <span className="truncate flex-1 font-medium">
                          {highlightMatch(res.snippet, query)}
                        </span>
                        <span className="text-[8px] font-bold uppercase tracking-wider text-nb-on-surface-variant/40 group-hover/res:text-nb-primary shrink-0">
                          Jump ↗
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        ) : query.trim() || activeFiltersCount > 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-4">
            <Search size={28} className="text-nb-on-surface-variant/30 mb-2" />
            <span className="text-[12px] font-bold text-nb-on-surface-variant">No matches found</span>
            <span className="text-[10px] text-nb-on-surface-variant/60 mt-1">
              No entries matching your search and filter criteria
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-center p-4">
            <Search size={28} className="text-nb-on-surface-variant/30 mb-2" />
            <span className="text-[12px] font-bold text-nb-on-surface-variant">Search your entries</span>
            <span className="text-[10px] text-nb-on-surface-variant/60 mt-1 max-w-[200px]">
              Type a title, author name, figure caption, or date to quickly locate any item
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
