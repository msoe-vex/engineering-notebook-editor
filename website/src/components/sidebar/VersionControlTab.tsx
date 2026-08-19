import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  GitBranch,
  CheckCircle2,
  RotateCcw,
  Loader2,
  FileText,
  Users,
  Layers,
  FileCode,
  Image as ImageIcon,
  ChevronDown,
  ChevronRight,
  GitCompare,
  ExternalLink
} from "lucide-react";
import { PendingChange } from "@/lib/db";
import { useWorkspace } from "@/hooks/useWorkspace";
import { ENTRIES_DIR, LATEX_DIR, ASSETS_DIR, TEAM_PATH, PHASES_PATH, INDEX_PATH, ENTRIES_INDEX_PATH } from "@/lib/constants";
import { isBinaryFile } from "@/lib/transferUtils";
import DiffViewer from "./DiffViewer";

interface VersionControlTabProps {
  showConfirm: (title: string, message: string, onConfirm: () => void, variant?: "danger" | "warning" | "info") => void;
}

interface ChangeGroup {
  id: string;
  type: "entry" | "team" | "phases" | "assets" | "metadata" | "file";
  title: string;
  subtitle?: string;
  changes: PendingChange[];
  entryId?: string;
}

export default function VersionControlTab({ showConfirm }: VersionControlTabProps) {
  const {
    pendingChanges,
    metadata,
    mode,
    config,
    isCommitting,
    isDiscarding,
    commitAll,
    discardPendingChanges,
    discardPathChange,
    discardEntryChanges,
    discardTeamChanges,
    discardPhaseChanges,
    getBaseFileContent,
    navigateTo,
    openEntry
  } = useWorkspace();

  const [commitMessage, setCommitMessage] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [openDiffPaths, setOpenDiffPaths] = useState<Set<string>>(new Set());

  const toggleDiff = useCallback((path: string) => {
    setOpenDiffPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const [baseMetadata, setBaseMetadata] = useState<any>(null);

  useEffect(() => {
    let active = true;
    getBaseFileContent(INDEX_PATH).then(content => {
      if (!active) return;
      if (content) {
        try {
          setBaseMetadata(JSON.parse(content));
        } catch {
          setBaseMetadata(null);
        }
      } else {
        setBaseMetadata(null);
      }
    });
    return () => { active = false; };
  }, [getBaseFileContent, pendingChanges]);

  // Group pending changes logically
  const changeGroups = useMemo<ChangeGroup[]>(() => {
    if (!pendingChanges || pendingChanges.length === 0) return [];

    const entryMap = new Map<string, PendingChange[]>();
    const teamChanges: PendingChange[] = [];
    const phaseChanges: PendingChange[] = [];
    const metaChanges: PendingChange[] = [];
    const otherChanges: PendingChange[] = [];

    const assetChanges: PendingChange[] = [];

    for (const p of pendingChanges) {
      if (p.path.startsWith(`${ENTRIES_DIR}/`) && p.path.endsWith('.json')) {
        const id = p.path.replace(`${ENTRIES_DIR}/`, '').replace('.json', '');
        if (!entryMap.has(id)) entryMap.set(id, []);
        entryMap.get(id)!.push(p);
      } else if (p.path.startsWith(`${LATEX_DIR}/`) && p.path.endsWith('.tex')) {
        const id = p.path.replace(`${LATEX_DIR}/`, '').replace('.tex', '');
        if (!entryMap.has(id)) entryMap.set(id, []);
        entryMap.get(id)!.push(p);
      } else if (p.path.startsWith(`${ASSETS_DIR}/`)) {
        assetChanges.push(p);
      } else if (p.path === TEAM_PATH || p.path.includes('team.json') || p.path.includes('team.tex')) {
        teamChanges.push(p);
      } else if (p.path === PHASES_PATH || p.path.includes('phases.json') || p.path.includes('phases.tex')) {
        phaseChanges.push(p);
      } else if (p.path === INDEX_PATH || p.path === ENTRIES_INDEX_PATH) {
        metaChanges.push(p);
      } else {
        otherChanges.push(p);
      }
    }

    // Check for entries/templates that changed only in notebook.json
    const metadataOnlyEntryIds = new Set<string>();
    if (baseMetadata?.entries && metadata?.entries) {
      const baseEntries = baseMetadata.entries as Record<string, any>;
      const currentEntries = metadata.entries as Record<string, any>;
      for (const [id, entry] of Object.entries(currentEntries)) {
        if (!entryMap.has(id)) {
          const baseEntry = baseEntries[id];
          if (!baseEntry || JSON.stringify(baseEntry) !== JSON.stringify(entry)) {
            entryMap.set(id, []);
            metadataOnlyEntryIds.add(id);
          }
        }
      }
    }

    const groups: ChangeGroup[] = [];

    // 1. Grouped Entries
    for (const [entryId, changes] of entryMap.entries()) {
      const entryMeta = metadata.entries[entryId];
      const title = entryMeta?.title || "Untitled Entry";
      const isNew = changes.some(c => c.changeType === 'create');
      const isDel = changes.some(c => c.operation === 'delete');
      const isMetaOnly = metadataOnlyEntryIds.has(entryId);

      groups.push({
        id: `entry-${entryId}`,
        type: "entry",
        title,
        subtitle: isDel ? "Deleted" : isNew ? "New Entry" : isMetaOnly ? "Metadata Modified" : "Modified",
        changes,
        entryId
      });
    }

    // 2. Team Metadata
    if (teamChanges.length > 0) {
      groups.push({
        id: "team-settings",
        type: "team",
        title: "Team Identity & Members",
        subtitle: `${teamChanges.length} file(s)`,
        changes: teamChanges
      });
    }

    // 3. Phase Settings
    if (phaseChanges.length > 0) {
      groups.push({
        id: "phase-settings",
        type: "phases",
        title: "Design Process Phases",
        subtitle: `${phaseChanges.length} file(s)`,
        changes: phaseChanges
      });
    }

    // 4. Asset Files (Images / Media attachments, managed automatically with entries)
    if (assetChanges.length > 0) {
      groups.push({
        id: "project-assets",
        type: "assets",
        title: "Asset Files & Media",
        subtitle: `${assetChanges.length} asset(s)`,
        changes: assetChanges
      });
    }

    // 5. Notebook Index
    if (metaChanges.length > 0) {
      groups.push({
        id: "notebook-meta",
        type: "metadata",
        title: "Project Index",
        subtitle: "notebook.json",
        changes: metaChanges
      });
    }

    // 6. Other loose files
    for (const file of otherChanges) {
      groups.push({
        id: `file-${file.path}`,
        type: "file",
        title: file.path.split('/').pop() || file.path,
        subtitle: file.path,
        changes: [file]
      });
    }

    return groups;
  }, [pendingChanges, metadata]);

  const handleCommit = useCallback(async () => {
    if (!config) return;
    try {
      await commitAll(config, commitMessage.trim() || undefined);
      setCommitMessage("");
      setOpenDiffPaths(new Set());
    } catch (err) {
      console.error("Commit failed:", err);
    }
  }, [config, commitAll, commitMessage]);

  const handleDiscardAll = useCallback(() => {
    showConfirm(
      "Discard All Changes?",
      "Are you sure you want to discard all uncommitted changes? This will revert all your unsaved modifications and cannot be undone.",
      () => {
        discardPendingChanges();
      },
      "danger"
    );
  }, [showConfirm, discardPendingChanges]);

  const handleDiscardGroup = useCallback((group: ChangeGroup) => {
    showConfirm(
      `Discard changes to "${group.title}"?`,
      `Are you sure you want to revert all changes for this item? This action cannot be undone.`,
      () => {
        if (group.type === "entry" && group.entryId) {
          discardEntryChanges(group.entryId);
        } else if (group.type === "team") {
          discardTeamChanges();
        } else if (group.type === "phases") {
          discardPhaseChanges();
        } else {
          for (const change of group.changes) {
            discardPathChange(change.path);
          }
        }
      },
      "danger"
    );
  }, [showConfirm, discardEntryChanges, discardTeamChanges, discardPhaseChanges, discardPathChange]);

  if (mode !== "github") {
    const isTemp = mode === "temporary";
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center select-none bg-nb-surface-low">
        <GitBranch size={32} className="text-nb-on-surface-variant/30 mb-3" />
        <span className="text-[13px] font-bold text-nb-on-surface">
          {isTemp ? "Temporary Playground" : "Local Workspace"}
        </span>
        <p className="text-[11px] text-nb-on-surface-variant/70 mt-1.5 max-w-55 leading-relaxed">
          {isTemp
            ? "Git version control and commit history are active when working inside a GitHub-connected repository. You can export your sandbox notebook anytime via the Export button."
            : "Local filesystem mode writes changes directly to your computer. Git version control tracking is active for GitHub projects."}
        </p>
      </div>
    );
  }

  const hasChanges = (pendingChanges || []).length > 0;

  return (
    <div className="flex flex-col h-full bg-nb-surface-low select-none">
      {/* Header */}
      <div className="p-3.5 border-b border-nb-outline-variant/30 flex items-center justify-between shrink-0 bg-nb-surface-low">
        <div className="flex items-center gap-2">
          <GitBranch size={15} className="text-nb-tertiary" />
          <span className="text-[11px] font-black uppercase tracking-wider text-nb-on-surface">
            Source Control
          </span>
        </div>

        {hasChanges && (
          <button
            onClick={handleDiscardAll}
            disabled={isDiscarding || isCommitting}
            title="Discard All Uncommitted Changes"
            className="flex items-center gap-1 text-[10px] font-bold text-red-500/80 hover:text-red-500 hover:bg-red-500/10 px-2 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            {isDiscarding ? (
              <Loader2 size={11} className="animate-spin-stable" />
            ) : (
              <>
                <RotateCcw size={11} />
                <span>Discard All</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {hasChanges ? (
          <>
            {/* Commit Message Box */}
            <div className="space-y-2">
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Commit message (e.g. Added drivetrain design entry)..."
                disabled={isCommitting || isDiscarding}
                rows={3}
                className="w-full bg-nb-surface border border-nb-outline-variant/50 rounded-xl p-2.5 text-[11px] text-nb-on-surface placeholder:text-nb-on-surface-variant/40 focus:outline-none focus:ring-1.5 focus:ring-nb-tertiary transition-all resize-none shadow-nb-xs"
              />

              <button
                onClick={handleCommit}
                disabled={isCommitting || isDiscarding}
                className="w-full bg-nb-tertiary hover:bg-nb-tertiary-dim text-white text-[11px] font-bold tracking-wider py-2.5 rounded-xl transition-all active:scale-[0.99] shadow-nb-sm disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"
              >
                {isCommitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin-stable" />
                    <span>Committing to GitHub...</span>
                  </>
                ) : (
                  <>
                    <GitBranch size={13} />
                    <span>Commit & Push Changes</span>
                  </>
                )}
              </button>
            </div>

            {/* Changed Items Count */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-nb-on-surface-variant/70">
                Staged Changes ({pendingChanges.length})
              </span>
            </div>

            {/* Change Groups */}
            <div className="space-y-1.5">
              {changeGroups.map(group => {
                const isExpanded = expandedGroups.has(group.id);
                return (
                  <div
                    key={group.id}
                    className="rounded-xl bg-nb-surface border border-nb-outline-variant/30 overflow-hidden shadow-nb-xs"
                  >
                    {/* Group Header */}
                    <div className="p-2.5 flex items-center justify-between gap-2 hover:bg-nb-surface-high/40 transition-colors">
                      <button
                        onClick={() => toggleGroup(group.id)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
                      >
                        {isExpanded ? (
                          <ChevronDown size={14} className="text-nb-on-surface-variant/60 shrink-0" />
                        ) : (
                          <ChevronRight size={14} className="text-nb-on-surface-variant/60 shrink-0" />
                        )}

                        {group.type === "entry" ? (
                          <FileText size={14} className="text-nb-primary shrink-0" />
                        ) : group.type === "team" ? (
                          <Users size={14} className="text-purple-500 shrink-0" />
                        ) : group.type === "phases" ? (
                          <Layers size={14} className="text-amber-500 shrink-0" />
                        ) : group.type === "assets" ? (
                          <ImageIcon size={14} className="text-emerald-500 shrink-0" />
                        ) : (
                          <FileCode size={14} className="text-nb-on-surface-variant shrink-0" />
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-bold text-nb-on-surface truncate">
                            {group.title}
                          </div>
                          {group.subtitle && (
                            <div className="text-[9px] text-nb-on-surface-variant/70 font-medium">
                              {group.subtitle}
                            </div>
                          )}
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Open Entry in Editor Button (only for entry groups that are not deleted) */}
                        {group.type === "entry" && group.entryId && group.subtitle !== "Deleted" && (
                          <button
                            onClick={async () => {
                              if (group.entryId) {
                                navigateTo({ entry: group.entryId, resource: null }, '/workspace/editor');
                                await openEntry(group.entryId);
                              }
                            }}
                            title={`Open "${group.title}" in Editor`}
                            className="p-1 text-nb-on-surface-variant/50 hover:text-nb-primary hover:bg-nb-surface-high rounded-md transition-colors cursor-pointer"
                          >
                            <ExternalLink size={12} />
                          </button>
                        )}

                        {/* Revert Group Button (Hidden for global metadata & assets to prevent de-syncing entries) */}
                        {group.type !== "metadata" && group.type !== "assets" && (
                          <button
                            onClick={() => handleDiscardGroup(group)}
                            disabled={isDiscarding || isCommitting}
                            title={`Revert ${group.title}`}
                            className="p-1 text-nb-on-surface-variant/50 hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {isDiscarding ? (
                              <Loader2 size={12} className="animate-spin-stable text-red-500" />
                            ) : (
                              <RotateCcw size={12} />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Group Expanded Files */}
                    {isExpanded && (
                      <div className="bg-nb-surface-low/60 border-t border-nb-outline-variant/20 p-2 space-y-1.5 pl-4">
                        {group.changes.length === 0 ? (
                          <div className="text-[10px] italic text-nb-on-surface-variant/60 py-0.5">
                            Metadata modified in notebook.json
                          </div>
                        ) : (
                          group.changes.map(c => {
                            const fileName = c.path.split('/').pop() || c.path;
                            const isDelete = c.operation === "delete";
                            const isNew = c.changeType === "create";
                            const isBinary = isBinaryFile(c.path);
                            const isDiffOpen = openDiffPaths.has(c.path);

                            return (
                              <div key={c.path} className="flex flex-col">
                              <div
                                onClick={() => !isBinary && toggleDiff(c.path)}
                                className={`flex items-center justify-between text-[10px] text-nb-on-surface-variant py-1 px-1.5 rounded-lg ${!isBinary ? 'hover:bg-nb-surface-mid/60 cursor-pointer' : 'cursor-default'} transition-colors group ${isDiffOpen ? 'bg-nb-surface-mid/80 text-nb-on-surface' : ''}`}
                              >
                                <div className="flex items-center gap-1.5 truncate min-w-0">
                                  <span
                                    className={`text-[8px] font-bold uppercase px-1 py-0.2 rounded shrink-0 ${
                                      isDelete
                                        ? "bg-red-500/15 text-red-500"
                                        : isNew
                                        ? "bg-emerald-500/15 text-emerald-500"
                                        : "bg-blue-500/15 text-blue-500"
                                    }`}
                                  >
                                    {isDelete ? "DEL" : isNew ? "NEW" : "MOD"}
                                  </span>
                                  <span className="truncate font-mono text-[10px] font-medium">{fileName}</span>
                                </div>

                                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                  {!isBinary ? (
                                    <button
                                      onClick={() => toggleDiff(c.path)}
                                      title={isDiffOpen ? "Hide Diff" : "View Git Diff"}
                                      className={`p-1 rounded transition-colors cursor-pointer ${
                                        isDiffOpen
                                          ? "bg-nb-primary/15 text-nb-primary"
                                          : "text-nb-on-surface-variant/50 hover:text-nb-primary hover:bg-nb-surface-high opacity-0 group-hover:opacity-100"
                                      }`}
                                    >
                                      <GitCompare size={11} />
                                    </button>
                                  ) : (
                                    <span className="text-[9px] font-mono text-nb-on-surface-variant/40 px-1">
                                      binary
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Inline Diff Viewer */}
                              {isDiffOpen && (
                                <DiffViewer
                                  change={c}
                                  getBaseContent={getBaseFileContent}
                                  onClose={() => toggleDiff(c.path)}
                                />
                              )}
                            </div>
                          );
                        })
                      )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-56 text-center p-4">
            <CheckCircle2 size={32} className="text-emerald-500/60 mb-2.5" />
            <span className="text-[12px] font-bold text-nb-on-surface">No Pending Changes</span>
            <span className="text-[10px] text-nb-on-surface-variant/60 mt-1 max-w-50">
              All your entries and templates are synchronized with the repository.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
