"use client";

import React, { useState, useEffect } from "react";
import UnifiedEditor, { ToolbarButton, TableGridSelector } from "./UnifiedEditor";
import { saveAs } from "file-saver";
import { 
  Save, Trash2, Download, AlertCircle, Loader2, User, Target, X, FileCode,
  Undo2, Redo2, ImagePlus, Plus, ChevronDown, FileText, Type, List, ListOrdered, 
  Code, Table as TableIcon, Heading1, Heading2, Bold, Italic, Check, Image as ImageIcon
} from "lucide-react";
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
  const [editor, setEditor] = useState<any>(null);
  const [showTableGrid, setShowTableGrid] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Reset local state only when the file changes, not on every parent re-render.
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
    if (!title.trim()) errors.push("Project title is required.");
    if (!author.trim()) errors.push("Author name is required.");
    return { valid: errors.length === 0, errors };
  };

  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Notify parent of content changes with debounce to prevent lag
  useEffect(() => {
    const isChanged = 
      title !== initialTitle || 
      author !== initialAuthor || 
      phase !== initialPhase || 
      content !== initialContent;

    if (!isChanged) {
      setIsAutoSaving(false);
      return;
    }

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
  }, [content, title, author, phase, filename, initialTitle, initialAuthor, initialPhase, initialContent]);

  // Flush pending changes on unmount to prevent data loss on fast entry switch
  useEffect(() => {
    return () => {
      const latex = generateLatex(content, title, author, phase);
      if (onContentChange) onContentChange(filename, latex, content, { title, author, phase });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, title, author, phase, filename]);

  const handleSave = async () => {
    const { valid, errors } = validate();
    if (!valid) {
      setValidationErrors(errors);
      return;
    }

    setValidationErrors([]);
    setIsSaving(true);
    const latex = generateLatex(content, title, author, phase);

    if (onMetadataRebuild) {
      onMetadataRebuild(filename, content, { title, author, phase, createdAt: initialCreatedAt });
    }

    await onSaved(filename, latex);
    setIsSaving(false);
  };

  const handleDownload = () => {
    const latex = generateLatex(content, title, author, phase);
    const blob = new Blob([latex], { type: "text/plain;charset=utf-8" });
    saveAs(blob, filename);
  };

  // Close menus on click away
  useEffect(() => {
    if (!activeMenu && !showTableGrid) return;
    const handleOutsideClick = () => {
      setActiveMenu(null);
      setShowTableGrid(false);
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [activeMenu, showTableGrid]);

  const MenuItem = ({ label, children }: { label: string, children: React.ReactNode }) => (
    <div className="relative h-full flex items-center">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === label ? null : label); }}
        className={`px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-widest transition-colors ${
          activeMenu === label ? "bg-nb-primary text-white" : "text-nb-on-surface-variant hover:bg-nb-surface-mid"
        }`}
      >
        {label}
      </button>
      {activeMenu === label && (
        <div 
          className="absolute top-full left-0 mt-1 w-48 bg-nb-surface border border-nb-outline-variant shadow-nb-xl rounded-xl p-1.5 z-[200] animate-in fade-in slide-in-from-top-1 duration-150"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </div>
  );

  const MenuAction = ({ icon, label, onClick, disabled }: { icon: React.ReactNode, label: string, onClick: () => void, disabled?: boolean }) => (
    <button
      type="button"
      onClick={() => { onClick(); setActiveMenu(null); }}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest text-nb-on-surface-variant hover:bg-nb-primary/10 hover:text-nb-primary transition-all disabled:opacity-30 disabled:hover:bg-transparent text-left"
    >
      <div className="opacity-60">{icon}</div>
      <span className="flex-1">{label}</span>
    </button>
  );

  const insertImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && editor) {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(",")[1];
          const ext = file.name.split(".").pop() || "png";
          const ts = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
          const newPath = `resources/${ts}.${ext}`;
          
          editor.chain().focus().insertContent({
            type: "image",
            attrs: { src: dataUrl, filePath: newPath, title: author }
          }).run();
          
          onImageUpload?.(newPath, base64);
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  return (
    <div className="flex flex-col h-full bg-nb-surface overflow-hidden">
      {/* ── Fixed Header ────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-nb-outline-variant bg-nb-surface/80 backdrop-blur-md z-[150]">
        
        {/* Row 1: Menu Bar */}
        <div className="px-4 h-10 flex items-center gap-2 border-b border-nb-outline-variant/30">
          <MenuItem label="File">
            <MenuAction icon={<Save size={14} />} label="Save Entry" onClick={handleSave} />
            <MenuAction icon={<Download size={14} />} label="Download LaTeX" onClick={handleDownload} />
            <div className="h-px bg-nb-outline-variant/30 my-1 mx-2" />
            <MenuAction icon={<X size={14} />} label="Close" onClick={onClose || (() => {})} />
            <MenuAction icon={<Trash2 size={14} />} label="Delete" onClick={() => setShowDeleteConfirm(true)} />
          </MenuItem>
          
          <MenuItem label="Edit">
            <MenuAction 
              icon={<Undo2 size={14} />} 
              label="Undo" 
              onClick={() => editor?.chain().focus().undo().run()} 
              disabled={!editor?.can().undo()} 
            />
            <MenuAction 
              icon={<Redo2 size={14} />} 
              label="Redo" 
              onClick={() => editor?.chain().focus().redo().run()} 
              disabled={!editor?.can().redo()} 
            />
          </MenuItem>

          <MenuItem label="Insert">
            <MenuAction icon={<ImagePlus size={14} />} label="Image" onClick={insertImage} />
            <MenuAction 
              icon={<TableIcon size={14} />} 
              label="Table" 
              onClick={() => setShowTableGrid(true)} 
            />
            <MenuAction 
              icon={<Code size={14} />} 
              label="Code Block" 
              onClick={() => editor?.chain().focus().toggleCodeBlock().run()} 
            />
          </MenuItem>

          <div className="flex-1" />

          {/* Save Status Indicator */}
          <div className="flex items-center gap-2 mr-2">
            {isAutoSaving || isSaving ? (
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-nb-primary animate-pulse">
                <Loader2 size={12} className="animate-spin" />
                <span>SAVING...</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-nb-on-surface-variant/40">
                <Check size={12} />
                <span>SAVED</span>
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Metadata Row */}
        <div className="px-6 py-4 flex flex-wrap items-center gap-8 max-w-7xl mx-auto">
          <div className="flex-1 min-w-[300px]">
            <AutocompleteInput
              type="text"
              value={title}
              options={Object.keys(knownProjectTitles).filter(t => {
                const normFilename = filename.replace(/\\/g, "/");
                const otherRefs = (knownProjectTitles[t] || []).filter(p => p.replace(/\\/g, "/") !== normFilename);
                return otherRefs.length > 0 && t.trim() !== title.trim();
              })}
              onSelectOption={(val) => { setTitle(val); onTitleChange?.(val); }}
              onChange={(e) => { setTitle(e.target.value); onTitleChange?.(e.target.value); }}
              placeholder="Project Title..."
              className="w-full text-xl font-bold bg-transparent text-nb-on-surface outline-none placeholder:text-nb-outline-variant"
            />
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-nb-surface-low border border-nb-outline-variant/30 group transition-all focus-within:border-nb-primary/50">
              <User size={14} className="text-nb-tertiary" />
              <AutocompleteInput
                type="text"
                value={author}
                options={Object.keys(knownAuthors).filter(a => {
                  const normFilename = filename.replace(/\\/g, "/");
                  const otherRefs = (knownAuthors[a] || []).filter(p => p.replace(/\\/g, "/") !== normFilename);
                  return otherRefs.length > 0 && a.trim() !== author.trim();
                })}
                onSelectOption={(val) => { setAuthor(val); onAuthorChange?.(val); }}
                onChange={(e) => { setAuthor(e.target.value); onAuthorChange?.(e.target.value); }}
                placeholder="Author"
                className="text-xs font-semibold text-nb-on-surface-variant bg-transparent outline-none w-36"
              />
            </div>

            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-nb-surface-low border border-nb-outline-variant/30 group transition-all focus-within:border-nb-primary/50">
              <Target size={14} className="text-nb-secondary" />
              <select
                value={phase}
                onChange={(e) => { setPhase(e.target.value); onPhaseChange?.(e.target.value); }}
                className="text-xs font-semibold text-nb-on-surface-variant bg-transparent outline-none cursor-pointer"
              >
                <option value="" disabled>Select Phase</option>
                {PHASES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Row 3: Rich Toolbar */}
        {editor && (
          <div className="px-6 py-2 border-t border-nb-outline-variant/30 bg-nb-surface-mid/50">
            <div className="max-w-7xl mx-auto flex items-center gap-1">
              <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold">
                <Bold size={16} />
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic">
                <Italic size={16} />
              </ToolbarButton>
              
              <div className="w-px h-6 bg-nb-outline-variant/30 mx-1.5" />

              <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Heading 1">
                <Heading1 size={16} />
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading 2">
                <Heading2 size={16} />
              </ToolbarButton>

              <div className="w-px h-6 bg-nb-outline-variant/30 mx-1.5" />

              <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet List">
                <List size={16} />
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Ordered List">
                <ListOrdered size={16} />
              </ToolbarButton>

              <div className="w-px h-6 bg-nb-outline-variant/30 mx-1.5" />

              <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")} title="Code Block">
                <Code size={16} />
              </ToolbarButton>

              <div className="relative">
                <ToolbarButton 
                  onClick={(e) => { e?.stopPropagation(); setShowTableGrid(!showTableGrid); }} 
                  active={showTableGrid} 
                  title="Insert Table"
                >
                  <TableIcon size={16} />
                </ToolbarButton>
                {showTableGrid && (
                  <div 
                    className="absolute top-full left-0 mt-2 z-[200] shadow-2xl rounded-xl animate-in fade-in zoom-in-95 duration-200"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <TableGridSelector
                      onSelect={(rows, cols) => {
                        editor.chain().focus().insertTable({ rows, cols, withHeaderRow: false }).run();
                        setShowTableGrid(false);
                      }}
                    />
                  </div>
                )}
              </div>

              <ToolbarButton onClick={insertImage} title="Insert Image">
                <ImageIcon size={16} />
              </ToolbarButton>
            </div>
          </div>
        )}

      </div>

      {/* ── Scrollable Workspace ──────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-nb-surface scrollbar-hide">
        <div className="max-w-4xl mx-auto px-6 lg:px-12 py-12 min-h-full">
          {validationErrors.length > 0 && (
            <div className="mb-8 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 animate-in slide-in-from-top-2">
              <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-xs font-bold uppercase tracking-widest text-red-600 mb-1">Missing Information</h4>
                <ul className="list-disc list-inside text-xs text-red-500 space-y-0.5">
                  {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            </div>
          )}

          <UnifiedEditor
            key={filename}
            filename={filename}
            content={content}
            onChange={setContent}
            onImageUpload={onImageUpload}
            author={author}
            dbName={dbName}
            onEditorInit={setEditor}
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
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-nb-outline-variant text-xs font-bold uppercase tracking-widest text-nb-on-surface-variant hover:bg-nb-surface-low transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
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
