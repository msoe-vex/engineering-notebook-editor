"use client";

import React, { useState } from "react";
import {
  FileText, Image as ImageIcon, Pencil, Trash2, Plus, Upload, Check, X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExplorerFile {
  name: string;
  path: string;
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
  onRenameEntry: (file: ExplorerFile, newName: string) => Promise<void>;
  onRenameResource: (file: ExplorerFile, newName: string) => Promise<void>;
  onDeleteEntry: (file: ExplorerFile) => void;
  onDeleteResource: (file: ExplorerFile) => void;
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
  onRename: (newName: string) => Promise<void>;
  onDelete: () => void;
}

function FileRow({ file, isSelected, isPending, isDeleted, icon, onSelect, onRename, onDelete }: FileRowProps) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(file.name);
  const [renaming, setRenaming] = useState(false);

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraftName(file.name);
    setEditing(true);
  };

  const commitRename = async () => {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === file.name) { setEditing(false); return; }
    setRenaming(true);
    try {
      await onRename(trimmed);
    } finally {
      setRenaming(false);
      setEditing(false);
    }
  };

  const cancelEdit = () => { setEditing(false); setDraftName(file.name); };

  return (
    <div
      className={`group flex items-center gap-2.5 py-2 px-2.5 rounded-lg text-xs cursor-pointer transition-all
        ${isDeleted ? "opacity-30 line-through" : ""}
        ${isSelected
          ? "bg-nb-surface-mid dark:bg-nb-dark-surface-high text-nb-secondary dark:text-nb-dark-on-surface ring-1 ring-nb-outline-variant/30 dark:ring-nb-dark-outline/30"
          : "text-nb-on-surface-variant dark:text-nb-dark-on-variant hover:bg-nb-surface-low dark:hover:bg-nb-dark-surface-low"
        }`}
      onClick={isDeleted ? undefined : onSelect}
    >
      {/* Icon */}
      <span className={`shrink-0 ${isSelected ? "text-nb-primary" : "text-nb-outline dark:text-nb-dark-on-variant"}`}>{icon}</span>

      {/* Name / rename input */}
      {editing ? (
        <div className="flex items-center gap-1.5 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") cancelEdit();
            }}
            className="flex-1 min-w-0 text-[11px] font-mono bg-nb-surface-lowest dark:bg-nb-dark-surface-low border border-nb-tertiary/50 rounded-md px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-nb-tertiary text-nb-on-surface dark:text-white"
            disabled={renaming}
          />
          <button onClick={commitRename} disabled={renaming} className="text-nb-tertiary hover:text-nb-tertiary-dim shrink-0">
            <Check size={14} />
          </button>
          <button onClick={cancelEdit} className="text-nb-outline hover:text-nb-on-surface shrink-0">
            <X size={14} />
          </button>
        </div>
      ) : (
        <span className="flex-1 min-w-0 truncate font-mono tracking-tight text-nb-on-surface dark:text-nb-dark-on-surface">{file.name}</span>
      )}

      {/* Pending dot */}
      {isPending && !isDeleted && !editing && (
        <span className="w-1.5 h-1.5 rounded-full bg-nb-tertiary shrink-0 animate-pulse shadow-sm shadow-nb-tertiary/50" title="Staged change" />
      )}

      {/* Action buttons — visible on hover */}
      {!editing && !isDeleted && (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={startEdit}
            className="p-1 rounded-md hover:bg-nb-surface-mid dark:hover:bg-nb-dark-surface-highest text-nb-on-surface-variant/70 dark:text-white/40 hover:text-nb-tertiary dark:hover:text-nb-tertiary transition-colors"
            title="Rename"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded-md hover:bg-nb-primary/10 dark:hover:bg-nb-primary/20 text-nb-on-surface-variant/70 dark:text-white/40 hover:text-nb-primary transition-colors"
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
        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-nb-secondary/60 dark:text-white/50">
          {title}
        </span>
        <button
          onClick={onAction}
          title={actionLabel}
          className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-nb-tertiary hover:text-nb-tertiary-dim transition-colors"
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-nb-secondary/60 backdrop-blur-md px-4" onClick={onCancel}>
      <div
        className="bg-nb-surface-lowest dark:bg-nb-dark-surface rounded-2xl p-7 shadow-nb-lg max-w-sm w-full border border-nb-outline-variant dark:border-nb-dark-outline animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-nb-primary/10 flex items-center justify-center shrink-0">
            <Trash2 size={20} className="text-nb-primary" />
          </div>
          <h3 className="font-black text-sm uppercase tracking-widest text-nb-secondary dark:text-white">Confirm Delete</h3>
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
            className="flex-1 px-4 py-2.5 rounded-xl border border-nb-outline-variant dark:border-nb-dark-outline text-xs font-black uppercase tracking-widest text-nb-on-surface-variant hover:bg-nb-surface-low dark:hover:bg-nb-dark-surface-low transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl bg-nb-primary text-white text-xs font-black uppercase tracking-widest hover:bg-nb-primary-dim transition-all shadow-md shadow-nb-primary/20 active:scale-[0.98]"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Icons for pane ────────────────────────────────────────────────────────────

import { AlertTriangle } from "lucide-react";

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
  onRenameEntry,
  onRenameResource,
  onDeleteEntry,
  onDeleteResource,
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
      {/* Entries pane */}
      <Pane
        id="explorer-entries-pane"
        title="Entries"
        actionLabel="New"
        actionIcon={<Plus size={11} />}
        onAction={onNewEntry}
        empty="No entries yet."
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
            onRename={(newName) => onRenameEntry(f, newName)}
            onDelete={() => setDeleteTarget({ file: f, type: "entry" })}
          />
        ))}
      </Pane>

      {/* Divider */}
      <div className="h-px bg-gray-200 dark:bg-zinc-800 shrink-0" />

      {/* Resources pane */}
      <Pane
        id="explorer-resources-pane"
        title="Resources"
        actionLabel="Upload"
        actionIcon={<Upload size={11} />}
        onAction={onUploadResource}
        empty="No images yet."
        hasItems={resources.length > 0}
      >
        {resources.map((f) => (
          <FileRow
            key={f.path}
            file={f}
            isSelected={activePath === f.path}
            isPending={pendingPaths.has(f.path)}
            isDeleted={deletedPaths.has(f.path)}
            icon={<ImageIcon size={13} />}
            onSelect={() => onSelectResource(f)}
            onRename={(newName) => onRenameResource(f, newName)}
            onDelete={() => setDeleteTarget({ file: f, type: "resource" })}
          />
        ))}
      </Pane>

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
