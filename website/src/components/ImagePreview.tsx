"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon, Pencil, Trash2, X, Check, AlertTriangle } from "lucide-react";

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
    <div className="flex flex-col h-full bg-nb-dark-bg text-nb-dark-on-surface">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-nb-dark-outline-variant bg-nb-dark-surface shrink-0">
        <div className="w-8 h-8 rounded-lg bg-nb-tertiary/10 flex items-center justify-center shrink-0">
          <ImageIcon size={16} className="text-nb-tertiary" />
        </div>
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
                className="flex-1 text-[11px] font-mono bg-nb-dark-surface-low border border-nb-tertiary/50 rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-nb-tertiary"
                disabled={renaming}
              />
              <div className="flex gap-1">
                <button
                  onClick={commitRename}
                  disabled={renaming}
                  className="p-1.5 rounded-lg hover:bg-nb-tertiary/10 text-nb-tertiary transition-colors"
                >
                  <Check size={14} />
                </button>
                <button 
                  onClick={() => { setEditing(false); setDraftName(filename); }}
                  className="p-1.5 rounded-lg hover:bg-nb-dark-surface-high text-nb-dark-on-variant transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
               <span className="text-[10px] font-black uppercase tracking-[0.2em] text-nb-dark-on-variant/50 leading-none mb-1">Resource Image</span>
               <span className="text-[11px] font-mono text-nb-dark-on-surface truncate tracking-tight">{filename}</span>
            </div>
          )}
        </div>
        {!editing && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setEditing(true)}
              className="p-2 rounded-lg hover:bg-nb-dark-surface-high text-nb-dark-on-variant hover:text-nb-dark-on-surface transition-all"
              title="Rename image"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 rounded-lg hover:bg-nb-primary/10 text-nb-dark-on-variant hover:text-nb-primary transition-all"
              title="Delete image"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Image Display Area */}
      <div className="flex-1 flex items-center justify-center p-12 overflow-auto bg-nb-dark-bg/80 relative">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        
        <div className="flex flex-col items-center gap-8 max-w-full relative z-10">
          <div className="relative group">
            <img
              ref={imgRef}
              src={src}
              alt={filename}
              onLoad={handleImageLoad}
              className="max-w-full max-h-[65vh] rounded-2xl shadow-2xl shadow-black/80 border border-nb-dark-outline-variant/30 object-contain transition-transform duration-500 group-hover:scale-[1.01]"
            />
            {dimensions && (
               <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-nb-dark-surface-high/90 backdrop-blur-md px-3 py-1 rounded-full border border-nb-dark-outline-variant/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <span className="text-[9px] font-mono font-bold tracking-widest text-nb-dark-on-variant">{dimensions.w} × {dimensions.h} PX</span>
               </div>
            )}
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-3 px-4 py-2 bg-nb-dark-surface rounded-xl border border-nb-dark-outline-variant/20">
               <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-nb-tertiary" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-nb-dark-on-surface">Dimensions Verified</span>
               </div>
               <div className="w-px h-3 bg-nb-dark-outline-variant/30" />
               <span className="text-[10px] font-mono text-nb-dark-on-variant">{filename.split(".").pop()?.toUpperCase()} RESOURCE</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Delete confirmation ───────────────────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-nb-secondary/60 backdrop-blur-md px-4" onClick={() => setShowDeleteConfirm(false)}>
          <div
            className="bg-nb-dark-surface rounded-2xl p-7 shadow-nb-lg max-w-sm w-full border border-nb-dark-outline animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-nb-primary/10 flex items-center justify-center shrink-0">
                <Trash2 size={20} className="text-nb-primary" />
              </div>
              <h3 className="font-black text-sm uppercase tracking-widest text-nb-dark-on-surface">Delete Resource?</h3>
            </div>
            
            <div className="space-y-4 mb-8">
              <p className="text-sm text-nb-dark-on-variant leading-relaxed">
                Are you sure you want to delete this resource? All references in your entries will be removed.
              </p>
              <div className="p-3 bg-nb-dark-surface-low border border-nb-dark-outline-variant rounded-xl">
                <p className="text-xs font-mono text-nb-primary break-all font-bold">{filename}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-nb-dark-outline text-xs font-black uppercase tracking-widest text-nb-dark-on-variant hover:bg-nb-dark-surface-high transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); onDelete(); }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-nb-primary text-white text-xs font-black uppercase tracking-widest hover:bg-nb-primary-dim transition-all shadow-md shadow-nb-primary/20 active:scale-[0.98]"
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
