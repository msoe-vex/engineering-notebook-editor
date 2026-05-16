"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  useEditor, EditorContent, Extension, InputRule
} from "@tiptap/react";
import { NodeSelection, Transaction, EditorState, Plugin } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { store } from "@/lib/store";
import { useWorkspace } from "@/hooks/useWorkspace";
import { events, EventNames } from "@/lib/events";
import { TableRow } from "@tiptap/extension-table-row";
import {
  CustomLink,
  PrismHighlightExtension,
  IntegrityPlugin,
  IdRemapper,
  CustomHeading,
} from "@/lib/editor/extensions";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { Highlight } from "@tiptap/extension-highlight";
import { Superscript } from "@tiptap/extension-superscript";
import { Subscript } from "@tiptap/extension-subscript";

import {
  ImageWithCaption,
  TableWithCaption,
  RestrictedTableHeader,
  RestrictedTableCell,
  CustomCodeBlock,
  CustomRawLatex,
  InlineMathNode,
  MathBlockNode,
} from "@/components/editor/nodes";

import { LinkReferencePopup } from "@/components/editor/LinkReferencePopup";

import { generateUUID, hashContent, getExtensionFromDataUrl, convertSvgToPng } from "@/lib/utils";
import { ASSETS_DIR } from "@/lib/constants";
import { ensureHeadingIds } from "@/lib/metadata";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";



import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import ListItem from "@tiptap/extension-list-item";

const RestrictedListItem = ListItem.extend({
  name: 'listItem',
  content: "paragraph block*",
  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.splitListItem(this.name),
      Tab: () => {
        // Limit depth to 8 levels to match LaTeX export constraints
        const { state } = this.editor;
        const { $from } = state.selection;
        let listDepth = 0;
        for (let i = 0; i <= $from.depth; i++) {
          const node = $from.node(i);
          if (node.type.name === 'bulletList' || node.type.name === 'orderedList') {
            listDepth++;
          }
        }
        if (listDepth >= 8) return true; // Consume the event but do not indent further
        return this.editor.commands.sinkListItem(this.name);
      },
      "Shift-Tab": () => this.editor.commands.liftListItem(this.name),
    };
  },
});

const CustomSuperscript = Superscript.extend({
  excludes: 'subscript',
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      'Mod-Shift-=': () => { this.editor.chain().focus().toggleSuperscript().run(); return true; },
      'Mod-+': () => { this.editor.chain().focus().toggleSuperscript().run(); return true; },
      'Mod-=': () => { this.editor.chain().focus().toggleSuperscript().run(); return true; },
    };
  },
});

const CustomSubscript = Subscript.extend({
  excludes: 'superscript',
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      'Mod-Shift--': () => { this.editor.chain().focus().toggleSubscript().run(); return true; },
      'Mod--': () => { this.editor.chain().focus().toggleSubscript().run(); return true; },
      'Mod-_': () => { this.editor.chain().focus().toggleSubscript().run(); return true; },
    };
  },
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
  onEditorInit?: (editor: import("@tiptap/react").Editor) => void;
  onToggleLink?: (fn: () => void) => void;
  entryId?: string;
}

export default function UnifiedEditor({
  content, onChange, onImageUpload, filename, onEditorInit, onToggleLink, entryId
}: UnifiedEditorProps) {
  const { currentProjectId, metadata } = useWorkspace();
  const dbName = currentProjectId ? `notebook-project-${currentProjectId}` : "notebook-default";
  const parseContent = (raw: string | import("@/lib/metadata").TipTapNode) => {
    if (!raw) return "";
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      // Ensure all headings have UUIDs
      return ensureHeadingIds(parsed);
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
  const [isMentionMode, setIsMentionMode] = useState(false);
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
      TextStyle.configure(),
      Color.configure(),
      StarterKit.configure({
        codeBlock: false,
        link: false,
        underline: false,
        listItem: false,
        bulletList: false,
        orderedList: false,
        heading: false,
        dropcursor: {
          color: '#d9282f',
          width: 3,
        }
      }),
      CustomHeading.configure({ levels: [1, 2] }),
      BulletList.configure({
        HTMLAttributes: { class: "list-disc" },
      }),
      OrderedList.configure({
        HTMLAttributes: { class: "list-decimal" },
      }),
      RestrictedListItem,
      Highlight.configure({ multicolor: true }),
      CustomSuperscript,
      CustomSubscript,
      ImageWithCaption.configure({ inline: false, allowBase64: true, dbName }),
      TableWithCaption.configure({ resizable: true }),
      TableRow,
      RestrictedTableHeader,
      RestrictedTableCell,
      CustomCodeBlock,
      CustomRawLatex,
      MathBlockNode,
      InlineMathNode,
      Extension.create({
        name: 'globalTabHandler',
        priority: 1,
        addKeyboardShortcuts() {
          return {
            Tab: () => {
              // If we are in a list, sinkListItem is already handled by RestrictedListItem
              // and it returns true if successful. If it returns false, it will fall through to here.
              // We return true here to prevent focus jumping, but only if we haven't already handled it.
              
              // In Tiptap, shortcuts are tried in reverse order of the extensions array.
              // So this should be AFTER RestrictedListItem to act as a fallback.
              return true;
            },
            "Shift-Tab": () => {
              return true;
            },
          };
        },
      }),
      Extension.create({
        name: 'mathCodeMutualExclusion',
        addProseMirrorPlugins() {
          return [
            new Plugin({
              appendTransaction(transactions: readonly Transaction[], oldState: EditorState, newState: EditorState) {
                const { tr } = newState;
                let modified = false;

                // If code mark was just added to a range containing math, convert math to code text
                if (transactions.some(t => t.docChanged || t.storedMarks)) {
                  newState.doc.descendants((node, pos) => {
                    if (node.type.name === 'inlineMath') {
                      const hasCodeMark = node.marks.some((m) => m.type.name === 'code');

                      if (hasCodeMark) {
                        const latex = node.attrs.latex || "";
                        if (latex) {
                          tr.replaceWith(pos, pos + node.nodeSize, newState.schema.text(latex));
                          tr.addMark(pos, pos + latex.length, newState.schema.marks.code.create());
                        } else {
                          tr.delete(pos, pos + node.nodeSize);
                        }
                        modified = true;
                      }
                    }
                  });
                }

                return modified ? tr : null;
              }
            })
          ];
        }
      }),
      PrismHighlightExtension,
      Extension.create({
        name: 'integrityExtension',
        addProseMirrorPlugins: () => [IntegrityPlugin()]
      }),
      Extension.create({
        name: 'initialLinkStyler',
        addProseMirrorPlugins() {
          return [
            new Plugin({
              appendTransaction(transactions, oldState, newState) {
                const { tr } = newState;
                let modified = false;

                newState.doc.descendants((node, pos) => {
                  if (node.isText) {
                    const linkMark = node.marks.find(m => m.type.name === 'link');
                    if (linkMark && !linkMark.attrs.autoStyled) {
                      // Apply default styling (underline and light blue color)
                      tr.addMark(pos, pos + node.nodeSize, newState.schema.marks.underline.create());
                      tr.addMark(pos, pos + node.nodeSize, newState.schema.marks.textStyle.create({ color: '#3b82f6' }));

                      // Mark as autoStyled so we don't re-apply if the user manually changes it
                      const newAttrs = { ...linkMark.attrs, autoStyled: true };
                      tr.removeMark(pos, pos + node.nodeSize, newState.schema.marks.link);
                      tr.addMark(pos, pos + node.nodeSize, newState.schema.marks.link.create(newAttrs));
                      modified = true;
                    }
                  }
                });

                return modified ? tr : null;
              }
            })
          ];
        }
      }),
      Underline,
      CustomLink.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: 'transition-all cursor-text',
        },
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (['codeBlock', 'rawLatex', 'mathBlock'].includes(node.type.name)) return "";
          return "Start writing...";
        },
      }),
      Extension.create({
        name: 'customShortcuts',
        addKeyboardShortcuts() {
          return {
            Enter: ({ editor }) => {
              if (editor.isActive('code')) {
                return editor.chain().splitBlock().unsetMark('code').run();
              }
              if (editor.isActive('link')) {
                return editor.chain().splitBlock().unsetMark('link').unsetMark('underline').unsetColor().run();
              }
              return false;
            },
            'Mod-Shift-s': ({ editor }) => { editor.chain().focus().toggleStrike().run(); return true; },
            'Mod-Shift-x': ({ editor }) => { editor.chain().focus().toggleStrike().run(); return true; },
            'Mod-k': ({ editor }) => {
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
              setShowLinkPopup(true);
              return true;
            },
          };
        },
      }),
      Extension.create({
        name: 'mentionTrigger',
        addInputRules: () => [
          new InputRule({
            find: /(?:^|\s)@$/,
            handler: () => {
              setIsMentionMode(true);
              setShowLinkPopup(true);
              return null; // Keep @ for now, we'll delete it on apply or just leave it if cancelled
            }
          })
        ]
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

                // Only add resource parameter if linking to a resource within an entry, not the entry itself
                const isLinkingToEntry = resId === linkEntryId;
                if (!isLinkingToEntry && resId !== params.get('resource')) {
                  params.set('resource', resId);
                  changed = true;
                }

                if (changed) {
                  const navParams: Record<string, string | null> = { entry: linkEntryId || null };
                  if (!isLinkingToEntry) {
                    navParams.resource = resId;
                  }
                  store.navigateTo(navParams);
                } else {
                  // Already in the same resource, but user clicked again: re-scroll
                  events.emit(EventNames.SCROLL_TO_RESOURCE, resId);
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

  // Trigger a re-validation of links when metadata changes
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      // Dispatch a dummy transaction to force ProseMirror to re-run the IntegrityPlugin apply method
      const { state } = editor;
      editor.view.dispatch(state.tr);
    }
  }, [metadata, editor]);

  // Deep Link Autoscroll Logic
  const performScroll = useCallback((targetId: string, isInitial = false) => {
    if (!editor || !targetId) return;

    let attempts = 0;
    const maxAttempts = 30; // 3 seconds total

    const tryScroll = () => {
      if (editor.isDestroyed) return true;

      // 1. Entry level scroll (scroll the correct container)
      if (targetId === entryId) {
        const container = editor.view.dom.closest('.overflow-y-auto');
        if (container) {
          container.scrollTo({ top: 0, behavior: 'smooth' });
          return true;
        }
        editor.view.dom.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return true;
      }

      // 2. Node level scroll
      let foundPos = -1;
      editor.state.doc.descendants((node, pos) => {
        if (node.attrs.id === targetId) {
          foundPos = pos;
          return false;
        }
      });

      let element: HTMLElement | null = null;
      if (foundPos >= 0) {
        element = editor.view.nodeDOM(foundPos) as HTMLElement;
      }

      if (!element) {
        element = document.querySelector(`[data-id="${targetId}"]`) as HTMLElement;
      }

      if (element) {
        // Check if element is actually "ready" (has dimensions)
        if (element.offsetHeight === 0 && attempts < 10) return false;

        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Highlight
        element.classList.add('ring-4', 'ring-nb-primary', 'ring-offset-2', 'transition-all', 'duration-500', 'z-50');
        setTimeout(() => {
          if (element) element.classList.remove('ring-4', 'ring-nb-primary', 'ring-offset-2', 'z-50');
        }, 1500);
        return true;
      }

      return false;
    };

    // Initial delay to allow rendering
    const timeout = setTimeout(() => {
      if (!tryScroll()) {
        const interval = setInterval(() => {
          attempts++;
          if (tryScroll() || attempts >= maxAttempts) {
            clearInterval(interval);
          }
        }, 100);
      }
    }, isInitial ? 200 : 100);

    return () => clearTimeout(timeout);
  }, [editor, entryId]);

  // Handle Global Scroll Events
  useEffect(() => {
    if (!editor) return;
    const unsub = events.on(EventNames.SCROLL_TO_RESOURCE, (id) => {
      if (typeof id === 'string') performScroll(id);
    });
    return unsub;
  }, [editor, performScroll]);

  // Initial mount scroll (from URL)
  useEffect(() => {
    if (!editor) return;
    const params = new URLSearchParams(window.location.search);
    const resourceId = params.get('resource');
    if (resourceId) {
      performScroll(resourceId, true);
    }
  }, [editor, performScroll]); // Only run on first load of the editor

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
          {showLinkPopup && createPortal(
            <LinkReferencePopup
              editor={editor}
              metadata={metadata}
              onClose={() => { setShowLinkPopup(false); setIsMentionMode(false); }}
              filename={filename}
              showLinkPopup={showLinkPopup}
              isMention={isMentionMode}
            />,
            document.body
          )}
        </div>
      </div>
    </div>
  );
}


