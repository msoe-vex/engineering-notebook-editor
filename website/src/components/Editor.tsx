"use client";

import React, { useState, useEffect, useRef } from "react";
import UnifiedEditor from "./UnifiedEditor";
import { saveAs } from "file-saver";
import { Save, Trash2, Download, AlertCircle, Loader2, User, Target, X, FileCode } from "lucide-react";
import { generateEntryLatex } from "@/lib/latex";
import AutocompleteInput from "./AutocompleteInput";

const PHASES = [
  "Define Problem",
  "Generate Concepts",
  "Develop Solution",
  "Construct and Test",
  "Evaluate Solution",
];



/* ─────────────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────────────── */


interface EditorProps {
  config: {
    owner: string;
    repo: string;
    token: string;
    entriesDir: string;
  };
  filename: string;
  isLocalMode?: boolean;
  initialTitle?: string;
  initialAuthor?: string;
  initialPhase?: string;
  initialContent: string;
  initialCreatedAt?: string;
  metadataMissing?: boolean;
  onSaved: (path: string, latexContent: string) => void;
  onDeleted: (path: string) => void;
  onContentChange?: (filename: string, latex: string, tiptapContent: string, info: { title: string; author: string; phase: string }) => void;
  onTitleChange?: (title: string) => void;
  onAuthorChange?: (author: string) => void;
  onPhaseChange?: (phase: string) => void;
  onImageUpload?: (path: string, base64: string) => void;
  onMetadataRebuild?: (entryPath: string, tiptapJson: string, info?: { title: string; author: string; phase: string; createdAt?: string }) => void;
  onClose?: () => void;
  dbName?: string;
  knownAuthors?: Record<string, string[]>;
  knownProjectTitles?: Record<string, string[]>;
}

export default function Editor({
  config,
  filename,
  isLocalMode,
  initialTitle = "",
  initialAuthor = "",
  initialPhase = "",
  initialContent = "",
  initialCreatedAt = "",
  metadataMissing = false,
  onSaved,
  onDeleted,
  onContentChange,
  onImageUpload,
  onTitleChange,
  onAuthorChange,
  onPhaseChange,
  onMetadataRebuild,
  onClose,
  dbName,
  knownAuthors = {},
  knownProjectTitles = {},
}: EditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [author, setAuthor] = useState(initialAuthor);
  const [phase, setPhase] = useState(initialPhase);
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Reset local state only when the file changes, not on every parent re-render.
  // Reading the initial* props inside is fine — we just don't want them as triggers.
  useEffect(() => {
    setTitle(initialTitle);
    setAuthor(initialAuthor);
    setPhase(initialPhase);
    setContent(initialContent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename]);

  const generateLatex = (cnt: string, t: string, a: string, p: string) => {
    return generateEntryLatex(cnt, t, a, p, initialCreatedAt);
  };

  const validate = () => {
    const errors: string[] = [];
    if (!title.trim()) errors.push("Project Title is required.");
    if (!author.trim()) errors.push("Author is required.");
    if (!phase) errors.push("Project Phase is required.");

    try {
      const doc = JSON.parse(content);
      const checkCaptions = (node: any) => {
        if (node.type === "image" && !node.attrs?.alt?.trim()) errors.push("All images must have a caption.");
        if (node.type === "table" && !node.attrs?.caption?.trim()) errors.push("All tables must have a caption.");
        if (node.type === "codeBlock" && !node.attrs?.caption?.trim()) errors.push("All code blocks must have a caption.");
        (node.content ?? []).forEach(checkCaptions);
      };
      checkCaptions(doc);
    } catch { /* ignore */ }

    return { valid: errors.length === 0, errors };
  };

  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Notify parent of content changes. Callbacks are intentionally omitted from
  // deps — they're new arrow function instances on every App render, and adding
  // them would cause an infinite loop.
  const stateRef = useRef({ content, title, author, phase, filename, generateLatex });
  useEffect(() => {
    stateRef.current = { content, title, author, phase, filename, generateLatex };
  }, [content, title, author, phase, filename, generateLatex]);

  const callbacksRef = useRef({ onContentChange });
  useEffect(() => {
    callbacksRef.current = { onContentChange };
  });

  // Notify parent of content changes with debounce to prevent lag
  useEffect(() => {
    setIsAutoSaving(true);
    const timeout = setTimeout(() => {
      const latex = generateLatex(content, title, author, phase);
      if (onContentChange) onContentChange(filename, latex, content, { title, author, phase });
      if (onTitleChange) onTitleChange(title);
      if (onAuthorChange) onAuthorChange(author);
      if (onPhaseChange) onPhaseChange(phase);
      setIsAutoSaving(false);
    }, 500);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, title, author, phase, filename]);

  // Flush pending changes on unmount to prevent data loss on fast entry switch
  useEffect(() => {
    return () => {
      const s = stateRef.current;
      const cb = callbacksRef.current;
      if (!cb.onContentChange) return;
      const latex = s.generateLatex(s.content, s.title, s.author, s.phase);
      cb.onContentChange(s.filename, latex, s.content, { title: s.title, author: s.author, phase: s.phase });
    };
  }, []);

  // Clear validation errors on type
  useEffect(() => {
    if (validationErrors.length > 0) setValidationErrors([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, title, author, phase]);


  const handleSave = async () => {
    const { valid, errors } = validate();
    if (!valid) {
      setValidationErrors(errors);
      return;
    }

    setValidationErrors([]);
    setIsSaving(true);
    const latex = generateLatex(content, title, author, phase);

    // Notify parent so it can rebuild metadata.json from TipTap JSON
    if (onMetadataRebuild) {
      onMetadataRebuild(filename, content, { title, author, phase, createdAt: initialCreatedAt });
    }

    // Execute the parent's save handler
    await onSaved(filename, latex);
    setIsSaving(false);
  };

  const handleDownload = () => {
    const latex = generateLatex(content, title, author, phase);
    const blob = new Blob([latex], { type: "text/plain;charset=utf-8" });
    saveAs(blob, filename);
  };

  return (
    <div className="flex flex-col h-full bg-nb-surface">
      {/* ── Editor Header ────────────────────────────────────────── */}
      <div className="px-6 py-5 border-b border-nb-outline-variant bg-nb-surface-low shrink-0">
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-4">

          {/* Row 1: Metadata (Center Aligned) */}
          <div className="w-full flex flex-col items-center text-center">
            <AutocompleteInput
              type="text"
              value={title}
              options={Object.keys(knownProjectTitles).filter(t => {
                // Normalize slashes for comparison
                const normFilename = filename.replace(/\\/g, '/');
                const otherRefs = (knownProjectTitles[t] || []).filter(p => p.replace(/\\/g, '/') !== normFilename);
                return otherRefs.length > 0 && t.trim() !== title.trim();
              })}
              onSelectOption={(val) => { setTitle(val); onTitleChange?.(val); }}
              onChange={(e) => { setTitle(e.target.value); onTitleChange?.(e.target.value); }}
              placeholder="Project Title..."
              className="w-full text-2xl font-bold bg-transparent text-nb-on-surface outline-none placeholder:text-nb-outline-variant text-center mb-4"
              wrapperClassName="w-full"
            />

            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-2 group">
                <User size={14} className="text-nb-tertiary" />
                <AutocompleteInput
                  type="text"
                  value={author}
                  options={Object.keys(knownAuthors).filter(a => {
                    // Normalize slashes for comparison
                    const normFilename = filename.replace(/\\/g, '/');
                    const otherRefs = (knownAuthors[a] || []).filter(p => p.replace(/\\/g, '/') !== normFilename);
                    return otherRefs.length > 0 && a.trim() !== author.trim();
                  })}
                  onSelectOption={(val) => { setAuthor(val); onAuthorChange?.(val); }}
                  onChange={(e) => { setAuthor(e.target.value); onAuthorChange?.(e.target.value); }}
                  placeholder="Author"
                  className="text-xs font-semibold text-nb-on-surface-variant bg-transparent outline-none border-b border-nb-outline-variant/30 focus:border-nb-tertiary transition-all w-32 text-center"
                />
              </div>

              <div className="hidden md:block w-px h-4 bg-nb-outline-variant/30" />

              <div className="flex items-center gap-2 group">
                <Target size={14} className="text-nb-tertiary" />
                <select
                  value={phase}
                  onChange={(e) => { setPhase(e.target.value); onPhaseChange?.(e.target.value); }}
                  className="text-[10px] font-bold uppercase tracking-widest text-nb-on-surface-variant bg-transparent outline-none cursor-pointer hover:text-nb-tertiary transition-colors"
                >
                  <option value="" className="bg-nb-surface text-nb-on-surface">Select Phase</option>
                  {PHASES.map(p => (
                    <option key={p} value={p} className="bg-nb-surface text-nb-on-surface">
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Row 2: Action Buttons (Center Aligned) */}
          <div className="flex flex-wrap items-center justify-center gap-2 relative">
            {!isLocalMode && (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-1.5 bg-nb-primary text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md shadow-nb-primary/20 hover:bg-nb-primary-dim transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                <span>Save to Drive</span>
              </button>
            )}

            {/* Auto-save indicator */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300 ${isAutoSaving ? 'opacity-100' : 'opacity-0'}`}>
              <div className="w-1.5 h-1.5 rounded-full bg-nb-tertiary animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-nb-on-surface-variant/60">Saving...</span>
            </div>

            {validationErrors.length > 0 && (
              <div className="absolute top-full mt-2 z-[80] w-64 bg-red-50 border border-red-200 rounded-xl p-3 shadow-nb-lg animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center gap-2 mb-2 text-red-600">
                  <AlertCircle size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Missing Requirements</span>
                </div>
                <ul className="space-y-1">
                  {validationErrors.map((err, i) => (
                    <li key={i} className="text-[10px] text-red-700 list-disc list-inside font-medium">{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-nb-outline-variant text-xs font-bold text-nb-on-surface-variant hover:bg-nb-surface-mid transition-all active:scale-[0.98]"
            >
              <X size={14} />
              <span>Close</span>
            </button>

            <div className="hidden sm:block w-px h-4 bg-nb-outline-variant/30 mx-1" />

            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-nb-on-surface-variant/40 hover:text-nb-primary hover:bg-nb-primary/5 transition-all"
            >
              <Trash2 size={14} />
              <span>Delete</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── TipTap Workspace ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-nb-surface scrollbar-hide">
        <div className="max-w-4xl mx-auto px-12 py-16 min-h-full">
          <UnifiedEditor
            key={filename}
            filename={filename}
            content={content}
            onChange={setContent}
            onImageUpload={onImageUpload}
            author={author}
            dbName={dbName}
          />
        </div>
      </div>

      {/* ── Delete confirmation ───────────────────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-nb-secondary/60 backdrop-blur-md px-4" onClick={() => setShowDeleteConfirm(false)}>
          <div
            className="bg-nb-surface rounded-2xl p-7 shadow-nb-lg max-w-sm w-full border border-nb-outline-variant animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-nb-primary/10 flex items-center justify-center shrink-0">
                <Trash2 size={20} className="text-nb-primary" />
              </div>
              <h3 className="font-bold text-sm uppercase tracking-widest text-nb-secondary">Delete Entry?</h3>
            </div>

            <p className="text-sm text-nb-on-surface-variant leading-relaxed mb-8">
              This will permanently remove the entry from your notebook. This action cannot be undone once committed.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-nb-outline-variant text-xs font-bold uppercase tracking-widest text-nb-on-surface-variant hover:bg-nb-surface-low transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); onDeleted(filename); }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-nb-primary text-white text-xs font-bold uppercase tracking-widest hover:bg-nb-primary-dim transition-all shadow-md shadow-nb-primary/20"
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
