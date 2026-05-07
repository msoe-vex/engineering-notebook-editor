import React, { useState } from "react";
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { GripVertical, Trash2, Table as TableIcon, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Rows3, Columns3 } from "lucide-react";

import { NodeViewProps } from "./types";

export function TableNodeView({ node, updateAttributes, deleteNode, editor, selected, getPos }: NodeViewProps) {
  const [isCursorInside, setIsCursorInside] = useState(false);
  const [isHoveringToolbar, setIsHoveringToolbar] = useState(false);
  const [dragEnabled, setDragEnabled] = useState(false);

  React.useEffect(() => {
    const check = () => {
      try {
        const pos = getPos();
        if (typeof pos !== 'number' || pos < 0) return;
        const { from, to } = editor.state.selection;
        setIsCursorInside(from >= pos && to <= pos + node.nodeSize);
      } catch { }
    };
    check();
    editor.on('selectionUpdate', check);
    return () => { editor.off('selectionUpdate', check); };
  }, [editor, getPos, node.nodeSize]);

  const active = selected || isCursorInside || isHoveringToolbar;

  return (
    <NodeViewWrapper
      draggable={dragEnabled}
      data-id={node.attrs.id}
      className={`my-6 group relative w-full transition ${active ? 'z-[100]' : 'z-10'}`}>

      <div contentEditable={false} className="absolute -left-12 top-0 bottom-0 w-8 flex flex-col items-center justify-center gap-2 z-[70]">
        <div
          data-drag-handle
          onMouseEnter={() => setDragEnabled(true)}
          onMouseLeave={() => setDragEnabled(false)}
          className="w-8 h-8 rounded-full bg-nb-surface text-nb-on-surface-variant flex items-center justify-center cursor-grab active:cursor-grabbing shadow-sm border border-nb-outline-variant/30 hover:bg-nb-surface-high hover:text-nb-primary transition"
        >
          <GripVertical size={14} />
        </div>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteNode(); editor.commands.focus(); }}
          title="Delete Table"
          className="w-8 h-8 rounded-full bg-nb-surface text-red-500 flex items-center justify-center hover:bg-red-50 transition border border-nb-outline-variant/30 shadow-sm"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className={`rounded-xl border border-nb-outline-variant/30 overflow-hidden bg-nb-surface transition-all duration-300 ${active ? 'ring-2 ring-nb-primary/50' : ''}`}>
        <div
          contentEditable={false}
          onMouseEnter={() => setIsHoveringToolbar(true)}
          onMouseLeave={() => setIsHoveringToolbar(false)}
          className="flex items-center gap-1.5 px-3 py-2 bg-nb-surface-low/50 border-b border-nb-outline-variant/10 overflow-x-auto"
        >
          <div className="flex items-center gap-1.5 pr-3 border-r border-nb-outline-variant/20 mr-1 shrink-0">
            <TableIcon size={12} className="text-nb-primary" />
            <input
              type="text"
              value={node.attrs.title || ""}
              onChange={(e) => updateAttributes({ title: e.target.value })}
              placeholder="Table Title..."
              className="bg-transparent border-none outline-none text-[12px] font-bold tracking-wider text-nb-on-surface-variant placeholder:text-nb-on-surface-variant/30 w-48"
            />
          </div>

          <div className={`flex items-center gap-0.5 shrink-0 transition-opacity duration-200 ${isCursorInside || isHoveringToolbar ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
            <div className="flex items-center bg-nb-surface border border-nb-outline-variant/30 p-0.5 rounded-lg shadow-sm">
              <div className="px-1.5 text-nb-on-surface-variant/40 border-r border-nb-outline-variant/10 mr-0.5">
                <Rows3 size={12} />
              </div>
              <button
                onMouseDown={(e) => { e.preventDefault(); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); editor.chain().focus(undefined, { scrollIntoView: false }).addRowBefore().run(); }}
                className="p-1.5 hover:bg-nb-surface-high rounded transition-colors text-nb-on-surface-variant hover:text-nb-primary"
                title="Add Row Above"
              >
                <ChevronUp size={12} />
              </button>
              <button
                onMouseDown={(e) => { e.preventDefault(); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); editor.chain().focus(undefined, { scrollIntoView: false }).addRowAfter().run(); }}
                className="p-1.5 hover:bg-nb-surface-high rounded transition-colors text-nb-on-surface-variant hover:text-nb-primary"
                title="Add Row Below"
              >
                <ChevronDown size={12} />
              </button>
              <div className="w-px h-3 bg-nb-outline-variant/30 mx-0.5" />
              <button
                onMouseDown={(e) => { e.preventDefault(); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); editor.chain().focus(undefined, { scrollIntoView: false }).deleteRow().run(); }}
                className="p-1.5 hover:bg-red-50 rounded transition-colors text-red-500"
                title="Delete Row"
              >
                <Trash2 size={12} />
              </button>
            </div>

            <div className="flex items-center bg-nb-surface border border-nb-outline-variant/30 p-0.5 ml-1.5 rounded-lg shadow-sm">
              <div className="px-1.5 text-nb-on-surface-variant/40 border-r border-nb-outline-variant/10 mr-0.5">
                <Columns3 size={12} />
              </div>
              <button
                onMouseDown={(e) => { e.preventDefault(); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); editor.chain().focus(undefined, { scrollIntoView: false }).addColumnBefore().run(); }}
                className="p-1.5 hover:bg-nb-surface-high rounded transition-colors text-nb-on-surface-variant hover:text-nb-primary"
                title="Add Column Left"
              >
                <ChevronLeft size={12} />
              </button>
              <button
                onMouseDown={(e) => { e.preventDefault(); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); editor.chain().focus(undefined, { scrollIntoView: false }).addColumnAfter().run(); }}
                className="p-1.5 hover:bg-nb-surface-high rounded transition-colors text-nb-on-surface-variant hover:text-nb-primary"
                title="Add Column Right"
              >
                <ChevronRight size={12} />
              </button>
              <div className="w-px h-3 bg-nb-outline-variant/30 mx-0.5" />
              <button
                onMouseDown={(e) => { e.preventDefault(); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); editor.chain().focus(undefined, { scrollIntoView: false }).deleteColumn().run(); }}
                className="p-1.5 hover:bg-red-50 rounded transition-colors text-red-500"
                title="Delete Column"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <NodeViewContent as={"table" as unknown as "div"} className="border-collapse min-w-full table-auto" />
        </div>

        <div contentEditable={false} className="bg-nb-surface-low/30 border-t border-nb-outline-variant/10 px-4 py-2 flex items-center justify-center gap-2 group/caption">
          <input
            type="text"
            value={node.attrs.caption || ""}
            onChange={(e) => updateAttributes({ caption: e.target.value })}
            placeholder="Describe this table..."
            className="w-full bg-transparent border-none outline-none text-center text-xs font-medium italic text-nb-on-surface/50 group-hover/caption:text-nb-on-surface focus:text-nb-on-surface focus:opacity-100 transition-all"
          />
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const TableWithCaption = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-id'),
        renderHTML: attributes => ({ 'data-id': attributes.id }),
      },
      caption: { default: "" },
      title: { default: "" },
    };
  },
  draggable: true,
  addNodeView() {
    return ReactNodeViewRenderer(TableNodeView);
  },
});

export const RestrictedTableCell = TableCell.extend({
  content: 'paragraph+',
});

export const RestrictedTableHeader = TableHeader.extend({
  content: 'paragraph+',
});
