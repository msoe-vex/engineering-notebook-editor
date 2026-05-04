"use client";

import React, { useState } from "react";
import {
  FileText, Image as ImageIcon, Pencil, Trash2, Plus, Upload, Check, X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExplorerFile {
  name: string;
  path: string;
  title?: string;
  author?: string;
  timestamp?: string;
  updatedAt?: string;
}

interface FileExplorerProps {
  entries: ExplorerFile[];
  resources: ExplorerFile[];
  activePath: string | null;
  pendingPaths: Set<string>;   // paths with staged (unsaved) changes — shown with dot badge
  deletedPaths: Set<string>;   // paths staged for deletion — shown with strikethrough
  onSelectEntry: (file: ExplorerFile) => void;
  onSelectResource: (file: ExplorerFile) => void;
  onNewEntry: () => void;
  onUploadResource: () => void;
  onDeleteEntry: (file: ExplorerFile) => void;
  onDeleteResource: (file: ExplorerFile) => void;
  search: string;
  onSearchChange: (val: string) => void;
  sortBy: "created" | "updated" | "title";
  onSortChange: (val: "created" | "updated" | "title") => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"]);

function extOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function isImageFile(name: string) {
  return IMAGE_EXTS.has(extOf(name));
}

// ─── Single file row ──────────────────────────────────────────────────────────

interface FileRowProps {
  file: ExplorerFile;
  isSelected: boolean;
  isPending: boolean;
  isDeleted: boolean;
  icon: React.ReactNode;
  onSelect: () => void;
  onDelete: () => void;
}

function FileRow({ file, isSelected, isPending, isDeleted, icon, onSelect, onDelete }: FileRowProps) {
  return (
    <div
      onClick={isDeleted ? undefined : onSelect}
      className={`
        group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer select-none
        ${isSelected 
          ? 'bg-nb-tertiary text-white shadow-lg shadow-nb-tertiary/20' 
          : 'hover:bg-nb-surface-mid text-nb-on-surface'
        }
        ${isDeleted ? 'opacity-30 grayscale' : ''}
      `}
    >
      <div className={`shrink-0 ${isSelected ? 'text-white' : 'text-nb-tertiary'}`}>
        {icon}
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        <span className={`truncate font-bold tracking-tight leading-tight ${isSelected ? 'text-white' : 'text-nb-on-surface'}`}>
          {file.title || "New Entry"}
        </span>
        <span className={`text-[9px] font-mono truncate mt-0.5 ${isSelected ? 'text-white/70' : 'opacity-40'}`}>
           {(() => {
             const ts = file.updatedAt || file.timestamp || Date.now();
             const d = new Date(ts);
             const valid = !isNaN(d.getTime());
             return (valid ? d : new Date()).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
           })()}
        </span>
      </div>

      {/* Pending dot */}
      {isPending && !isDeleted && (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 animate-pulse shadow-sm ${isSelected ? 'bg-white' : 'bg-nb-tertiary shadow-nb-tertiary/50'}`} title="Staged change" />
      )}

      {/* Delete button — visible on hover */}
      {!isDeleted && (
        <div className="flex gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className={`p-1 rounded-md transition-colors ${isSelected ? 'hover:bg-white/20 text-white' : 'hover:bg-nb-primary/10 text-nb-on-surface-variant/70 hover:text-nb-primary'}`}
            title="Delete"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Pane ─────────────────────────────────────────────────────────────────────

interface PaneProps {
  id: string;
  title: string;
  actionLabel: string;
  actionIcon: React.ReactNode;
  onAction: () => void;
  children: React.ReactNode;
  empty: string;
  hasItems: boolean;
}

function Pane({ id, title, actionLabel, actionIcon, onAction, children, empty, hasItems }: PaneProps) {
  return (
    <div id={id} className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center justify-between px-4 py-3 border-b border-nb-surface-mid dark:border-nb-dark-outline-variant shrink-0 bg-nb-surface-low/50 dark:bg-nb-dark-surface-low/30">
        <span className="text-sm font-semibold text-nb-on-surface">
          {title}
        </span>
        <button
          onClick={onAction}
          title={actionLabel}
          className="flex items-center gap-1.5 text-xs font-semibold text-nb-tertiary hover:text-nb-tertiary-dim transition-colors"
        >
          {actionIcon}
          {actionLabel}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2.5 min-h-0 bg-nb-surface-lowest dark:bg-nb-dark-bg">
        {hasItems ? children : (
          <p className="text-[11px] text-nb-on-surface-variant/60 dark:text-nb-dark-on-variant/40 px-3 py-5 italic font-medium tracking-tight">{empty}</p>
        )}
      </div>
    </div>
  );
}

// ─── Delete confirmation dialog ───────────────────────────────────────────────

interface DeleteDialogProps {
  filename: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteDialog({ filename, onConfirm, onCancel }: DeleteDialogProps) {
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-nb-secondary/60 backdrop-blur-md px-4" onClick={onCancel}>
      <div
        className="bg-nb-surface-lowest dark:bg-nb-dark-surface rounded-2xl p-7 shadow-nb-lg max-w-sm w-full border border-nb-outline-variant dark:border-nb-dark-outline animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-nb-primary/10 flex items-center justify-center shrink-0">
            <Trash2 size={20} className="text-nb-primary" />
          </div>
          <h3 className="font-bold text-sm uppercase tracking-widest text-nb-secondary dark:text-white">Confirm Delete</h3>
        </div>
        
        <div className="space-y-4 mb-8">
          <p className="text-sm text-nb-on-surface-variant dark:text-nb-dark-on-variant leading-relaxed">
            Are you sure you want to delete the following file? This action is staged until you commit.
          </p>
          <div className="p-3 bg-nb-surface-low dark:bg-nb-dark-surface-low border border-nb-outline-variant dark:border-nb-dark-outline rounded-xl">
            <p className="text-xs font-mono text-nb-primary break-all font-bold">{filename}</p>
          </div>
          <div className="flex items-start gap-2.5 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30 rounded-xl">
            <AlertTriangle size={14} className="text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-normal font-medium">
              If this is a resource, all references in your entries will be automatically updated.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-nb-outline-variant dark:border-nb-dark-outline text-xs font-bold uppercase tracking-widest text-nb-on-surface-variant hover:bg-nb-surface-low dark:hover:bg-nb-dark-surface-low transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl bg-nb-primary text-white text-xs font-bold uppercase tracking-widest hover:bg-nb-primary-dim transition-all shadow-md shadow-nb-primary/20 active:scale-[0.98]"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Icons for pane ────────────────────────────────────────────────────────────

import { AlertTriangle, Search, SortAsc, Clock, Calendar } from "lucide-react";

// ─── Main component ───────────────────────────────────────────────────────────

export default function FileExplorer({
  entries,
  resources,
  activePath,
  pendingPaths,
  deletedPaths,
  onSelectEntry,
  onSelectResource,
  onNewEntry,
  onUploadResource,
  onDeleteEntry,
  onDeleteResource,
  search,
  onSearchChange,
  sortBy,
  onSortChange,
}: FileExplorerProps) {
  const [deleteTarget, setDeleteTarget] = useState<{ file: ExplorerFile; type: "entry" | "resource" } | null>(null);

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "entry") onDeleteEntry(deleteTarget.file);
    else onDeleteResource(deleteTarget.file);
    setDeleteTarget(null);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search and Sort Header */}
      <div className="px-3 py-3 bg-nb-surface border-b border-nb-outline-variant space-y-3 shrink-0">
        <div className="relative group">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-nb-on-surface-variant/40 group-focus-within:text-nb-primary transition-colors">
            <Search size={14} />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search entries..."
            className="w-full bg-nb-surface-low border border-nb-outline-variant rounded-xl py-2 pl-9 pr-4 text-xs font-medium placeholder:text-nb-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-nb-primary/20 focus:border-nb-primary transition-all"
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute inset-y-0 right-3 flex items-center text-nb-on-surface-variant/40 hover:text-nb-primary transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex gap-2">
          {[
            { id: 'updated', label: 'Recent', icon: <Clock size={10} /> },
            { id: 'created', label: 'History', icon: <Calendar size={10} /> },
            { id: 'title', label: 'A-Z', icon: <SortAsc size={10} /> }
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => onSortChange(s.id as any)}
              className={`
                flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all
                ${sortBy === s.id 
                  ? 'bg-nb-tertiary text-white shadow-sm shadow-nb-tertiary/20' 
                  : 'bg-nb-surface-low text-nb-on-surface-variant/60 hover:text-nb-primary hover:bg-nb-surface-mid'
                }
              `}
            >
              {s.icon}
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Entries pane */}
      <Pane
        id="explorer-entries-pane"
        title="Entries"
        actionLabel="New"
        actionIcon={<Plus size={11} />}
        onAction={onNewEntry}
        empty={search ? "No matches found." : "No entries yet."}
        hasItems={entries.length > 0}
      >
        {entries.map((f) => (
          <FileRow
            key={f.path}
            file={f}
            isSelected={activePath === f.path}
            isPending={pendingPaths.has(f.path)}
            isDeleted={deletedPaths.has(f.path)}
            icon={<FileText size={13} />}
            onSelect={() => onSelectEntry(f)}
            onDelete={() => setDeleteTarget({ file: f, type: "entry" })}
          />
        ))}
      </Pane>

      {/* Resources pane hidden to simplify UI */}

      {/* Delete dialog */}
      {deleteTarget && (
        <DeleteDialog
          filename={deleteTarget.file.name}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
