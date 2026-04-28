"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon, Pencil, Trash2, X } from "lucide-react";

interface ImagePreviewProps {
  filename: string;
  /** base64 data URL or object URL */
  src: string;
  onRename: (newName: string) => Promise<void>;
  onDelete: () => void;
}

export default function ImagePreview({ filename, src, onRename, onDelete }: ImagePreviewProps) {
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(filename);
  const [renaming, setRenaming] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setDraftName(filename);
    setEditing(false);
    setDimensions(null);
  }, [filename]);

  const handleImageLoad = () => {
    const img = imgRef.current;
    if (img) setDimensions({ w: img.naturalWidth, h: img.naturalHeight });
  };

  const commitRename = async () => {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === filename) { setEditing(false); return; }
    setRenaming(true);
    try { await onRename(trimmed); }
    finally { setRenaming(false); setEditing(false); }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5 bg-black/40 shrink-0">
        <ImageIcon size={15} className="text-zinc-500" />
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") { setEditing(false); setDraftName(filename); }
                }}
                className="flex-1 text-xs font-mono bg-zinc-800 border border-blue-500 rounded px-2 py-1 outline-none"
                disabled={renaming}
              />
              <button
                onClick={commitRename}
                disabled={renaming}
                className="text-xs text-blue-400 hover:text-blue-300 font-bold"
              >
                {renaming ? "Renaming…" : "Save"}
              </button>
              <button onClick={() => { setEditing(false); setDraftName(filename); }}>
                <X size={13} className="text-zinc-500 hover:text-zinc-300" />
              </button>
            </div>
          ) : (
            <span className="text-[11px] font-mono text-zinc-400 truncate">{filename}</span>
          )}
        </div>
        {!editing && (
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition-colors"
              title="Rename image"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 rounded-lg hover:bg-red-900/30 text-zinc-500 hover:text-red-400 transition-colors"
              title="Delete image"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
        <div className="flex flex-col items-center gap-4 max-w-full">
          <img
            ref={imgRef}
            src={src}
            alt={filename}
            onLoad={handleImageLoad}
            className="max-w-full max-h-[60vh] rounded-xl shadow-2xl shadow-black/60 border border-white/5 object-contain"
          />
          {dimensions && (
            <div className="flex gap-4 text-xs text-zinc-500 font-mono">
              <span>{dimensions.w} × {dimensions.h} px</span>
              <span>·</span>
              <span>{filename.split(".").pop()?.toUpperCase()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="bg-zinc-900 rounded-2xl p-6 shadow-2xl max-w-sm w-full mx-4 border border-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-black text-sm uppercase tracking-widest text-white mb-2">Delete Image?</h3>
            <p className="text-sm text-zinc-400 mb-1">
              <span className="font-mono text-red-400">{filename}</span> will be staged for deletion.
            </p>
            <p className="text-xs text-amber-400 mb-5">
              All references to this image in your entries will be removed automatically.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 rounded-xl border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); onDelete(); }}
                className="flex-1 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
