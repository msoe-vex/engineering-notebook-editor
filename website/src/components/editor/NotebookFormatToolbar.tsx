"use client";

import React, { useState, useEffect, useRef } from "react";
import type { TiptapEditor } from "@/lib/types";
import { ToolbarButton } from "./ui/ToolbarButton";
import { TableGridSelector } from "./ui/TableGridSelector";
import { createPortal } from "react-dom";
import {
  List, ListOrdered, Code, Table as TableIcon, Heading, Bold, Italic, Image as ImageIcon,
  Terminal, Link as LinkIcon, Underline as UnderlineIcon, Sigma, ChevronDown,
  Strikethrough, Palette, Highlighter, Superscript, Subscript
} from "lucide-react";
import type { TipTapNode } from "@/lib/notebook/metadata";
import { generateUUID } from "@/lib/utils";
import { NodeSelection } from "@tiptap/pm/state";

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

/** Formatting strip shared by classic Editor and cloud collab entry view. */
export const NotebookFormatToolbar = React.memo(function NotebookFormatToolbar({
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
    <div className="thin-scrollbar w-full shrink-0 overflow-x-auto bg-nb-surface-mid/40 touch-pan-x">
      <div className="flex min-w-max items-center gap-0.5 px-3 py-1.5 md:gap-1 md:px-4 md:py-1.5">
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
