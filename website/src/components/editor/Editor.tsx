"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import RichTextArea from "./RichTextArea";
import type { TiptapEditor } from "@/lib/types";
import { ToolbarButton } from "./ui/ToolbarButton";
import { TableGridSelector } from "./ui/TableGridSelector";
import { createPortal } from "react-dom";
import { saveAs } from "file-saver";
import {
  Save, Trash2, Loader2, User, X, FileCode,
  Undo2, Redo2, ImagePlus, ChevronDown, ChevronUp, List, ListOrdered,
  Code, Table as TableIcon, Heading, Bold, Italic, Image as ImageIcon,
  Terminal, Link as LinkIcon, Underline as UnderlineIcon, Sigma,
  FileJson, Strikethrough, Palette, Highlighter, Superscript, Subscript, HelpCircle
} from "lucide-react";
import ValidationTooltip from "./ui/ValidationTooltip";
import * as LucideIcons from "lucide-react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle
} from "react-resizable-panels";
import ViewToggle, { ViewMode } from "./ui/ViewToggle";
import dynamic from "next/dynamic";

const LatexPreview = dynamic(() => import("./LatexPreview"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full gap-4 bg-nb-bg/50 backdrop-blur-sm">
      <Loader2 size={32} className="animate-spin-stable text-nb-primary" />
      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-nb-on-surface-variant animate-pulse">Initializing Preview...</span>
    </div>
  )
});
import { getLocalDateString } from "@/lib/metadata";
import { generateEntryLatex } from "@/lib/latex";
import { getPhases, getPhaseConfig } from "@/lib/phases";
import AutocompleteInput from "./ui/AutocompleteInput";
import DatePicker from "./ui/DatePicker";
import { extractResources, extractReferences, TipTapNode, ensureResourceIds, buildResourceTypeIndex, validateEntry } from "@/lib/metadata";
import { ASSETS_COMPRESSED_DIR, ASSETS_ORIGINAL_DIR, TYPE_LABELS } from "@/lib/constants";
import { generateUUID, hashContent, getExtensionFromDataUrl, convertSvgToPng, compressImageToJpeg } from "@/lib/utils";
import { NodeSelection } from "@tiptap/pm/state";

// Returns a safe insertion position for block nodes, or null to insert at selection
export function getSafeInsertPos(ed: TiptapEditor | null): number | null {
  if (!ed) return null;
  const { selection } = ed.state;
  if (selection instanceof NodeSelection) return selection.to;
  try {
    if (ed.isActive('tableCell') || ed.isActive('tableHeader') || ed.isActive('codeBlock')) {
      return selection.$from.after(1);
    }
  } catch {
    try { return selection.$from.after(); } catch { return null; }
  }
  return null;
}

// Insert a block node at a safe position (or at selection if no safe position).
export function insertBlock(editor: TiptapEditor | null, content: TipTapNode, options?: { fallback?: () => void, selectNodeId?: string }) {
  if (!editor) return;
  const { fallback, selectNodeId } = options || {};
  const safePos = getSafeInsertPos(editor);

  const chain = safePos !== null
    ? editor.chain().focus().insertContentAt(safePos, content)
    : editor.chain().focus().insertContent(content);

  if (selectNodeId) {
    chain.command(({ state, commands }) => {
      let newPos = -1;
      state.doc.descendants((node, pos) => {
        if (node.attrs && node.attrs.id === selectNodeId) {
          newPos = pos;
          return false;
        }
      });
      if (newPos >= 0) commands.setNodeSelection(newPos);
      return true;
    });
  }

  if (safePos !== null) {
    chain.run();
  } else {
    if (fallback) fallback();
    else chain.run();
  }
}

// ─── Sub-components for Performance ──────────────────────────────────────────

const ColorMenu = ({ editor, onReset, onApply }: { editor: TiptapEditor, onReset: () => void, onApply: () => void }) => {
  const [localColor, setLocalColor] = useState(() => editor.getAttributes('textStyle').color || "#000000");
  const currentColor = editor.getAttributes('textStyle').color || "#000000";
  const hasChanged = localColor !== currentColor;

  return (
    <>
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {["#d9282f", "#1e40af", "#2d5a27", "#7e22ce", "#f59e0b", "#6b7280", "#ef4444", "#3b82f6"].map(color => (
          <button
            key={color}
            className="w-6 h-6 rounded-md border border-nb-outline-variant/30 cursor-pointer hover:scale-110 transition-transform shadow-sm"
            style={{ backgroundColor: color }}
            onClick={() => {
              editor.chain().focus().setColor(color).run();
              setLocalColor(color);
              onApply();
            }}
          />
        ))}
      </div>
      <div className="flex flex-col gap-2 pt-2 border-t border-nb-outline-variant/30">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[9px] font-black text-nb-on-surface-variant uppercase tracking-widest">Custom</label>
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={localColor}
              className="w-8 h-5 rounded cursor-pointer bg-transparent border-none p-0"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setLocalColor(e.target.value);
              }}
            />
            {hasChanged && (
              <button
                onClick={() => {
                  editor.chain().focus().setColor(localColor).run();
                  onApply();
                }}
                className="px-2 py-0.5 rounded bg-nb-primary text-white text-[9px] font-bold uppercase tracking-wider animate-in fade-in zoom-in-95 duration-200 cursor-pointer"
              >
                Apply
              </button>
            )}
          </div>
        </div>
        <button
          className="w-full text-[9px] font-black py-2 hover:bg-nb-surface-mid rounded-lg transition-colors uppercase tracking-widest text-nb-on-surface-variant border border-nb-outline-variant/20"
          onClick={onReset}
        >
          Reset Color
        </button>
      </div>
    </>
  );
};

const HighlightMenu = ({ editor, onClear, onApply }: { editor: TiptapEditor, onClear: () => void, onApply: () => void }) => {
  const [localColor, setLocalColor] = useState(() => editor.getAttributes('highlight').color || "#ffff00");
  const currentColor = editor.getAttributes('highlight').color || "#ffff00";
  const hasChanged = localColor !== currentColor;

  return (
    <>
      <div className="grid grid-cols-5 gap-1.5 mb-3">
        {["#ffff00", "#00ff00", "#00ffff", "#ff00ff", "#ff0000", "#ffa500", "#cccccc", "#fef08a", "#bbf7d0", "#bfdbfe"].map(color => (
          <button
            key={color}
            className="w-6 h-6 rounded-md border border-nb-outline-variant/30 cursor-pointer hover:scale-110 transition-transform shadow-sm"
            style={{ backgroundColor: color }}
            onClick={() => {
              editor.chain().focus().toggleHighlight({ color }).run();
              setLocalColor(color);
              onApply();
            }}
          />
        ))}
      </div>
      <div className="flex flex-col gap-2 pt-2 border-t border-nb-outline-variant/30">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[9px] font-black text-nb-on-surface-variant uppercase tracking-widest">Custom</label>
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={localColor}
              className="w-8 h-5 rounded cursor-pointer bg-transparent border-none p-0"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setLocalColor(e.target.value);
              }}
            />
            {hasChanged && (
              <button
                onClick={() => {
                  editor.chain().focus().setHighlight({ color: localColor }).run();
                  onApply();
                }}
                className="px-2 py-0.5 rounded bg-nb-primary text-white text-[9px] font-bold uppercase tracking-wider animate-in fade-in zoom-in-95 duration-200 cursor-pointer"
              >
                Apply
              </button>
            )}
          </div>
        </div>
        <button
          className="w-full text-[9px] font-black py-2 hover:bg-nb-surface-mid rounded-lg transition-colors uppercase tracking-widest text-nb-on-surface-variant border border-nb-outline-variant/20"
          onClick={onClear}
        >
          Clear Highlight
        </button>
      </div>
    </>
  );
};

/* ─────────────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────────────── */

import { useWorkspace } from "@/hooks/useWorkspace";

interface EditorProps {
  onClose?: () => void;
  showConfirm: (title: string, message: string, onConfirm: () => void, variant?: "danger" | "warning" | "info") => void;
  viewMode: ViewMode;
  onSetViewMode: (mode: ViewMode) => void;
  pdfUrl?: string;
  onOpenHelp?: () => void;
}

const parseInitialContent = (raw: unknown): TipTapNode | string => {
  if (!raw) return "";
  if (typeof raw === 'object' && raw !== null) {
    // Ensure heading IDs for loaded content
    return ensureResourceIds(raw as TipTapNode);
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
        parsed = ensureResourceIds(parsed as TipTapNode);
      }

      return parsed as TipTapNode | string;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
};

const MenuItem = ({ label, children, activeMenu, setActiveMenu }: { label: string, children: React.ReactNode, activeMenu: string | null, setActiveMenu: (val: string | null) => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  return (
    <div className="relative h-full flex items-center" ref={containerRef}>
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => {
          if (activeMenu !== label && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setCoords({ top: rect.bottom, left: rect.left });
          }
          setActiveMenu(activeMenu === label ? null : label);
        }}
        onMouseEnter={() => {
          if (activeMenu && activeMenu !== label && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setCoords({ top: rect.bottom, left: rect.left });
            setActiveMenu(label);
          } else if (activeMenu) {
            setActiveMenu(label);
          }
        }}
        className={`px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-widest transition-colors cursor-pointer ${activeMenu === label ? "bg-nb-primary text-white" : "text-nb-on-surface-variant hover:bg-nb-surface-mid"
          }`}
      >
        {label}
      </button>
      {activeMenu === label && createPortal(
        <div
          style={{
            position: 'fixed',
            top: coords.top + 4,
            left: coords.left,
            zIndex: 9999
          }}
          className="w-48 bg-nb-surface border border-nb-outline-variant shadow-nb-xl rounded-xl p-1.5 animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200 ease-out"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {children}
        </div>,
        document.body
      )}
    </div>
  );
};

const MenuAction = ({ icon, label, onClick, disabled, setActiveMenu }: { icon: React.ReactNode, label: string, onClick: (e: React.MouseEvent) => void, disabled?: boolean, setActiveMenu: (val: string | null) => void }) => (
  <button
    type="button"
    onClick={(e) => { onClick(e); setActiveMenu(null); }}
    disabled={disabled}
    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[10px] font-bold tracking-widest text-nb-on-surface-variant hover:bg-nb-primary/10 hover:text-nb-primary hover:translate-x-1 transition-all disabled:opacity-30 disabled:hover:bg-transparent text-left cursor-pointer"
  >
    <div className="opacity-60">{icon}</div>
    <span className="flex-1">{label}</span>
  </button>
);

interface ConvertibleAttrs {
  listType?: string;
  [key: string]: unknown;
}

const isListActive = (editor: TiptapEditor | null, listType: 'bullet' | 'ordered') => {
  if (!editor) return false;
  if (editor.isActive("notebookListItem", { listType })) return true;

  const { selection } = editor.state;
  let firstConvertibleType: string | null = null;
  let firstConvertibleAttrs: unknown = null;

  editor.state.doc.nodesBetween(selection.from, selection.to, (node: import("@tiptap/pm/model").Node, pos: number) => {
    if (firstConvertibleType) return false;
    if (node.type.name === 'table' || node.type.name === 'codeBlock') {
      return false;
    }
    if (node.isBlock && node.type.name !== 'doc') {
      const startsAtOrAfterTo = pos >= selection.to;
      const endsAtOrBeforeFrom = pos + node.nodeSize <= selection.from;
      if (startsAtOrAfterTo || endsAtOrBeforeFrom) {
        return;
      }
      const isConvertible = node.type.name === 'paragraph' || node.type.name === 'heading' || node.type.name === 'notebookListItem';
      if (isConvertible) {
        firstConvertibleType = node.type.name;
        firstConvertibleAttrs = node.attrs;
      }
    }
  });

  return firstConvertibleType === 'notebookListItem' && (firstConvertibleAttrs as ConvertibleAttrs | null)?.listType === listType;
};

const EditorToolbar = React.memo(function EditorToolbar({
  editor,
  activeMenu,
  setActiveMenu,
  textColorPos,
  setTextColorPos,
  highlightPos,
  setHighlightPos,
  headingPos,
  setHeadingPos,
  gridPos,
  setGridPos,
  showTableGrid,
  setShowTableGrid,
  insertImage,
  toggleLinkFn,
}: {
  editor: TiptapEditor;
  activeMenu: string | null;
  setActiveMenu: (val: string | null) => void;
  insertImage: () => void;
  toggleLinkFn: React.MutableRefObject<(() => void) | null>;
  textColorPos: { top: number, left: number };
  setTextColorPos: React.Dispatch<React.SetStateAction<{ top: number, left: number }>>;
  highlightPos: { top: number, left: number };
  setHighlightPos: React.Dispatch<React.SetStateAction<{ top: number, left: number }>>;
  headingPos: { top: number, left: number };
  setHeadingPos: React.Dispatch<React.SetStateAction<{ top: number, left: number }>>;
  gridPos: { top: number, left: number };
  setGridPos: React.Dispatch<React.SetStateAction<{ top: number, left: number }>>;
  showTableGrid: boolean;
  setShowTableGrid: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const [, setSelectionUpdate] = useState(0);

  const textColorButtonRef = useRef<HTMLDivElement>(null);
  const highlightButtonRef = useRef<HTMLDivElement>(null);
  const headingButtonRef = useRef<HTMLDivElement>(null);
  const tableButtonRef = useRef<HTMLDivElement>(null);
  const linkButtonRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="border-t border-nb-outline-variant/30 bg-nb-surface-mid/50 shrink-0 overflow-x-auto scrollbar-hide w-full">
      <div className="px-4 md:px-6 py-2 flex items-center gap-1 min-w-max">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold">
          <Bold size={16} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic">
          <Italic size={16} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline">
          <UnderlineIcon size={16} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")} title="Inline Code">
          <Code size={16} />
        </ToolbarButton>
        <ToolbarButton onClick={() => (editor.chain().focus() as unknown as { toggleInlineMath: () => import("@tiptap/core").ChainedCommands }).toggleInlineMath().run()} active={editor.isActive("inlineMath")} title="Inline Math">
          <Sigma size={16} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Strike-through">
          <Strikethrough size={16} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleSuperscript().run()} active={editor.isActive("superscript")} title="Superscript">
          <Superscript size={16} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleSubscript().run()} active={editor.isActive("subscript")} title="Subscript">
          <Subscript size={16} />
        </ToolbarButton>

        <div className="w-px h-6 bg-nb-outline-variant/30 mx-1.5" />

        <div className="relative" ref={textColorButtonRef}>
          <ToolbarButton
            onClick={() => {
              if (activeMenu !== "TextColor" && textColorButtonRef.current) {
                const rect = textColorButtonRef.current.getBoundingClientRect();
                setTextColorPos({ top: rect.bottom + 4, left: rect.left });
              }
              setActiveMenu(activeMenu === "TextColor" ? null : "TextColor");
            }}
            active={activeMenu === "TextColor"}
            title="Text Color"
          >
            <div className="flex flex-col items-center gap-0.5">
              <Palette size={16} style={{ color: editor.getAttributes('textStyle').color || 'inherit' }} />
              <div
                className="w-4 h-0.5 rounded-full"
                style={{ backgroundColor: editor.getAttributes('textStyle').color || 'transparent' }}
              />
            </div>
          </ToolbarButton>
          {activeMenu === "TextColor" && createPortal(
            <div
              style={{
                position: 'fixed',
                top: textColorPos.top,
                left: textColorPos.left,
                zIndex: 9999
              }}
              className="bg-nb-surface border border-nb-outline-variant shadow-nb-xl rounded-xl p-3 w-44 animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200 ease-out"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <ColorMenu
                editor={editor}
                onReset={() => {
                  editor.chain().focus().unsetColor().run();
                  setActiveMenu(null);
                }}
                onApply={() => setActiveMenu(null)}
              />
            </div>,
            document.body
          )}
        </div>

        <div className="relative" ref={highlightButtonRef}>
          <ToolbarButton
            onClick={() => {
              if (activeMenu !== "Highlight" && highlightButtonRef.current) {
                const rect = highlightButtonRef.current.getBoundingClientRect();
                setHighlightPos({ top: rect.bottom + 4, left: rect.left });
              }
              setActiveMenu(activeMenu === "Highlight" ? null : "Highlight");
            }}
            active={activeMenu === "Highlight"}
            title="Highlight"
          >
            <div className="flex flex-col items-center gap-0.5">
              <Highlighter size={16} style={{ color: editor.getAttributes('highlight').color || 'inherit' }} />
              <div
                className="w-4 h-0.5 rounded-full"
                style={{ backgroundColor: editor.getAttributes('highlight').color || 'transparent' }}
              />
            </div>
          </ToolbarButton>
          {activeMenu === "Highlight" && createPortal(
            <div
              style={{
                position: 'fixed',
                top: highlightPos.top,
                left: highlightPos.left,
                zIndex: 9999
              }}
              className="bg-nb-surface border border-nb-outline-variant shadow-nb-xl rounded-xl p-3 w-44 animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200 ease-out"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <HighlightMenu
                editor={editor}
                onClear={() => {
                  editor.chain().focus().unsetHighlight().run();
                  setActiveMenu(null);
                }}
                onApply={() => setActiveMenu(null)}
              />
            </div>,
            document.body
          )}
        </div>

        <div className="w-px h-6 bg-nb-outline-variant/30 mx-1.5" />

        <div className="relative" ref={linkButtonRef}>
          <ToolbarButton
            onClick={() => {
              toggleLinkFn.current?.();
            }}
            active={editor.isActive("link")}
            title="Insert Link/Reference"
          >
            <LinkIcon size={16} />
          </ToolbarButton>
        </div>

        <div className="w-px h-6 bg-nb-outline-variant/30 mx-1.5" />

        <div className="relative" ref={headingButtonRef}>
          <ToolbarButton
            onClick={() => {
              if (activeMenu !== "HeadingDropdown" && headingButtonRef.current) {
                const rect = headingButtonRef.current.getBoundingClientRect();
                setHeadingPos({ top: rect.bottom + 4, left: rect.left });
              }
              setActiveMenu(activeMenu === "HeadingDropdown" ? null : "HeadingDropdown");
            }}
            active={editor.isActive("heading")}
            title="Change Heading"
          >
            <div className="flex items-center gap-1">
              <Heading size={16} />
              <ChevronDown size={10} className={`transition-transform duration-200 ${activeMenu === "HeadingDropdown" ? "rotate-180" : ""}`} />
            </div>
          </ToolbarButton>
          {activeMenu === "HeadingDropdown" && createPortal(
            <div
              style={{
                position: 'fixed',
                top: headingPos.top,
                left: headingPos.left,
                zIndex: 9999
              }}
              className="bg-nb-surface border border-nb-outline-variant shadow-nb-xl rounded-xl p-1.5 w-56 animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200 ease-out"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                className={`w-full flex items-center px-4 py-3 rounded-lg transition-all text-left cursor-pointer active:scale-[0.98] ${!editor.isActive("heading") ? "bg-nb-primary text-white" : "text-nb-on-surface-variant hover:bg-nb-surface-mid hover:translate-x-1"}`}
                onClick={() => { editor.chain().focus().setParagraph().run(); setActiveMenu(null); }}
              >
                <span className="text-sm font-medium">Paragraph (Standard Text)</span>
              </button>
              {([1, 2] as const).map(level => (
                <button
                  key={level}
                  className={`w-full flex items-center px-4 py-3 rounded-lg transition-all text-left cursor-pointer active:scale-[0.98] ${editor.isActive("heading", { level }) ? "bg-nb-primary text-white" : "text-nb-on-surface-variant hover:bg-nb-surface-mid hover:translate-x-1"}`}
                  onClick={() => {
                    insertBlock(editor, { type: 'heading', attrs: { level } }, { fallback: () => editor.chain().focus().toggleHeading({ level }).run() });
                    setActiveMenu(null);
                  }}
                >
                  <span style={{
                    fontSize: level === 1 ? '1.25rem' : level === 2 ? '1.05rem' : level === 3 ? '0.95rem' : '0.85rem',
                    fontWeight: 'bold'
                  }}>
                    Heading Level {level}
                  </span>
                </button>
              ))}
            </div>,
            document.body
          )}
        </div>

        <div className="w-px h-6 bg-nb-outline-variant/30 mx-1.5" />

        <ToolbarButton
          onClick={() => {
            insertBlock(editor, { type: 'notebookListItem', attrs: { listType: 'bullet', indent: 1 } }, { fallback: () => editor.chain().focus().toggleNotebookList("bullet").run() });
          }}
          active={isListActive(editor, "bullet")}
          title="Bullet List"
        >
          <List size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => {
            insertBlock(editor, { type: 'notebookListItem', attrs: { listType: 'ordered', indent: 1 } }, { fallback: () => editor.chain().focus().toggleNotebookList("ordered").run() });
          }}
          active={isListActive(editor, "ordered")}
          title="Ordered List"
        >
          <ListOrdered size={16} />
        </ToolbarButton>

        <div className="w-px h-6 bg-nb-outline-variant/30 mx-1.5" />

        <ToolbarButton
          onClick={() => {
            insertBlock(editor, { type: 'codeBlock', attrs: { id: generateUUID() } });
          }}
          active={editor.isActive("codeBlock")}
          title="Code Block"
        >
          <Code size={16} />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => {
            insertBlock(editor, { type: 'rawLatex' });
          }}
          active={editor.isActive("rawLatex")}
          title="Raw LaTeX"
        >
          <Terminal size={16} />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => {
            const id = generateUUID();
            insertBlock(editor, { type: 'mathBlock', attrs: { id } }, { selectNodeId: id });
          }}
          active={editor.isActive("mathBlock")}
          title="Equation Block"
        >
          <Sigma size={16} className="scale-110" />
        </ToolbarButton>

        <div className="relative" ref={tableButtonRef} data-table-trigger="true">
          <ToolbarButton
            onClick={(e) => {
              e?.stopPropagation();
              if (!showTableGrid && tableButtonRef.current) {
                const rect = tableButtonRef.current.getBoundingClientRect();
                setGridPos({ top: rect.bottom + 8, left: rect.right - 204 });
                setShowTableGrid(true);
                setActiveMenu(null);
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
              data-table-dropdown="true"
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

                  insertBlock(editor, tableContent);
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
  );
});

const EditorContent = React.memo(function EditorContent({
  openFile,
  metadata,
  updateEntry,
  deleteEntry,
  setEntryValidity,
  exportEntries,
  onClose,
  showConfirm,
  viewMode,
  onSetViewMode,
  workspaceVersion,
  onOpenHelp,
  updateDraft,
}: EditorProps & {
  openFile: NonNullable<ReturnType<typeof useWorkspace>['openFile']>;
  metadata: ReturnType<typeof useWorkspace>['metadata'];
  updateEntry: ReturnType<typeof useWorkspace>['updateEntry'];
  deleteEntry: ReturnType<typeof useWorkspace>['deleteEntry'];
  currentProjectId: ReturnType<typeof useWorkspace>['currentProjectId'];
  setEntryValidity: ReturnType<typeof useWorkspace>['setEntryValidity'];
  exportEntries: ReturnType<typeof useWorkspace>['exportEntries'];
  setPendingSave: (val: boolean) => void;
  workspaceVersion: number;
  updateDraft: ReturnType<typeof useWorkspace>['updateDraft'];
}) {
  const {
    path: filename,
    createdAt: initialCreatedAt,
    id: entryId
  } = openFile;

  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const validate = useCallback(() => {
    const entryIdMeta = metadata.entries[entryId];
    const isTemplate = entryIdMeta?.isTemplate || false;

    // Build the set of existing IDs (for references)
    const existingIds = new Set<string>();
    if (metadata?.entries) {
      for (const entry of Object.values(metadata.entries)) {
        existingIds.add(entry.id);
        if (entry.resources) {
          for (const resId of Object.keys(entry.resources)) {
            existingIds.add(resId);
          }
        }
      }
    }

    // Extract live resources from the current editor instance
    let liveResources: Record<string, any> | undefined = undefined;
    let liveReferences: string[] = [];
    if (editor) {
      const doc = editor.getJSON();
      liveResources = extractResources(doc);
      liveReferences = extractReferences(doc);
    }

    // Combine current openFile form fields with the live resources from the editor
    const entryToValidate = {
      ...entryIdMeta,
      id: entryId,
      title: openFile.title || "",
      author: openFile.author || "",
      date: openFile.date || "",
      phase: openFile.phase,
      isTemplate,
      resources: liveResources || entryIdMeta?.resources,
      references: liveReferences.length > 0 ? liveReferences : (entryIdMeta?.references || [])
    };

    const phases = metadata.phases || [];
    const errors = validateEntry(entryToValidate, phases, existingIds);

    return { valid: errors.length === 0, errors };
  }, [openFile.title, openFile.author, openFile.date, openFile.phase, editor, metadata, entryId]);

  // Local validation state for immediate UI feedback.
  // Editor is the sole authority on validity while open — parent isValid is only used for initial value.
  // This prevents flickering caused by stale metadata flowing back down during debounced saves.
  const [localIsValid, setLocalIsValid] = useState(metadata.entries[entryId]?.isValid !== false);

  // Local metadata validation (debounced for performance)
  useEffect(() => {
    const timer = setTimeout(() => {
      const { valid, errors } = validate();
      if (valid !== localIsValid || JSON.stringify(errors) !== JSON.stringify(validationErrors)) {
        setLocalIsValid(valid);
        setValidationErrors(errors);
        setEntryValidity(entryId, valid, errors);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [openFile.title, openFile.author, openFile.phase, openFile.date, openFile.tiptapContent, editor?.state.doc.content, validate, localIsValid, validationErrors, entryId, setEntryValidity]);

  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    if (!editorPanelRef.current || !previewPanelRef.current) return;

    if (viewMode === "editor") {
      editorPanelRef.current.expand();
      previewPanelRef.current.collapse();
    } else if (viewMode === "preview") {
      editorPanelRef.current.collapse();
      previewPanelRef.current.expand();
    } else { // split
      editorPanelRef.current.expand();
      previewPanelRef.current.resize(50);
      editorPanelRef.current.resize(50);
    }
  }, [viewMode]);


  const editorPanelRef = useRef<import("react-resizable-panels").ImperativePanelHandle>(null);
  const previewPanelRef = useRef<import("react-resizable-panels").ImperativePanelHandle>(null);
  const [isResizing, setIsResizing] = useState(false);
  const phaseButtonRef = useRef<HTMLDivElement>(null);
  const [phasePos, setPhasePos] = useState({ top: 0, left: 0, width: 0 });
  const toggleLinkFn = useRef<(() => void) | null>(null);

  const [showTableGrid, setShowTableGrid] = useState(false);
  const [textColorPos, setTextColorPos] = useState({ top: 0, left: 0 });
  const [highlightPos, setHighlightPos] = useState({ top: 0, left: 0 });
  const [headingPos, setHeadingPos] = useState({ top: 0, left: 0 });
  const [gridPos, setGridPos] = useState({ top: 0, left: 0 });

  const handleSetActiveMenu = useCallback((menu: string | null) => {
    setActiveMenu(menu);
    if (menu) {
      setShowTableGrid(false);
    }
  }, []);

  // Dismiss table grid on click away
  useEffect(() => {
    if (!showTableGrid) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-table-trigger="true"]') || target?.closest('[data-table-dropdown="true"]')) {
        return;
      }
      setShowTableGrid(false);
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [showTableGrid, setShowTableGrid]);

  // Dynamic Phase Logic
  const availablePhases = getPhases(metadata?.phases);
  const phaseConfig = getPhaseConfig(availablePhases);
  const activePhaseCfg = openFile.phase !== null && openFile.phase !== undefined && phaseConfig[openFile.phase] ? phaseConfig[openFile.phase] : null;

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

  const handleEditorChange = useCallback((newVal: string) => {
    updateDraft(newVal, {});
  }, [updateDraft]);

  // use module-level getSafeInsertPos

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

  const previewLatex = React.useMemo(() => {
    return generateLatex(openFile.tiptapContent, openFile.title, openFile.author, openFile.phase, openFile.date);
  }, [openFile.tiptapContent, openFile.title, openFile.author, openFile.phase, openFile.date, generateLatex]);

  const handleSave = useCallback(async () => {
    const { valid, errors } = validate();
    if (!valid) {
      setValidationErrors(errors);
      return;
    }

    setValidationErrors([]);

    try {
      await updateEntry(entryId, previewLatex, openFile.tiptapContent, {
        title: openFile.title,
        author: openFile.author,
        phase: openFile.phase,
        date: openFile.date
      });
    } catch (e) {
      console.error(e);
    }
  }, [openFile.tiptapContent, openFile.title, openFile.author, openFile.phase, openFile.date, previewLatex, validate, updateEntry, entryId]);

  const handleDownload = () => {
    const latex = generateLatex(openFile.tiptapContent, openFile.title, openFile.author, openFile.phase, openFile.date);
    const blob = new Blob([latex], { type: "text/plain;charset=utf-8" });
    saveAs(blob, filename);
  };

  useEffect(() => {
    if (!activeMenu) return;
    const handleOutsideClick = () => {
      setActiveMenu(null);
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [activeMenu]);

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

          const originalBase64 = dataUrl.split(",")[1];
          const originalHash = await hashContent(originalBase64);
          const originalExt = getExtensionFromDataUrl(dataUrl);
          const compressed = await compressImageToJpeg(dataUrl, 1920, 0.8).catch(() => ({ dataUrl, base64: originalBase64 }));
          const compressedHash = await hashContent(compressed.base64);
          const originalPath = `${ASSETS_ORIGINAL_DIR}/${originalHash}.${originalExt}`;
          const newPath = `${ASSETS_COMPRESSED_DIR}/${compressedHash}.jpg`;

          insertBlock(editor, { type: "image", attrs: { id: generateUUID(), src: compressed.dataUrl, originalSrc: dataUrl, filePath: newPath, originalFilePath: originalPath, title: "" } });

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
        <div className="w-full">

          {/* Row 1: Menu Bar */}
          <div className="px-4 md:px-6 min-h-[2.5rem] py-1 flex flex-wrap items-center gap-2 border-b border-nb-outline-variant/30 relative z-[170]">
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

            <MenuItem label="File" activeMenu={activeMenu} setActiveMenu={handleSetActiveMenu}>
              <MenuAction icon={<Save size={14} />} label="Save Entry" onClick={handleSave} setActiveMenu={handleSetActiveMenu} />
              <MenuAction
                icon={<FileJson size={14} />}
                label="Download ZIP"
                onClick={async () => {
                  await exportEntries([entryId]);
                }}
                setActiveMenu={handleSetActiveMenu}
              />
              <MenuAction icon={<FileCode size={14} />} label="Download LaTeX" onClick={handleDownload} setActiveMenu={handleSetActiveMenu} />
              <div className="h-px bg-nb-outline-variant/30 my-1 mx-2" />
              <MenuAction icon={<X size={14} />} label="Close" onClick={onClose || (() => { })} setActiveMenu={handleSetActiveMenu} />
              <MenuAction icon={<Trash2 size={14} />} label="Delete" onClick={() => {
                showConfirm(
                  "Delete Entry",
                  `Are you sure you want to delete "${openFile.title || "Untitled Entry"}"? This action cannot be undone and will permanently remove the entry and its associated LaTeX file.`,
                  () => {
                    deleteEntry({ name: filename.split('/').pop() || "", path: filename });
                    onClose?.();
                  },
                  "danger"
                );
              }} setActiveMenu={handleSetActiveMenu} />
            </MenuItem>

            <MenuItem label="Edit" activeMenu={activeMenu} setActiveMenu={handleSetActiveMenu}>
              <MenuAction
                icon={<Undo2 size={14} />}
                label="Undo"
                onClick={() => editor?.chain().focus().undo().run()}
                disabled={!editor?.can().undo()}
                setActiveMenu={handleSetActiveMenu}
              />
              <MenuAction
                icon={<Redo2 size={14} />}
                label="Redo"
                onClick={() => editor?.chain().focus().redo().run()}
                disabled={!editor?.can().redo()}
                setActiveMenu={handleSetActiveMenu}
              />
            </MenuItem>

            <MenuItem label="Insert" activeMenu={activeMenu} setActiveMenu={handleSetActiveMenu}>
              <MenuAction icon={<ImagePlus size={14} />} label="Image" onClick={insertImage} setActiveMenu={handleSetActiveMenu} />
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
                    setActiveMenu(null);
                  }
                }}
                setActiveMenu={handleSetActiveMenu}
              />
              <MenuAction
                icon={<Code size={14} />}
                label="Code Block"
                onClick={() => {
                  if (!editor) return;
                  insertBlock(editor, { type: 'codeBlock', attrs: { id: generateUUID() } });
                  setActiveMenu(null);
                }}
                setActiveMenu={handleSetActiveMenu}
              />
              <MenuAction
                icon={<Terminal size={14} />}
                label="LaTeX Block"
                onClick={() => {
                  if (!editor) return;
                  insertBlock(editor, { type: 'rawLatex' });
                  setActiveMenu(null);
                }}
                setActiveMenu={handleSetActiveMenu}
              />
              <MenuAction
                icon={<Sigma size={14} />}
                label="Math Block"
                onClick={() => {
                  if (!editor) return;
                  const id = generateUUID();
                  insertBlock(editor, { type: 'mathBlock', attrs: { id } }, { selectNodeId: id });
                  setActiveMenu(null);
                }}
                setActiveMenu={handleSetActiveMenu}
              />
            </MenuItem>

            <div className="flex-1 min-w-[20px]" />

            <div className="flex items-center gap-2 mr-4">
              <ViewToggle viewMode={viewMode} onSetViewMode={onSetViewMode} />
            </div>



            <button
              onClick={onOpenHelp}
              title="Help & Guide"
              className="p-1.5 ml-2 rounded-lg bg-nb-surface-low hover:bg-nb-primary/10 text-nb-on-surface-variant hover:text-nb-primary transition-all border border-nb-outline-variant/30 hover:border-nb-primary/30 group cursor-pointer"
            >
              <HelpCircle size={16} className="group-hover:scale-110 transition-transform" />
            </button>

            <button
              onClick={onClose}
              title="Close Entry"
              className="p-1.5 ml-2 rounded-lg bg-nb-surface-low hover:bg-red-500/10 text-nb-on-surface-variant hover:text-red-500 transition-all border border-nb-outline-variant/30 hover:border-red-500/30 group cursor-pointer"
            >
              <X size={16} className="group-hover:scale-110 transition-transform" />
            </button>

          </div>

          <div className={`grid transition-all duration-500 ease-in-out ${isHeaderCollapsed ? 'grid-rows-[0fr] opacity-0 pointer-events-none' : 'grid-rows-[1fr] opacity-100'}`}>
            <div className="min-h-0 overflow-hidden">
              <div className={`flex flex-col transition-all duration-500 ease-in-out ${isHeaderCollapsed ? '-translate-y-6' : 'translate-y-0'}`}>
                {/* Row 2: Metadata */}
                <div className="px-4 md:px-6 py-2.5 flex flex-wrap items-center gap-3 relative z-[160] shrink-0">
                  <div className="flex-1 min-w-[280px]">
                    <AutocompleteInput
                      type="text"
                      value={openFile.title}
                      options={otherTitles}
                      onChange={(e) => {
                        updateDraft(null, { title: e.target.value });
                      }}
                      onSelectOption={(val) => {
                        updateDraft(null, { title: val });
                      }}
                      placeholder="Entry Title..."
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

                  <div className="flex flex-wrap items-center gap-2 md:gap-3 flex-1 md:flex-none">
                    <DatePicker
                      value={openFile.date || ""}
                      onChange={(val) => updateDraft(null, { date: val })}
                      className="h-9 flex-1 min-w-[140px]"
                    />

                    <div
                      className="h-9 flex-1 min-w-[160px] flex items-center gap-2.5 px-3 rounded-xl bg-nb-surface-low border border-nb-outline-variant/30 group transition-all focus-within:border-nb-primary/50"
                    >
                      <User size={15} className="text-nb-primary drop-shadow-sm shrink-0" />
                      <AutocompleteInput
                        type="text"
                        autoComplete="off"
                        value={openFile.author}
                        options={otherAuthors}
                        onChange={(e) => { updateDraft(null, { author: e.target.value }); }}
                        onSelectOption={(val) => { updateDraft(null, { author: val }); }}
                        placeholder="Author"
                        className="bg-transparent border-none outline-none text-[13px] font-bold text-nb-on-surface-variant tracking-tight flex-1 min-w-0 placeholder:text-nb-on-surface-variant/20"
                      />
                    </div>

                    <div
                      ref={phaseButtonRef}
                      className="relative h-9 flex-1 min-w-[240px] flex items-center gap-2.5 px-3 rounded-xl border border-nb-outline-variant/30 bg-nb-surface-low transition-all"
                    >
                      <div
                        className="absolute inset-0 z-10 cursor-pointer"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => {
                          if (activeMenu !== "Phase" && phaseButtonRef.current) {
                            const rect = phaseButtonRef.current.getBoundingClientRect();
                            setPhasePos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
                          }
                          setActiveMenu(activeMenu === "Phase" ? null : "Phase");
                        }}
                      />

                      {activePhaseCfg && (
                        <activePhaseCfg.icon size={15} className="shrink-0 drop-shadow-sm" style={{ color: availablePhases.find(p => p.index === openFile.phase)?.color }} />
                      )}

                      {/* Metadata dropdown */}
                      <div className={`flex-1 w-full min-w-0 text-xs font-bold tracking-widest truncate ${openFile.phase !== null && phaseConfig[openFile.phase] ? phaseConfig[openFile.phase].text : "text-nb-on-surface-variant/60"}`}>
                        {availablePhases.find(p => p.index === openFile.phase)?.name || "No Phase Selected"}
                      </div>
                      <ChevronDown size={12} className={`text-nb-on-surface-variant/40 shrink-0 transition-transform duration-200 ${activeMenu === "Phase" ? "rotate-180" : ""}`} />

                      {activeMenu === "Phase" && createPortal(
                        <div
                          style={{
                            position: 'fixed',
                            top: phasePos.top,
                            left: phasePos.left,
                            width: phasePos.width,
                            zIndex: 9999
                          }}
                          className="mt-1 bg-nb-surface border border-nb-outline-variant shadow-nb-xl rounded-xl p-1.5 animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200 ease-out"
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          {/* Deselect option */}
                          {openFile.phase !== null && openFile.phase !== undefined && (
                            <button
                              type="button"
                              onClick={() => { updateDraft(null, { phase: null }); setActiveMenu(null); }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[10px] font-bold tracking-widest transition-all text-left cursor-pointer active:scale-[0.98] text-nb-on-surface-variant hover:bg-nb-surface-mid hover:text-nb-on-surface"
                            >
                              <LucideIcons.X size={14} className="text-nb-on-surface-variant/50" />
                              <span className="flex-1">NO PHASE</span>
                            </button>
                          )}
                          {availablePhases.map(p => {
                            const cfg = phaseConfig[p.index];
                            const Icon = cfg.icon;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => { updateDraft(null, { phase: p.index }); setActiveMenu(null); }}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[10px] font-bold tracking-widest transition-all text-left cursor-pointer active:scale-[0.98] ${openFile.phase === p.index ? `${cfg.bg} ${cfg.text} hover:brightness-90` : "text-nb-on-surface-variant hover:bg-nb-surface-mid hover:text-nb-on-surface hover:translate-x-1 hover:ring-1 hover:ring-nb-primary/20"}`}
                              >
                                <Icon size={14} style={{ color: p.color }} />
                                <span className="flex-1">{p.name.toUpperCase()}</span>
                                {openFile.phase === p.index && <LucideIcons.Check size={12} style={{ color: p.color }} />}
                              </button>
                            );
                          })}
                        </div>,
                        document.body
                      )}
                    </div>
                  </div>
                </div>

                {/* Row 3: Rich Toolbar */}
                {editor && (
                  <EditorToolbar
                    editor={editor}
                    activeMenu={activeMenu}
                    setActiveMenu={handleSetActiveMenu}
                    insertImage={insertImage}
                    toggleLinkFn={toggleLinkFn}
                    textColorPos={textColorPos}
                    setTextColorPos={setTextColorPos}
                    highlightPos={highlightPos}
                    setHighlightPos={setHighlightPos}
                    headingPos={headingPos}
                    setHeadingPos={setHeadingPos}
                    gridPos={gridPos}
                    setGridPos={setGridPos}
                    showTableGrid={showTableGrid}
                    setShowTableGrid={setShowTableGrid}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Scrollable Workspace ──────────────────────────────────── */}
      <div className="flex-1 overflow-hidden relative">
        <PanelGroup direction="horizontal" className="h-full" id="editor-preview-group">
          <Panel
            id="editor-panel" order={1} minSize={30} collapsible={true} ref={editorPanelRef}
            defaultSize={viewMode === "editor" ? 100 : (viewMode === "preview" ? 0 : 50)}
            className={`flex flex-col h-full ${isResizing ? "pointer-events-none select-none" : "transition-all duration-500 ease-in-out"} ${viewMode === "preview" ? "opacity-0 scale-[0.98] pointer-events-none" : "opacity-100 scale-100"}`}
          >
            <div className="flex-1 overflow-hidden relative">
              <div className="absolute inset-0 flex flex-col overflow-y-auto custom-scrollbar">
                <RichTextArea
                  key={`${filename}-${workspaceVersion}`}
                  filename={filename}
                  content={parseInitialContent(openFile.tiptapContent)} // Initial load only
                  onChange={handleEditorChange}
                  author={openFile.author}
                  onEditorInit={setEditor}
                  onToggleLink={(fn) => { toggleLinkFn.current = fn; }}
                  entryId={entryId}
                />
              </div>
            </div>
          </Panel>
          <PanelResizeHandle
            id="editor-preview-resizer"
            onDragging={setIsResizing}
            className={`w-1.5 bg-nb-surface-mid hover:bg-nb-tertiary/40 transition-colors ${viewMode !== 'split' ? 'hidden' : ''}`}
          />
          <Panel
            id="preview-panel" order={2} collapsible={true} minSize={30} ref={previewPanelRef}
            defaultSize={viewMode === "preview" ? 100 : (viewMode === "editor" ? 0 : 50)}
            className={`flex flex-col h-full bg-nb-surface-low ${isResizing ? "pointer-events-none select-none" : "transition-all duration-500 ease-in-out"} ${viewMode === "editor" ? "opacity-0 scale-[0.98] pointer-events-none" : "opacity-100 scale-100"}`}
          >
            <LatexPreview latexContent={previewLatex} />
          </Panel>
        </PanelGroup>
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
const Editor = (props: EditorProps) => {
  const {
    openFile,
    metadata,
    updateEntry,
    deleteEntry,
    currentProjectId,
    setEntryValidity,
    exportEntries,
    setPendingSave,
    workspaceVersion,
    updateDraft,
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
      setPendingSave={setPendingSave}
      workspaceVersion={workspaceVersion}
      updateDraft={updateDraft}
      {...props}
    />
  );
};

export default Editor;
