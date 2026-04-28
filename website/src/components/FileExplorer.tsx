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
  selectedPath: string | null;
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
      className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm cursor-pointer transition-all
        ${isDeleted ? "opacity-40 line-through" : ""}
        ${isSelected
          ? "bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100"
          : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800"
        }`}
      onClick={isDeleted ? undefined : onSelect}
    >
      {/* Icon */}
      <span className="shrink-0 text-gray-400 dark:text-zinc-500">{icon}</span>

      {/* Name / rename input */}
      {editing ? (
        <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") cancelEdit();
            }}
            className="flex-1 min-w-0 text-xs font-mono bg-white dark:bg-zinc-800 border border-blue-400 rounded px-1 py-0.5 outline-none"
            disabled={renaming}
          />
          <button onClick={commitRename} disabled={renaming} className="text-green-500 hover:text-green-600 shrink-0">
            <Check size={13} />
          </button>
          <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600 shrink-0">
            <X size={13} />
          </button>
        </div>
      ) : (
        <span className="flex-1 min-w-0 truncate text-xs font-mono">{file.name}</span>
      )}

      {/* Pending dot */}
      {isPending && !isDeleted && !editing && (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Staged change" />
      )}

      {/* Action buttons — visible on hover */}
      {!editing && !isDeleted && (
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={startEdit}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            title="Rename"
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors"
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
      <div className="flex items-center justify-between px-3 py-2 border-b dark:border-zinc-800 shrink-0">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-zinc-500">
          {title}
        </span>
        <button
          onClick={onAction}
          title={actionLabel}
          className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
        >
          {actionIcon}
          {actionLabel}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        {hasItems ? children : (
          <p className="text-[11px] text-gray-400 dark:text-zinc-600 px-2 py-3 italic">{empty}</p>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl p-6 shadow-2xl max-w-sm w-full mx-4 border dark:border-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-black text-sm uppercase tracking-widest dark:text-white mb-2">Confirm Delete</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
          Are you sure you want to delete:
        </p>
        <p className="text-sm font-mono text-red-600 dark:text-red-400 mb-5 break-all">{filename}</p>
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-5">
          If this is an image, all references to it in entries will be removed.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-xl border dark:border-zinc-700 text-sm dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FileExplorer({
  entries,
  resources,
  selectedPath,
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
            isSelected={selectedPath === f.path}
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
            isSelected={selectedPath === f.path}
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
