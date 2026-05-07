"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  useEditor, EditorContent, Extension,
} from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { TableRow } from "@tiptap/extension-table-row";
import {
  CustomLink,
  PrismHighlightExtension,
  IntegrityPlugin,
  IdRemapper,
} from "@/lib/editor/extensions";

import {
  ImageWithCaption,
  TableWithCaption,
  RestrictedTableHeader,
  RestrictedTableCell,
  CustomCodeBlock,
  CustomRawLatex,
} from "@/components/editor/nodes";

import { LinkReferencePopup } from "@/components/editor/LinkReferencePopup";

import { generateUUID, hashContent, getExtensionFromDataUrl, convertSvgToPng } from "@/lib/utils";
import { ASSETS_DIR } from "@/lib/constants";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";



import ListItem from "@tiptap/extension-list-item";

const RestrictedListItem = ListItem.extend({
  content: "paragraph+",
});

/* ─────────────────────────────────────────────────────────────────
   Main Component
   ───────────────────────────────────────────────────────────────── */

interface UnifiedEditorProps {
  content: string | import("@/lib/metadata").TipTapNode;
  onChange: (content: string) => void;
  onImageUpload?: (path: string, base64: string) => void;
  author?: string;
  filename: string;
  dbName?: string;
  onEditorInit?: (editor: import("@tiptap/react").Editor) => void;
  onToggleLink?: (fn: () => void) => void;
  notebookMetadata?: import("@/lib/metadata").NotebookMetadata;
  targetResourceId?: string | null;
  entryId?: string;
}


export default function UnifiedEditor({
  content, onChange, onImageUpload, filename, dbName = "notebook-pending", onEditorInit, notebookMetadata, onToggleLink, targetResourceId, entryId
}: UnifiedEditorProps) {
  const parseContent = (raw: string | import("@/lib/metadata").TipTapNode) => {
    if (!raw) return "";
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch { return raw; }
  };


  const handleImageFile = (file: File) => {
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

      if (editor?.isActive('tableCell') || editor?.isActive('tableHeader')) {
        // Prevent image insertion inside tables as LaTeX cannot render them
        return;
      }

      const imageAttrs = {
        id: generateUUID(),
        src: dataUrl, // Keep dataUrl for immediate preview
        alt: "",
        title: "",
        filePath: newPath,
      };

      if (editor?.state.selection instanceof NodeSelection) {
        editor.chain().focus().insertContentAt(editor.state.selection.to, {
          type: "image",
          attrs: imageAttrs,
        }).run();
      } else {
        editor?.chain().focus().insertContent({
          type: "image",
          attrs: imageAttrs,
        }).run();
      }

      if (onImageUpload) onImageUpload(newPath, base64);
    };
    reader.readAsDataURL(file);
  };

  const [, setSelectionUpdate] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showLinkPopup, setShowLinkPopup] = useState(false);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => setIsCtrlPressed(e.ctrlKey || e.metaKey);
    const handleBlur = () => setIsCtrlPressed(false);
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKey);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKey);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: false,
        underline: false,
        listItem: false,
        dropcursor: {
          color: '#d9282f',
          width: 3,
        }
      }),
      RestrictedListItem,
      ImageWithCaption.configure({ inline: false, allowBase64: true, dbName }),
      TableWithCaption.configure({ resizable: true }),
      TableRow,
      RestrictedTableHeader,
      RestrictedTableCell,
      CustomCodeBlock,
      CustomRawLatex,
      PrismHighlightExtension,
      Extension.create({
        name: 'integrityExtension',
        addProseMirrorPlugins: () => notebookMetadata ? [IntegrityPlugin(notebookMetadata)] : []
      }),
      Underline,
      CustomLink.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: 'text-nb-primary hover:underline hover:decoration-nb-primary transition-all cursor-text',
        },
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'codeBlock') return ""; 
          return "Start writing...";
        },
      }),
      IdRemapper,
    ],
    content: parseContent(content),
    onUpdate: ({ editor }) => {
      onChange(JSON.stringify(editor.getJSON()));
    },
    onSelectionUpdate: () => {
      setSelectionUpdate(s => s + 1);
    },
    onTransaction: () => {
      setSelectionUpdate(s => s + 1);
    },
    editorProps: {
      attributes: { class: "focus:outline-none min-h-[800px] h-full max-w-5xl mx-auto p-4 lg:p-6 cursor-text" },
      handleDOMEvents: {
        mousedown: (view, event) => {
          if (event.ctrlKey || event.metaKey) {
            const target = event.target as HTMLElement;
            if (target.closest('a')) {
              event.preventDefault();
              return true;
            }
          }
          return false;
        },
        click: (view, event) => {
          const target = event.target as HTMLElement;
          const anchor = target.closest('a');
          if (anchor) {
            const href = anchor.getAttribute('href');
            // Allow right-click for native browser context menu
            if (event.button === 2) {
              return false;
            }
            if (href?.startsWith('#')) {
              event.preventDefault(); // Stop browser from navigating
              if (event.ctrlKey || event.metaKey) {
                const resId = href.slice(1);
                const linkEntryId = anchor.getAttribute('data-entry-id');
                const params = new URLSearchParams(window.location.search);

                let changed = false;
                if (linkEntryId && linkEntryId !== params.get('entry')) {
                  params.set('entry', linkEntryId);
                  changed = true;
                }

                if (resId !== params.get('resource')) {
                  params.set('resource', resId);
                  changed = true;
                }

                if (changed) {
                  window.history.pushState({}, '', `?${params.toString()}`);
                  window.dispatchEvent(new Event('locationchange'));
                }
                return true;
              }
              return false; // No Ctrl: move cursor
            }
            if (event.ctrlKey || event.metaKey) {
              event.preventDefault();
              const url = anchor.href;
              setTimeout(() => {
                const win = window.open(url, '_blank');
                if (win) win.focus();
              }, 0);
              return true;
            }
          }
          return false; // Let editor handle (move cursor)
        },
        dragstart: () => { setIsDragging(true); return false; },
        dragend: () => { setIsDragging(false); return false; },
        dragover: (view, event) => {
          if (!isDragging) setIsDragging(true);
          const scrollContainer = view.dom.closest('.overflow-y-auto');
          if (!scrollContainer) return false;
          const rect = scrollContainer.getBoundingClientRect();
          const y = event.clientY;
          const threshold = 50;
          if (y < rect.top + threshold) {
            scrollContainer.scrollBy({ top: -15, behavior: 'auto' });
          } else if (y > rect.bottom - threshold) {
            scrollContainer.scrollBy({ top: 15, behavior: 'auto' });
          }
          return false;
        },
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (items) {
          for (const item of Array.from(items)) {
            if (item.type.startsWith("image")) {
              const file = item.getAsFile();
              if (file) { handleImageFile(file); return true; }
            }
          }
        }
        return false;
      },
      handleDrop: (_view, event) => {
        setIsDragging(false);
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          for (const file of Array.from(files)) {
            if (file.type.startsWith("image")) {
              handleImageFile(file);
              return true;
            }
          }
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (editor && onEditorInit) {
      onEditorInit(editor);
    }
  }, [editor, onEditorInit]);

  const lastFilenameRef = useRef(filename);

  useEffect(() => {
    if (editor && targetResourceId) {
      const isNewEntry = lastFilenameRef.current !== filename;
      lastFilenameRef.current = filename;

      let attempts = 0;
      const maxAttempts = 20; // Try for 2 seconds (100ms intervals)

      const tryScroll = () => {
        // Special case: if target is the entry itself, scroll to top
        if (targetResourceId === entryId) {
          editor.view.dom.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return true;
        }

        // Find node position in Tiptap doc
        let foundPos = -1;
        editor.state.doc.descendants((node, pos) => {
          if (node.attrs.id === targetResourceId) {
            foundPos = pos;
            return false;
          }
        });

        if (foundPos >= 0) {
          const dom = editor.view.nodeDOM(foundPos) as HTMLElement;
          if (dom) {
            dom.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Highlight
            dom.classList.add('ring-4', 'ring-nb-primary', 'ring-offset-2', 'transition-all', 'duration-1000');
            setTimeout(() => {
              dom.classList.remove('ring-4', 'ring-nb-primary', 'ring-offset-2');
            }, 3000);
            return true;
          }
        }

        // Fallback to DOM selector if nodeDOM fails
        const element = document.querySelector(`[data-id="${targetResourceId}"]`) as HTMLElement;
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('ring-4', 'ring-nb-primary', 'ring-offset-2', 'transition-all', 'duration-1000');
          setTimeout(() => {
            element.classList.remove('ring-4', 'ring-nb-primary', 'ring-offset-2');
          }, 3000);
          return true;
        }

        return false;
      };

      // Initial try with appropriate delay
      const initialDelay = isNewEntry ? 400 : 100;
      const timeout = setTimeout(() => {
        if (!tryScroll()) {
          const interval = setInterval(() => {
            attempts++;
            if (tryScroll() || attempts >= maxAttempts) {
              clearInterval(interval);
            }
          }, 100);
        }
      }, initialDelay);

      return () => clearTimeout(timeout);
    }
  }, [editor, targetResourceId, filename, entryId]);

  useEffect(() => {
    if (onToggleLink && editor) {
      onToggleLink(() => {
        // 1. Clean selection (strip whitespace)
        if (editor.isActive('link')) {
          editor.commands.extendMarkRange('link');
        } else {
          const { from, to } = editor.state.selection;
          if (from !== to) {
            const text = editor.state.doc.textBetween(from, to, " ");
            const startOffset = text.search(/\S/);
            const endOffset = text.trimEnd().length;
            if (startOffset !== -1) {
              editor.chain().setTextSelection({
                from: from + startOffset,
                to: from + endOffset
              }).run();
            }
          }
        }
        // 2. Open popup
        setShowLinkPopup(true);
      });
    }
  }, [onToggleLink, editor]);

  const isInTable = editor?.isActive("tableCell") || editor?.isActive("tableHeader") || false;



  const [showTableGrid, setShowTableGrid] = useState(false);

  // Dismiss table grid on click away
  React.useEffect(() => {
    if (!showTableGrid) return;
    const handleOutsideClick = () => setShowTableGrid(false);
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [showTableGrid]);



  if (!editor) return null;


  return (
    <div className="flex flex-col gap-4">

      <div className="relative group/editor">
        {/* Table Controls (Now embedded in NodeView, keeping this for fallback/external interaction) */}
        {isInTable && !editor.isActive('table') && (
          <div className="absolute -top-12 left-0 right-0 flex flex-wrap items-center justify-center gap-2 p-1.5 bg-nb-primary text-white rounded-lg shadow-nb-lg z-20 animate-in fade-in slide-in-from-bottom-2 duration-200">
            {/* ... fallback controls ... */}
          </div>
        )}

        <div className="bg-nb-surface min-h-[800px] relative">
          <div
            className={`max-w-5xl mx-auto h-full ${isCtrlPressed ? '[&_a]:!cursor-pointer' : ''}`}
            onMouseDown={() => setShowLinkPopup(false)}
          >
            <EditorContent editor={editor} className="h-full" />
          </div>
          {showLinkPopup && (
            <LinkReferencePopup
              editor={editor}
              metadata={notebookMetadata}
              onClose={() => setShowLinkPopup(false)}
              filename={filename}
              showLinkPopup={showLinkPopup}
            />
          )}
        </div>
      </div>
    </div>
  );
}


