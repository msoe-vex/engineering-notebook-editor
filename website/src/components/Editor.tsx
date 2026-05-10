"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import UnifiedEditor from "./UnifiedEditor";
import { ToolbarButton, TableGridSelector } from "./editor/EditorUI";
import { createPortal } from "react-dom";
import { saveAs } from "file-saver";
import {
  Save, Trash2, AlertCircle, AlertTriangle, Loader2, User, X, FileCode,
  Undo2, Redo2, ImagePlus, ChevronDown, ChevronUp, List, ListOrdered,
  Code, Table as TableIcon, Heading1, Heading2, Bold, Italic, Check, Image as ImageIcon,
  Terminal, Link as LinkIcon, Underline as UnderlineIcon,
  FileJson
} from "lucide-react";
import ValidationTooltip from "./ValidationTooltip";
import * as LucideIcons from "lucide-react";
import { generateUUID, hashContent, getExtensionFromDataUrl, convertSvgToPng } from "@/lib/utils";
import { getLocalDateString } from "@/lib/metadata";
import { generateEntryLatex } from "@/lib/latex";
import { getPhases, getPhaseConfig } from "@/lib/phases";
import AutocompleteInput from "./AutocompleteInput";
import DatePicker from "./DatePicker";
import { extractResources, extractReferences, TipTapNode, ensureHeadingIds, buildResourceTypeIndex } from "@/lib/metadata";
import { ASSETS_DIR } from "@/lib/constants";
import { NodeSelection } from "@tiptap/pm/state";

/* ─────────────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────────────── */

import { useWorkspace } from "@/hooks/useWorkspace";

interface EditorProps {
  onClose?: () => void;
  showConfirm: (title: string, message: string, onConfirm: () => void, variant?: "danger" | "warning" | "info") => void;
}

const parseInitialContent = (raw: unknown): TipTapNode | string => {
  if (!raw) return "";
  if (typeof raw === 'object' && raw !== null) {
    // Ensure heading IDs for loaded content
    return ensureHeadingIds(raw as TipTapNode);
  }
  if (typeof raw !== 'string') return String(raw);

  const trimmed = raw.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    try {
      let parsed = JSON.parse(trimmed);
      // If we got another string, try parsing it again (recursive unwrap)
      if (typeof parsed === 'string') return parseInitialContent(parsed);

      // Unwrap standard wrapper { version: 3, content: { type: 'doc', ... } }
      if (parsed && typeof parsed === 'object' && 'content' in parsed && !('type' in parsed)) {
        parsed = parsed.content;
      }

      // Ensure heading IDs for loaded content
      if (parsed && typeof parsed === 'object') {
        parsed = ensureHeadingIds(parsed as TipTapNode);
      }

      return parsed as TipTapNode | string;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
};

const MenuItem = ({ label, children, activeMenu, setActiveMenu }: { label: string, children: React.ReactNode, activeMenu: string | null, setActiveMenu: (val: string | null) => void }) => (
  <div className="relative h-full flex items-center">
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => { setActiveMenu(activeMenu === label ? null : label); }}
      onMouseEnter={() => { if (activeMenu) setActiveMenu(label); }}
      className={`px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-widest transition-colors cursor-pointer ${activeMenu === label ? "bg-nb-primary text-white" : "text-nb-on-surface-variant hover:bg-nb-surface-mid"
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

const MenuAction = ({ icon, label, onClick, disabled, setActiveMenu }: { icon: React.ReactNode, label: string, onClick: (e: React.MouseEvent) => void, disabled?: boolean, setActiveMenu: (val: string | null) => void }) => (
  <button
    type="button"
    onClick={(e) => { onClick(e); setActiveMenu(null); }}
    disabled={disabled}
    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[10px] font-bold tracking-widest text-nb-on-surface-variant hover:bg-nb-primary/10 hover:text-nb-primary transition-all disabled:opacity-30 disabled:hover:bg-transparent text-left cursor-pointer"
  >
    <div className="opacity-60">{icon}</div>
    <span className="flex-1">{label}</span>
  </button>
);

const EditorContent = React.memo(function EditorContent({
  openFile,
  metadata,
  updateEntry,
  deleteEntry,
  currentProjectId,
  setEntryValidity,
  exportEntries,
  onClose,
  showConfirm,
}: EditorProps & {
  openFile: NonNullable<ReturnType<typeof useWorkspace>['openFile']>;
  metadata: ReturnType<typeof useWorkspace>['metadata'];
  updateEntry: ReturnType<typeof useWorkspace>['updateEntry'];
  deleteEntry: ReturnType<typeof useWorkspace>['deleteEntry'];
  currentProjectId: ReturnType<typeof useWorkspace>['currentProjectId'];
  setEntryValidity: ReturnType<typeof useWorkspace>['setEntryValidity'];
  exportEntries: ReturnType<typeof useWorkspace>['exportEntries'];
}) {
  const {
    path: filename,
    title: initialTitle,
    author: initialAuthor,
    phase: initialPhase,
    date: initialDate,
    tiptapContent: initialContent,
    createdAt: initialCreatedAt,
    id: entryId
  } = openFile;


  const [title, setTitle] = useState(initialTitle);
  const [author, setAuthor] = useState(initialAuthor);
  const [phase, setPhase] = useState<number | null>(initialPhase);
  const [date, setDate] = useState(initialDate || getLocalDateString());
  const [content, setContent] = useState<TipTapNode | string>(() => parseInitialContent(initialContent));
  const [editor, setEditor] = useState<import("@tiptap/react").Editor | null>(null);

  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const validate = useCallback(() => {
    const errors: string[] = [];
    if (!title.trim()) errors.push("Project title is required.");
    if (!author.trim()) errors.push("Author name is required.");
    if (!date.trim()) errors.push("Date is required.");
    if (phase === null) errors.push("Project phase is required.");

    const TYPE_LABELS: Record<string, string> = {
      image: "image",
      table: "table",
      codeBlock: "code block",
      rawLatex: "LaTeX block",
      header: "header"
    };

    if (editor) {
      const doc = editor.getJSON();
      const resources = extractResources(doc);
      for (const res of Object.values(resources)) {
        const label = TYPE_LABELS[res.type] || res.type;
        if (!res.title?.trim()) errors.push(`Title missing for ${label}.`);
        if (res.type !== "header" && !res.caption?.trim()) errors.push(`Caption missing for ${label}.`);
      }

      const refs = extractReferences(doc);
      if (refs.length > 0 && metadata?.entries) {
        const existingIds = new Set<string>();
        for (const entry of Object.values(metadata.entries)) {
          existingIds.add(entry.id);
          if (entry.resources) {
            for (const resId of Object.keys(entry.resources)) {
              existingIds.add(resId);
            }
          }
        }
        for (const refId of refs) {
          if (!existingIds.has(refId)) errors.push(`Broken reference found: ${refId}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }, [title, author, date, phase, editor, metadata]);

  // Local validation state for immediate UI feedback.
  // Editor is the sole authority on validity while open — parent isValid is only used for initial value.
  // This prevents flickering caused by stale metadata flowing back down during debounced saves.
  const [localIsValid, setLocalIsValid] = useState(metadata.entries[entryId]?.isValid !== false);



  // Local metadata validation (immediate for UI)
  useEffect(() => {
    const { valid, errors } = validate();
    if (valid !== localIsValid || JSON.stringify(errors) !== JSON.stringify(validationErrors)) {
      requestAnimationFrame(() => {
        setLocalIsValid(valid);
        setValidationErrors(errors);
        setEntryValidity(entryId, valid, errors);
      });
    }
  }, [title, author, phase, date, editor?.state.doc.content, validate, localIsValid, validationErrors, currentProjectId, entryId, setEntryValidity]);

  const [isSaving, setIsSaving] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [showTableGrid, setShowTableGrid] = useState(false);
  const tableButtonRef = useRef<HTMLDivElement>(null);
  const linkButtonRef = useRef<HTMLDivElement>(null);
  const [gridPos, setGridPos] = useState({ top: 0, left: 0 });
  const [linkButtonRect, setLinkButtonRect] = useState<DOMRect | null>(null);

  const toggleLinkFn = useRef<(() => void) | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);

  // Dismiss table grid on click away
  useEffect(() => {
    if (!showTableGrid) return;
    const handleOutsideClick = () => {
      // Small timeout to allow any other clicks to process first
      setTimeout(() => setShowTableGrid(false), 0);
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [showTableGrid]);

  // Dynamic Phase Logic
  const availablePhases = getPhases(metadata?.phases);
  const phaseConfig = getPhaseConfig(availablePhases);
  const activePhaseCfg = phase && phaseConfig[phase] ? phaseConfig[phase] : null;

  const [, setSelectionUpdate] = useState(0);

  const otherAuthors = React.useMemo(() => {
    const authors = new Set<string>();
    // Add authors from existing entries
    Object.entries(metadata?.entries || {}).forEach(([id, e]) => {
      if (id !== entryId && e.author?.trim()) authors.add(e.author.trim());
    });
    // Add team members
    metadata?.team?.members?.forEach(m => {
      if (m.name?.trim()) authors.add(m.name.trim());
    });
    return Array.from(authors).sort();
  }, [metadata.entries, metadata.team?.members, entryId]);

  const otherTitles = React.useMemo(() => {
    const titles = new Set<string>();
    Object.entries(metadata?.entries || {}).forEach(([id, e]) => {
      if (id !== entryId && e.title?.trim() && !e.title.endsWith(".tex")) titles.add(e.title.trim());
    });
    return Array.from(titles).sort();
  }, [metadata.entries, entryId]);

  const latestContentRef = useRef(content);
  const latestMetadataRef = useRef({ title, author, phase, date });

  useEffect(() => {
    latestContentRef.current = content;
    latestMetadataRef.current = { title, author, phase, date };
  }, [content, title, author, phase, date]);

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

  const generateLatex = useCallback((cnt: TipTapNode | string, t: string, a: string, p: number | null, d: string) => {
    const id = filename.split('/').pop()?.replace('.json', '') || "";

    // Extract resources from the content to pass to generateEntryLatex
    let contentNode = cnt;
    if (typeof cnt === 'string') {
      try {
        contentNode = JSON.parse(cnt);
        // Unwrap standard wrapper if needed
        if (contentNode && typeof contentNode === 'object' && 'content' in contentNode && !('type' in contentNode)) {
          contentNode = (contentNode as Record<string, unknown>).content as TipTapNode;
        }
      } catch {
        // Keep as string if not valid JSON
      }
    }

    const resources = typeof contentNode === 'object' && contentNode !== null ? extractResources(contentNode as TipTapNode) : {};
    const resourceTypes = buildResourceTypeIndex(metadata.entries, resources, id);

    return generateEntryLatex(cnt, t, a, p === null ? "" : p, initialCreatedAt, id, resourceTypes, d);
  }, [filename, initialCreatedAt, metadata.entries]);



  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const lastSyncedRef = useRef({
    title: initialTitle,
    author: initialAuthor,
    phase: initialPhase,
    date: initialDate,
    contentStr: initialContent
  });

  const lastAutoSavedRef = useRef({
    title: initialTitle,
    author: initialAuthor,
    phase: initialPhase,
    date: initialDate,
    contentStr: initialContent
  });

  // No manual reset effect needed - the component remounts when entryId changes due to the 'key' prop

  // ── Callback refs (stable references to avoid resetting timers on re-render) ──
  const generateLatexRef = useRef(generateLatex);
  useEffect(() => {
    generateLatexRef.current = generateLatex;
  }, [generateLatex]);

  // Metadata and content changes are now both handled by the debounced auto-save below
  // to avoid spamming the storage layer while typing.


  // ── Debounced content auto-save ──────────────────────────────────────────────
  // Only content changes are debounced (800ms) since they trigger disk/GitHub I/O.
  // Uses refs for metadata so title/author/phase keystrokes don't reset the timer.
  useEffect(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    const isContentChanged = contentStr !== lastAutoSavedRef.current.contentStr;
    const isMetadataChanged = title !== lastAutoSavedRef.current.title ||
      author !== lastAutoSavedRef.current.author ||
      phase !== lastAutoSavedRef.current.phase ||
      date !== lastAutoSavedRef.current.date;

    if (isContentChanged || isMetadataChanged) {
      setIsAutoSaving(true);
      autoSaveTimerRef.current = setTimeout(() => {
        const { title, author, phase, date } = latestMetadataRef.current;
        const currentContent = latestContentRef.current;
        const contentStr = typeof currentContent === 'string' ? currentContent : JSON.stringify(currentContent);

        const latex = generateLatexRef.current(currentContent, title, author, phase, date);
        updateEntry(entryId, latex, contentStr, { title, author, phase, date });

        lastAutoSavedRef.current.contentStr = contentStr;
        lastAutoSavedRef.current.title = title;
        lastAutoSavedRef.current.author = author;
        lastAutoSavedRef.current.phase = phase;
        lastAutoSavedRef.current.date = date;

        setIsAutoSaving(false);
        autoSaveTimerRef.current = null;
      }, 800);
    }

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [content, filename, title, author, phase, date, entryId, updateEntry]);

  const handleSave = useCallback(async () => {
    const { valid, errors } = validate();
    if (!valid) {
      setValidationErrors(errors);
      return;
    }

    setValidationErrors([]);
    setIsSaving(true);

    // Clear auto-save timer if it exists to avoid redundant saves
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    const latex = generateLatex(content, title, author, phase, date);
    const contentStr = JSON.stringify(content);

    await updateEntry(entryId, latex, contentStr, { title, author, phase, date });
    lastSyncedRef.current = { title, author, phase, date, contentStr };
    setIsAutoSaving(false);

    setIsSaving(false);
  }, [content, title, author, phase, date, generateLatex, validate, updateEntry, entryId]);

  const handleDownload = () => {
    const latex = generateLatex(content, title, author, phase, date);
    const blob = new Blob([latex], { type: "text/plain;charset=utf-8" });
    saveAs(blob, filename);
  };

  useEffect(() => {
    if (activeMenu) {
      setShowTableGrid(false);
    }
  }, [activeMenu]);

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
  }, [handleSave]);



  const insertImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && editor) {
        const reader = new FileReader();
        reader.onload = async () => {
          let dataUrl = reader.result as string;

          // Auto-convert SVG to PNG for LaTeX compatibility
          if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
            try {
              dataUrl = await convertSvgToPng(dataUrl);
            } catch (e) {
              console.error("SVG conversion failed", e);
            }
          }

          const base64 = dataUrl.split(",")[1];
          const hash = await hashContent(base64);
          const ext = getExtensionFromDataUrl(dataUrl);
          const newPath = `${ASSETS_DIR}/${hash}.${ext}`;

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
              attrs: { id: generateUUID(), src: dataUrl, filePath: newPath, title: "" }
            }).run();
          } else {
            editor.chain().focus().insertContent({
              type: "image",
              attrs: { id: generateUUID(), src: dataUrl, filePath: newPath, title: "" }
            }).run();
          }

        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  return (
    <div className="flex flex-col h-full bg-nb-surface overflow-hidden scrollbar-hide">
      {/* ── Fixed Header ────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-nb-outline-variant bg-nb-surface/80 backdrop-blur-md z-[150]">

        {/* Row 1: Menu Bar */}
        <div className="px-4 h-10 flex items-center gap-2 border-b border-nb-outline-variant/30 relative z-[170]">
          <button
            onClick={() => setIsHeaderCollapsed(!isHeaderCollapsed)}
            className="p-1.5 rounded-lg hover:bg-nb-surface-mid text-nb-on-surface-variant transition-colors group cursor-pointer shrink-0"
            title={isHeaderCollapsed ? "Expand Header" : "Collapse Header"}
          >
            {isHeaderCollapsed ? (
              <ChevronDown size={14} className="group-hover:scale-110 transition-transform" />
            ) : (
              <ChevronUp size={14} className="group-hover:scale-110 transition-transform" />
            )}
          </button>


          <MenuItem label="File" activeMenu={activeMenu} setActiveMenu={setActiveMenu}>
            <MenuAction icon={<Save size={14} />} label="Save Entry" onClick={handleSave} setActiveMenu={setActiveMenu} />
            <MenuAction
              icon={<FileJson size={14} />}
              label="Download JSON"
              onClick={async () => {
                await exportEntries([entryId]);
              }}
              setActiveMenu={setActiveMenu}
            />
            <MenuAction icon={<FileCode size={14} />} label="Download LaTeX" onClick={handleDownload} setActiveMenu={setActiveMenu} />
            <div className="h-px bg-nb-outline-variant/30 my-1 mx-2" />
            <MenuAction icon={<X size={14} />} label="Close" onClick={onClose || (() => { })} setActiveMenu={setActiveMenu} />
            <MenuAction icon={<Trash2 size={14} />} label="Delete" onClick={() => {
              showConfirm(
                "Delete Entry",
                `Are you sure you want to delete "${title || "Untitled Entry"}"? This action cannot be undone and will permanently remove the entry and its associated LaTeX file.`,
                () => {
                  deleteEntry({ name: filename.split('/').pop() || "", path: filename });
                  onClose?.();
                },
                "danger"
              );
            }} setActiveMenu={setActiveMenu} />
          </MenuItem>

          <MenuItem label="Edit" activeMenu={activeMenu} setActiveMenu={setActiveMenu}>
            <MenuAction
              icon={<Undo2 size={14} />}
              label="Undo"
              onClick={() => editor?.chain().focus().undo().run()}
              disabled={!editor?.can().undo()}
              setActiveMenu={setActiveMenu}
            />
            <MenuAction
              icon={<Redo2 size={14} />}
              label="Redo"
              onClick={() => editor?.chain().focus().redo().run()}
              disabled={!editor?.can().redo()}
              setActiveMenu={setActiveMenu}
            />
          </MenuItem>

          <MenuItem label="Insert" activeMenu={activeMenu} setActiveMenu={setActiveMenu}>
            <MenuAction icon={<ImagePlus size={14} />} label="Image" onClick={insertImage} setActiveMenu={setActiveMenu} />
            <MenuAction
              icon={<TableIcon size={14} />}
              label="Table"
              onClick={(e) => {
                const menuButton = (e.currentTarget as HTMLElement).closest('.relative');
                if (menuButton) {
                  const rect = menuButton.getBoundingClientRect();
                  // Position below the "Insert" menu button
                  setGridPos({ top: rect.bottom + 4, left: rect.left });
                  setShowTableGrid(true);
                }
              }}
              setActiveMenu={setActiveMenu}
            />
            <MenuAction
              icon={<Code size={14} />}
              label="Code Block"
              onClick={() => {
                if (!editor) return;
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
              setActiveMenu={setActiveMenu}
            />
            <MenuAction
              icon={<Terminal size={14} />}
              label="LaTeX Block"
              onClick={() => {
                if (!editor) return;
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
              setActiveMenu={setActiveMenu}
            />
          </MenuItem>


          <div className="flex-1 min-w-[20px]" />

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

          <button
            onClick={onClose}
            title="Close Entry"
            className="p-1.5 ml-2 rounded-lg bg-nb-surface-low hover:bg-red-500/10 text-nb-on-surface-variant hover:text-red-500 transition-all border border-nb-outline-variant/30 hover:border-red-500/30 group cursor-pointer"
          >
            <X size={16} className="group-hover:scale-110 transition-transform" />
          </button>

        </div>

        {/* Row 2: Metadata Row */}
        {!isHeaderCollapsed && (
          <div className="px-6 py-2.5 flex flex-wrap items-center gap-3 max-w-7xl mx-auto relative z-[160]">
            <div className="flex-1 min-w-[200px]">
              <AutocompleteInput
                type="text"
                value={title}
                options={otherTitles}
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
                onSelectOption={(val) => {
                  setTitle(val);
                }}
                placeholder="Project Title..."
                className="w-full text-xl font-bold bg-transparent text-nb-on-surface outline-none placeholder:text-nb-outline-variant"
              />
            </div>

            {!localIsValid && (
              <ValidationTooltip
                errors={validationErrors.length > 0 ? validationErrors : ["Incomplete entry metadata or resource captions"]}
                size={20}
                className="mr-4"
                iconContainerClassName="text-amber-500"
                position="bottom"
              />
            )}

            <div className="flex flex-wrap items-center gap-3">
              <DatePicker
                value={date}
                onChange={(val) => setDate(val)}
                className="h-9 flex-1 min-w-[180px]"
              />

              <div
                className="h-9 flex-1 min-w-[200px] flex items-center gap-2.5 px-3 rounded-xl bg-nb-surface-low border border-nb-outline-variant/30 group transition-all focus-within:border-nb-primary/50"
              >
                <User size={15} className="text-nb-primary drop-shadow-sm" />
                <AutocompleteInput
                  type="text"
                  autoComplete="off"
                  value={author}
                  options={otherAuthors}
                  onChange={(e) => { setAuthor(e.target.value); }}
                  onSelectOption={(val) => { setAuthor(val); }}
                  placeholder="Author"
                  className="bg-transparent border-none outline-none text-[11px] font-bold text-nb-on-surface-variant tracking-tight flex-1 min-w-0 placeholder:text-nb-on-surface-variant/20"
                />
              </div>

              <div className="relative h-9 flex-1 min-w-[240px] flex items-center gap-2.5 px-3 rounded-xl border border-nb-outline-variant/30 bg-nb-surface-low transition-all">
                <div
                  className="absolute inset-0 z-10 cursor-pointer"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => setActiveMenu(activeMenu === "Phase" ? null : "Phase")}
                />

                {activePhaseCfg && (
                  <activePhaseCfg.icon size={15} className="shrink-0 drop-shadow-sm" style={{ color: availablePhases.find(p => p.index === phase)?.color }} />
                )}

                {/* Metadata dropdown */}
                <div className={`flex-1 w-full min-w-0 text-xs font-bold tracking-widest truncate ${phase !== null && phaseConfig[phase] ? phaseConfig[phase].text : "text-nb-on-surface-variant/60"}`}>
                  {availablePhases.find(p => p.index === phase)?.name || "No Phase Selected"}
                </div>
                <ChevronDown size={12} className={`text-nb-on-surface-variant/40 shrink-0 transition-transform duration-200 ${activeMenu === "Phase" ? "rotate-180" : ""}`} />

                {activeMenu === "Phase" && (
                  <div
                    className="absolute top-full left-0 right-0 mt-1 bg-nb-surface border border-nb-outline-variant shadow-nb-xl rounded-xl p-1.5 z-[200] animate-in fade-in slide-in-from-top-1 duration-150"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {availablePhases.map(p => {
                      const cfg = phaseConfig[p.index];
                      const Icon = cfg.icon;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { setPhase(p.index); setActiveMenu(null); }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[10px] font-bold tracking-widest transition-all text-left cursor-pointer active:scale-[0.98] ${phase === p.index ? `${cfg.bg} ${cfg.text} hover:brightness-90` : "text-nb-on-surface-variant hover:bg-nb-surface-mid hover:text-nb-on-surface hover:ring-1 hover:ring-nb-primary/20"}`}
                        >
                          <Icon size={14} style={{ color: p.color }} />
                          <span className="flex-1">{p.name.toUpperCase()}</span>
                          {phase === p.index && <LucideIcons.Check size={12} style={{ color: p.color }} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Row 3: Rich Toolbar */}
        {editor && !isHeaderCollapsed && (
          <div className="px-6 py-2 border-t border-nb-outline-variant/30 bg-nb-surface-mid/50 overflow-x-auto overflow-y-hidden scrollbar-hide shrink-0">
            <div className="max-w-7xl mx-auto flex items-center gap-1 min-w-max">
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

              <div className="relative" ref={linkButtonRef}>
                <ToolbarButton
                  onClick={() => {
                    if (linkButtonRef.current) {
                      setLinkButtonRect(linkButtonRef.current.getBoundingClientRect());
                    }
                    toggleLinkFn.current?.();
                  }}
                  active={editor.isActive("link")}
                  title="Insert Link/Reference"
                >
                  <LinkIcon size={16} />
                </ToolbarButton>
              </div>

              <div className="w-px h-6 bg-nb-outline-variant/30 mx-1.5" />

              <ToolbarButton
                onClick={() => {
                  if (editor.isActive("heading", { level: 1 })) {
                    editor.chain().focus().setParagraph().run();
                    return;
                  }

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
                  if (editor.isActive("heading", { level: 2 })) {
                    editor.chain().focus().setParagraph().run();
                    return;
                  }

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

              <div className="relative" ref={tableButtonRef}>
                <ToolbarButton
                  onClick={(e) => {
                    e?.stopPropagation();
                    if (!showTableGrid && tableButtonRef.current) {
                      const rect = tableButtonRef.current.getBoundingClientRect();
                      // Position below button, aligned to its right edge
                      setGridPos({ top: rect.bottom + 8, left: rect.right - 204 });
                      setShowTableGrid(true);
                    } else {
                      setShowTableGrid(false);
                    }
                  }}
                  active={showTableGrid}
                  title="Insert Table"
                >
                  <TableIcon size={16} />
                </ToolbarButton>
                {showTableGrid && createPortal(
                  <div
                    style={{
                      position: 'fixed',
                      top: Math.max(8, Math.min(gridPos.top, (typeof window !== 'undefined' ? window.innerHeight : 1000) - 220)),
                      left: Math.max(8, Math.min(gridPos.left, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 220)),
                      zIndex: 9999
                    }}
                    className="shadow-2xl rounded-xl animate-in fade-in zoom-in-95 duration-200"
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
                  </div>,
                  document.body
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
      <div className="flex-1 overflow-y-auto overflow-x-auto bg-nb-surface scrollbar-hide">
        <div className="max-w-7xl mx-auto px-14 lg:pl-16 lg:pr-8 py-4 min-h-full">
          <UnifiedEditor
            key={filename}
            filename={filename}
            content={content}
            onChange={setContent}
            author={author}
            onEditorInit={setEditor}
            onToggleLink={(fn) => { toggleLinkFn.current = fn; }}
            triggerRect={linkButtonRect}
            entryId={entryId}
          />
        </div>
      </div>
    </div>
  );
}, (prev, next) => {
  return (
    prev.openFile.id === next.openFile.id &&
    prev.openFile.updatedAt === next.openFile.updatedAt &&
    prev.metadata === next.metadata
  );
});

// Wrapper component that handles null check before calling hooks
const Editor = ({
  onClose,
  showConfirm,
}: EditorProps) => {
  const {
    openFile,
    metadata,
    updateEntry,
    deleteEntry,
    currentProjectId,
    setEntryValidity,
    exportEntries
  } = useWorkspace();

  if (!openFile) return null;

  return (
    <EditorContent
      key={openFile.id}
      openFile={openFile}
      metadata={metadata}
      updateEntry={updateEntry}
      deleteEntry={deleteEntry}
      currentProjectId={currentProjectId}
      setEntryValidity={setEntryValidity}
      exportEntries={exportEntries}
      onClose={onClose}
      showConfirm={showConfirm}
    />
  );
};

export default Editor;
