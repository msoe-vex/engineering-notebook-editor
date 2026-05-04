"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import UnifiedEditor, { ToolbarButton, TableGridSelector } from "./UnifiedEditor";
import { saveAs } from "file-saver";
import {
  Save, Trash2, Download, AlertCircle, AlertTriangle, Loader2, User, Target, X, FileCode,
  Undo2, Redo2, ImagePlus, Plus, ChevronDown, FileText, Type, List, ListOrdered,
  Code, Table as TableIcon, Heading1, Heading2, Bold, Italic, Check, Image as ImageIcon,
  Brain, PencilRuler, Hammer, SearchCheck, Goal, Terminal, Link as LinkIcon, Underline as UnderlineIcon
} from "lucide-react";
import { generateUUID, hashContent, getExtensionFromDataUrl } from "@/lib/utils";
import { generateEntryLatex } from "@/lib/latex";
import AutocompleteInput from "./AutocompleteInput";
import { extractResources } from "@/lib/metadata";
import { NodeSelection } from "@tiptap/pm/state";

const PHASE_CONFIG: Record<string, { icon: any, color: string, bg: string, border: string, text: string }> = {
  "Define Problem": { icon: Goal, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20", text: "text-blue-600 dark:text-blue-400" },
  "Generate Concepts": { icon: Brain, color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/20", text: "text-purple-600 dark:text-purple-400" },
  "Develop Solution": { icon: PencilRuler, color: "text-indigo-500", bg: "bg-indigo-500/10", border: "border-indigo-500/20", text: "text-indigo-600 dark:text-indigo-400" },
  "Construct and Test": { icon: Hammer, color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20", text: "text-orange-600 dark:text-orange-400" },
  "Evaluate Solution": { icon: SearchCheck, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-600 dark:text-emerald-400" },
};

const PHASES = Object.keys(PHASE_CONFIG);

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
  initialUpdatedAt?: string;
  metadataMissing?: boolean;
  isValid?: boolean;
  onSaved: (path: string, latexContent: string) => void;
  onDeleted: (path: string) => void;
  onContentChange?: (filename: string, latex: string, tiptapContent: string, info: { title: string; author: string; phase: string }) => void;
  onTitleChange: (title: string) => void;
  onAuthorChange: (author: string) => void;
  onPhaseChange: (phase: string) => void;
  onImageUpload?: (path: string, base64: string) => void;
  onMetadataRebuild?: (path: string, content: any, info: { title: string; author: string; phase: string; createdAt: string }) => void;
  onDownloadPortable?: (path: string, content: any, info: { title: string; author: string; phase: string; createdAt: string; updatedAt: string }) => void;
  onClose?: () => void;
  dbName?: string;
  isSaving?: boolean;
  notebookMetadata?: any;
  onValidationChange?: (isValid: boolean) => void;
}

const Editor = React.memo(function Editor({
  config,
  filename,
  isLocalMode,
  initialTitle = "",
  initialAuthor = "",
  initialPhase = "",
  initialContent = "",
  initialCreatedAt = "",
  initialUpdatedAt = "",
  metadataMissing = false,
  isValid = true,
  onSaved,
  onDeleted,
  onContentChange,
  onValidationChange,
  onImageUpload,
  onTitleChange,
  onAuthorChange,
  onPhaseChange,
  onMetadataRebuild,
  onDownloadPortable,
  onClose,
  dbName,
  isSaving: isExternalSaving = false,
  notebookMetadata,
}: EditorProps) {
  const parseInitialContent = (raw: any): any => {
    if (!raw) return raw;
    if (typeof raw === 'object') return raw;
    if (typeof raw !== 'string') return raw;
    
    const trimmed = raw.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
      try {
        const parsed = JSON.parse(trimmed);
        // If we got another string, try parsing it again (recursive unwrap)
        if (typeof parsed === 'string') return parseInitialContent(parsed);
        return parsed;
      } catch (e) {
        return raw;
      }
    }
    return raw;
  };

  const [title, setTitle] = useState(initialTitle);
  const [author, setAuthor] = useState(initialAuthor);
  const [phase, setPhase] = useState(initialPhase);
  const [content, setContent] = useState(() => parseInitialContent(initialContent));
  const [editor, setEditor] = useState<any>(null);
  const [showTableGrid, setShowTableGrid] = useState(false);

  // Local validation state for immediate UI feedback
  const [localIsValid, setLocalIsValid] = useState(isValid);

  // Sync external validity if it changes
  useEffect(() => {
    setLocalIsValid(isValid);
  }, [isValid]);

  const checkValidity = useCallback(() => {
    if (!title?.trim() || !author?.trim() || !phase?.trim()) return false;
    if (!editor) return true;
    
    const resources = extractResources(editor.getJSON());
    for (const res of Object.values(resources)) {
      if (!res.title?.trim() || !res.caption?.trim()) return false;
    }
    return true;
  }, [title, author, phase, editor]);

  // Immediate validation effect
  useEffect(() => {
    const valid = checkValidity();
    if (valid !== localIsValid) {
      setLocalIsValid(valid);
      onValidationChange?.(valid);
    }
  }, [title, author, phase, editor?.state.doc.content, checkValidity, localIsValid, onValidationChange]);

  const [isSaving, setIsSaving] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const toggleLinkFn = useRef<(() => void) | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [, setSelectionUpdate] = useState(0);

  const entryId = filename.split('/').pop()?.replace('.json', '') || "";

  const otherAuthors = React.useMemo(() => {
    const authors = new Set<string>();
    Object.entries(notebookMetadata?.entries || {}).forEach(([id, e]: [string, any]) => {
      if (id !== entryId && e.author?.trim()) authors.add(e.author.trim());
    });
    return Array.from(authors).sort();
  }, [notebookMetadata?.entries, entryId]);

  const otherTitles = React.useMemo(() => {
    const titles = new Set<string>();
    Object.entries(notebookMetadata?.entries || {}).forEach(([id, e]: [string, any]) => {
      if (id !== entryId && e.title?.trim() && !e.title.endsWith(".tex")) titles.add(e.title.trim());
    });
    return Array.from(titles).sort();
  }, [notebookMetadata?.entries, entryId]);

  const latestContentRef = useRef(content);
  const latestMetadataRef = useRef({ title, author, phase });

  useEffect(() => {
    latestContentRef.current = content;
    latestMetadataRef.current = { title, author, phase };
  }, [content, title, author, phase]);

  useEffect(() => {
    if (!editor) return;
    const handleUpdate = () => setSelectionUpdate(s => s + 1);
    editor.on('selectionUpdate', handleUpdate);
    editor.on('transaction', handleUpdate);
    return () => {
      editor.off('selectionUpdate', handleUpdate);
      editor.off('transaction', handleUpdate);
    };
  }, [editor]);

  // Update content when filename changes (new entry loaded)
  useEffect(() => {
    setTitle(initialTitle);
    setAuthor(initialAuthor);
    setPhase(initialPhase);
    setContent(parseInitialContent(initialContent));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename]);

  const generateLatex = (cnt: string, t: string, a: string, p: string) => {
    const entryId = filename.split('/').pop()?.replace('.json', '') || "";
    return generateEntryLatex(cnt, t, a, p, initialCreatedAt, entryId);
  };

  const validate = () => {
    const errors: string[] = [];
    if (!title.trim()) errors.push("Project title is required.");
    if (!author.trim()) errors.push("Author name is required.");
    return { valid: errors.length === 0, errors };
  };

  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const lastSyncedRef = useRef({ 
    title: initialTitle, 
    author: initialAuthor, 
    phase: initialPhase, 
    contentStr: initialContent 
  });

  // Notify parent of content changes with debounce to prevent lag
  useEffect(() => {
    // Clear any existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    const contentStr = JSON.stringify(content);
    const isChanged =
      title !== lastSyncedRef.current.title ||
      author !== lastSyncedRef.current.author ||
      phase !== lastSyncedRef.current.phase ||
      contentStr !== lastSyncedRef.current.contentStr;

    if (!isChanged) {
      setIsAutoSaving(false);
      return;
    }

    setIsAutoSaving(true);
    autoSaveTimerRef.current = setTimeout(() => {
      const latex = generateLatex(content, title, author, phase);
      if (onContentChange) onContentChange(filename, latex, contentStr, { title, author, phase });
      
      lastSyncedRef.current = { title, author, phase, contentStr };
      setIsAutoSaving(false);
      autoSaveTimerRef.current = null;
    }, 500);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, title, author, phase, filename, onContentChange]);

  // Flush pending changes on unmount to prevent data loss on fast entry switch
  useEffect(() => {
    return () => {
      const content = latestContentRef.current;
      const { title, author, phase } = latestMetadataRef.current;
      
      // Only flush if there's something to flush
      const contentStr = JSON.stringify(content);
      const isChanged =
        title !== initialTitle ||
        author !== initialAuthor ||
        phase !== initialPhase ||
        contentStr !== initialContent;

      if (isChanged && onContentChange) {
        const latex = generateLatex(content, title, author, phase);
        onContentChange(filename, latex, contentStr, { title, author, phase });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename]);

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

  useEffect(() => {
    if (!activeMenu && !showTableGrid) return;
    const handleOutsideClick = () => {
      setActiveMenu(null);
      setShowTableGrid(false);
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [activeMenu, showTableGrid]);

  // Keyboard Shortcuts (Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [content, title, author, phase, filename]);

  const MenuItem = ({ label, children }: { label: string, children: React.ReactNode }) => (
    <div className="relative h-full flex items-center">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === label ? null : label); }}
        onMouseEnter={() => { if (activeMenu) setActiveMenu(label); }}
        className={`px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-widest transition-colors ${activeMenu === label ? "bg-nb-primary text-white" : "text-nb-on-surface-variant hover:bg-nb-surface-mid"
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
        reader.onload = async () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(",")[1];

          const hash = await hashContent(base64);
          const ext = getExtensionFromDataUrl(dataUrl);
          const newPath = `assets/${hash}.${ext}`;

          const safePos = (() => {
            const { selection } = editor.state;
            if (selection instanceof NodeSelection) return selection.to;
            if (editor.isActive('tableCell') || editor.isActive('tableHeader') || editor.isActive('codeBlock')) {
              try { return selection.$from.after(1); } catch { return selection.$from.after(); }
            }
            return null;
          })();

          if (safePos !== null) {
            editor.chain().focus().insertContentAt(safePos, {
              type: "image",
              attrs: { id: generateUUID(), src: dataUrl, filePath: newPath, title: author }
            }).run();
          } else {
            editor.chain().focus().insertContent({
              type: "image",
              attrs: { id: generateUUID(), src: dataUrl, filePath: newPath, title: author }
            }).run();
          }

          onImageUpload?.(newPath, base64);
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  return (
    <div className="flex flex-col h-full bg-nb-surface overflow-x-auto overflow-y-hidden scrollbar-hide">
      <div className="flex flex-col min-h-full min-w-[500px]">
        {/* ── Fixed Header ────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-nb-outline-variant bg-nb-surface/80 backdrop-blur-md z-[150]">

          {/* Row 1: Menu Bar */}
          <div className="px-4 h-10 flex items-center gap-2 border-b border-nb-outline-variant/30">

            <MenuItem label="File">
              <MenuAction icon={<Save size={14} />} label="Save Entry" onClick={handleSave} />
              <MenuAction icon={<Download size={14} />} label="Download LaTeX" onClick={handleDownload} />
              <MenuAction
                icon={<FileCode size={14} />}
                label="Download Portable (.json)"
                onClick={() => {
                  const latestMeta = notebookMetadata?.entries?.[entryId];
                  const currentUpdatedAt = latestMeta?.updatedAt || initialUpdatedAt || initialCreatedAt;
                  onDownloadPortable?.(filename, JSON.stringify(content), { 
                    title, author, phase, 
                    createdAt: initialCreatedAt, 
                    updatedAt: currentUpdatedAt 
                  });
                }}
              />
              <div className="h-px bg-nb-outline-variant/30 my-1 mx-2" />
              <MenuAction icon={<X size={14} />} label="Close" onClick={onClose || (() => { })} />
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

            {editor && (
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
                  onClick={() => {
                    const { selection } = editor.state;
                    const safePos = (selection instanceof NodeSelection) ? selection.to :
                      (editor.isActive('tableCell') || editor.isActive('tableHeader') || editor.isActive('codeBlock')) ?
                        (() => { try { return selection.$from.after(1); } catch { return selection.$from.after(); } })() : null;

                    if (safePos !== null) {
                      editor.chain().focus().insertContentAt(safePos, { type: 'codeBlock', attrs: { id: generateUUID() } }).run();
                    } else {
                      editor.chain().focus().insertContent({ type: 'codeBlock', attrs: { id: generateUUID() } }).run();
                    }
                  }}
                />
                <MenuAction
                  icon={<Terminal size={14} />}
                  label="Raw LaTeX"
                  onClick={() => {
                    const { selection } = editor.state;
                    const safePos = (selection instanceof NodeSelection) ? selection.to :
                      (editor.isActive('tableCell') || editor.isActive('tableHeader') || editor.isActive('codeBlock')) ?
                        (() => { try { return selection.$from.after(1); } catch { return selection.$from.after(); } })() : null;

                    if (safePos !== null) {
                      editor.chain().focus().insertContentAt(safePos, { type: 'rawLatex', attrs: { id: generateUUID() } }).run();
                    } else {
                      editor.chain().focus().insertContent({ type: 'rawLatex', attrs: { id: generateUUID() } }).run();
                    }
                  }}
                />
              </MenuItem>
            )}

            <div className="flex-1" />

            <div className="flex items-center gap-2 mr-2">
              {isAutoSaving || isSaving || isExternalSaving ? (
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
          <div className="px-6 py-2.5 flex flex-wrap items-center gap-2 max-w-7xl mx-auto">
            <div className="flex-1 min-w-[300px]">
              <AutocompleteInput
                type="text"
                value={title}
                options={otherTitles}
                onSelectOption={(val) => { setTitle(val); onTitleChange?.(val); }}
                onChange={(e) => { setTitle(e.target.value); onTitleChange?.(e.target.value); }}
                placeholder="Project Title..."
                className="w-full text-xl font-bold bg-transparent text-nb-on-surface outline-none placeholder:text-nb-outline-variant"
              />
            </div>

            {!localIsValid && (
              <div className="shrink-0 text-amber-500 animate-pulse mr-4" title="Incomplete metadata or resource captions">
                <AlertTriangle size={20} />
              </div>
            )}

            <div className="flex items-center gap-6">
              <div className="h-9 flex items-center gap-2.5 px-3 rounded-xl bg-nb-surface-low border border-nb-outline-variant/30 group transition-all focus-within:border-nb-primary/50">
                <User size={14} className="text-nb-tertiary" />
                <AutocompleteInput
                  type="text"
                  value={author}
                  options={otherAuthors}
                  onSelectOption={(val) => { setAuthor(val); onAuthorChange?.(val); }}
                  onChange={(e) => { setAuthor(e.target.value); onAuthorChange?.(e.target.value); }}
                  placeholder="Author"
                  className="text-xs font-semibold text-nb-on-surface-variant bg-transparent outline-none w-36"
                />
              </div>

              <div className={`h-9 w-[230px] shrink-0 flex items-center gap-2.5 px-3 rounded-xl border transition-all focus-within:ring-2 focus-within:ring-nb-primary/20 ${phase && PHASE_CONFIG[phase] ? `${PHASE_CONFIG[phase].bg} ${PHASE_CONFIG[phase].border}` : "bg-nb-surface-low border-nb-outline-variant/30"}`}>
                {phase && PHASE_CONFIG[phase] && (
                  React.createElement(PHASE_CONFIG[phase].icon, { size: 14, className: `${PHASE_CONFIG[phase].color} shrink-0` })
                )}
                <select
                  value={phase}
                  onChange={(e) => { setPhase(e.target.value); onPhaseChange?.(e.target.value); }}
                  className={`flex-1 w-full min-w-0 text-xs font-bold tracking-widest bg-transparent outline-none cursor-pointer appearance-none ${phase && PHASE_CONFIG[phase] ? PHASE_CONFIG[phase].text : "text-nb-on-surface-variant/60"}`}
                >
                  {!phase && <option value="" disabled>Phase</option>}
                  {PHASES.map(p => (
                    <option key={p} value={p} className="text-nb-on-surface bg-nb-surface">
                      {p}
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} className="text-nb-on-surface-variant/40 shrink-0" />
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
                <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline">
                  <UnderlineIcon size={16} />
                </ToolbarButton>

                <div className="w-px h-6 bg-nb-outline-variant/30 mx-1.5" />

                <ToolbarButton 
                  onClick={() => toggleLinkFn.current?.()} 
                  active={editor.isActive("link")} 
                  title="Insert Link/Reference"
                >
                  <LinkIcon size={16} />
                </ToolbarButton>

                <div className="w-px h-6 bg-nb-outline-variant/30 mx-1.5" />

                <ToolbarButton
                  onClick={() => {
                    const { selection } = editor.state;
                    const safePos = (selection instanceof NodeSelection) ? selection.to :
                      (editor.isActive('tableCell') || editor.isActive('tableHeader') || editor.isActive('codeBlock')) ?
                        (() => { try { return selection.$from.after(1); } catch { return selection.$from.after(); } })() : null;

                    if (safePos !== null) {
                      editor.chain().focus().insertContentAt(safePos, { type: 'heading', attrs: { level: 1 } }).run();
                    } else {
                      editor.chain().focus().toggleHeading({ level: 1 }).run();
                    }
                  }}
                  active={editor.isActive("heading", { level: 1 })}
                  title="Heading 1"
                >
                  <Heading1 size={16} />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => {
                    const { selection } = editor.state;
                    const safePos = (selection instanceof NodeSelection) ? selection.to :
                      (editor.isActive('tableCell') || editor.isActive('tableHeader') || editor.isActive('codeBlock')) ?
                        (() => { try { return selection.$from.after(1); } catch { return selection.$from.after(); } })() : null;

                    if (safePos !== null) {
                      editor.chain().focus().insertContentAt(safePos, { type: 'heading', attrs: { level: 2 } }).run();
                    } else {
                      editor.chain().focus().toggleHeading({ level: 2 }).run();
                    }
                  }}
                  active={editor.isActive("heading", { level: 2 })}
                  title="Heading 2"
                >
                  <Heading2 size={16} />
                </ToolbarButton>

                <div className="w-px h-6 bg-nb-outline-variant/30 mx-1.5" />

                <ToolbarButton
                  onClick={() => {
                    const { selection } = editor.state;
                    const safePos = (selection instanceof NodeSelection) ? selection.to :
                      (editor.isActive('tableCell') || editor.isActive('tableHeader') || editor.isActive('codeBlock')) ?
                        (() => { try { return selection.$from.after(1); } catch { return selection.$from.after(); } })() : null;

                    if (safePos !== null) {
                      editor.chain().focus().insertContentAt(safePos, {
                        type: 'bulletList',
                        content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }]
                      }).run();
                    } else {
                      editor.chain().focus().toggleBulletList().run();
                    }
                  }}
                  active={editor.isActive("bulletList")}
                  title="Bullet List"
                >
                  <List size={16} />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => {
                    const { selection } = editor.state;
                    const safePos = (selection instanceof NodeSelection) ? selection.to :
                      (editor.isActive('tableCell') || editor.isActive('tableHeader') || editor.isActive('codeBlock')) ?
                        (() => { try { return selection.$from.after(1); } catch { return selection.$from.after(); } })() : null;

                    if (safePos !== null) {
                      editor.chain().focus().insertContentAt(safePos, {
                        type: 'orderedList',
                        content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }]
                      }).run();
                    } else {
                      editor.chain().focus().toggleOrderedList().run();
                    }
                  }}
                  active={editor.isActive("orderedList")}
                  title="Ordered List"
                >
                  <ListOrdered size={16} />
                </ToolbarButton>

                <div className="w-px h-6 bg-nb-outline-variant/30 mx-1.5" />

                <ToolbarButton
                  onClick={() => {
                    const { selection } = editor.state;
                    const safePos = (selection instanceof NodeSelection) ? selection.to :
                      (editor.isActive('tableCell') || editor.isActive('tableHeader') || editor.isActive('codeBlock')) ?
                        (() => { try { return selection.$from.after(1); } catch { return selection.$from.after(); } })() : null;

                    if (safePos !== null) {
                      editor.chain().focus().insertContentAt(safePos, { type: 'codeBlock', attrs: { id: generateUUID() } }).run();
                    } else {
                      editor.chain().focus().insertContent({ type: 'codeBlock', attrs: { id: generateUUID() } }).run();
                    }
                  }}
                  active={editor.isActive("codeBlock")}
                  title="Code Block"
                >
                  <Code size={16} />
                </ToolbarButton>

                <ToolbarButton
                  onClick={() => {
                    const { selection } = editor.state;
                    const safePos = (selection instanceof NodeSelection) ? selection.to :
                      (editor.isActive('tableCell') || editor.isActive('tableHeader') || editor.isActive('codeBlock')) ?
                        (() => { try { return selection.$from.after(1); } catch { return selection.$from.after(); } })() : null;

                    if (safePos !== null) {
                      editor.chain().focus().insertContentAt(safePos, { type: 'rawLatex', attrs: { id: generateUUID() } }).run();
                    } else {
                      editor.chain().focus().insertContent({ type: 'rawLatex', attrs: { id: generateUUID() } }).run();
                    }
                  }}
                  active={editor.isActive("rawLatex")}
                  title="Raw LaTeX"
                >
                  <Terminal size={16} />
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
                          const tableContent = {
                            type: 'table',
                            attrs: { id: generateUUID() },
                            content: Array.from({ length: rows }, () => ({
                              type: 'tableRow',
                              content: Array.from({ length: cols }, () => ({
                                type: 'tableCell',
                                content: [{ type: 'paragraph' }]
                              }))
                            }))
                          };

                          const { selection } = editor.state;
                          const safePos = (selection instanceof NodeSelection) ? selection.to :
                            (editor.isActive('tableCell') || editor.isActive('tableHeader') || editor.isActive('codeBlock')) ?
                              (() => { try { return selection.$from.after(1); } catch { return selection.$from.after(); } })() : null;

                          if (safePos !== null) {
                            editor.chain().focus().insertContentAt(safePos, tableContent).run();
                          } else {
                            editor.chain().focus().insertContent(tableContent).run();
                          }
                          setShowTableGrid(false);
                        }}
                      />
                    </div>
                  )}
                </div>

                <ToolbarButton
                  onClick={insertImage}
                  title="Insert Image"
                >
                  <ImageIcon size={16} />
                </ToolbarButton>
              </div>
            </div>
          )}
        </div>

        {/* ── Scrollable Workspace ──────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto bg-nb-surface scrollbar-hide">
          <div className="max-w-7xl mx-auto pl-16 pr-8 py-4 min-h-full">
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
              onToggleLink={(fn) => { toggleLinkFn.current = fn; }}
              notebookMetadata={notebookMetadata}
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
    </div>
  );
}, (prev, next) => {
  return (
    prev.filename === next.filename &&
    prev.isSaving === next.isSaving &&
    prev.isLocalMode === next.isLocalMode &&
    prev.config === next.config &&
    prev.dbName === next.dbName
  );
});

export default Editor;
