import React, { useState, useEffect } from "react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { Image as TiptapImage, type ImageOptions } from "@tiptap/extension-image";
import Image from "next/image";
import { GripVertical, Trash2, Image as ImageIcon } from "lucide-react";
import { getResource } from "@/lib/db";

import { NodeViewProps } from "./types";

export const ImageNodeView = ({ node, selected, updateAttributes, deleteNode, editor, dbName }: NodeViewProps & { dbName: string }) => {
  const [resolvedSrc, setResolvedSrc] = useState(node.attrs.src);
  const [dragEnabled, setDragEnabled] = useState(false);
  const [, setIsResizing] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (node.attrs.src?.startsWith('data:')) {
        if (active) setResolvedSrc(node.attrs.src);
        return;
      }
      try {
        const cached = await getResource(dbName, node.attrs.src);
        if (cached && active) {
          setResolvedSrc(cached);
          return;
        }
      } catch { }
      if (active) setResolvedSrc(node.attrs.src);
    };
    load();
    return () => { active = false; };
  }, [node.attrs.src, dbName]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startY = e.clientY;
    const startWidth = parseInt(node.attrs.width) || 100;
    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const newWidth = Math.min(100, Math.max(10, startWidth + (deltaY / 4)));
      updateAttributes({ width: `${Math.round(newWidth)}%` });
    };
    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <NodeViewWrapper
      draggable={dragEnabled}
      data-id={node.attrs.id}
      className={`my-6 group relative w-full transition ${selected ? 'z-[100]' : 'z-10'}`}
    >
      <div contentEditable={false} className="absolute -left-12 top-0 bottom-0 w-8 flex flex-col items-center justify-center gap-2 z-[70]">
        <div
          data-drag-handle
          onMouseEnter={() => setDragEnabled(true)}
          onMouseLeave={() => setDragEnabled(false)}
          className="w-8 h-8 rounded-full bg-nb-surface text-nb-on-surface-variant flex items-center justify-center cursor-grab active:cursor-grabbing shadow-sm border border-nb-outline-variant/30 hover:bg-nb-surface-high hover:text-nb-primary transition"
        >
          <GripVertical size={14} />
        </div>
        <div className="flex flex-col gap-1 items-center">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteNode(); editor.commands.focus(); }}
            title="Delete Image"
            className="w-8 h-8 rounded-full bg-nb-surface text-red-500 flex items-center justify-center hover:bg-red-50 transition border border-nb-outline-variant/30 shadow-sm"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className={`rounded-xl border border-nb-outline-variant/30 overflow-hidden bg-nb-surface transition-all duration-300 ${selected ? 'ring-2 ring-nb-primary/50' : ''}`}>
        <div contentEditable={false} className="flex items-center justify-between px-4 py-2 bg-nb-surface-low/50 border-b border-nb-outline-variant/10 overflow-x-auto scrollbar-hide">
          <div className="flex-1 flex items-center gap-3">
            <ImageIcon size={12} className="text-nb-primary shrink-0" />
            <input
              type="text"
              value={node.attrs.title || ""}
              onChange={(e) => updateAttributes({ title: e.target.value })}
              placeholder="Give this image a title..."
              className="flex-1 bg-transparent border-none outline-none text-[12px] font-bold tracking-wider text-nb-on-surface-variant placeholder:text-nb-on-surface-variant/30"
            />
          </div>
        </div>

        <div className="relative flex justify-center">
          <Image
            src={resolvedSrc}
            alt={node.attrs.caption || node.attrs.alt || ""}
            width={0}
            height={0}
            sizes="100vw"
            style={{ width: node.attrs.width ?? "100%", height: "auto" }}
            className="block select-none pointer-events-none"
            draggable={false}
            unoptimized
          />
          <div
            contentEditable={false}
            onMouseDown={startResize}
            className="absolute -bottom-1 left-0 right-0 h-4 cursor-ns-resize flex items-center justify-center group/resize z-50"
            aria-hidden="true"
          >
            <div className={`w-16 h-1 bg-nb-primary rounded-full transition-opacity ${selected ? 'opacity-100' : 'opacity-30 group-hover/resize:opacity-100'}`} />
          </div>
        </div>

        <div contentEditable={false} className="bg-nb-surface-low/30 border-t border-nb-outline-variant/10 px-4 py-2 flex items-center justify-center gap-2 group/caption">
          <input
            type="text"
            value={node.attrs.caption || ""}
            onChange={(e) => updateAttributes({ caption: e.target.value })}
            placeholder="Add figure description..."
            className="w-full bg-transparent border-none outline-none text-center text-xs font-medium italic text-nb-on-surface/50 group-hover/caption:text-nb-on-surface focus:text-nb-on-surface focus:opacity-100 transition-all"
          />
        </div>
      </div>
    </NodeViewWrapper>
  );
};

export const ImageWithCaption = TiptapImage.extend<ImageOptions & { dbName: string }>({
  addOptions() {
    return {
      ...this.parent!(),
      dbName: 'notebook-pending',
    };
  },
  addAttributes() {
    return {
      ...this.parent!(),
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-id'),
        renderHTML: attributes => ({ 'data-id': attributes.id }),
      },
      alt: { default: "" },
      title: { default: "" },
      filePath: { default: null },
      caption: { default: "" },
      width: { default: "100%" },
    };
  },
  draggable: true,
  addNodeView() {
    return ReactNodeViewRenderer((props) => <ImageNodeView {...props as NodeViewProps} dbName={(this.options as unknown as { dbName: string }).dbName} />);
  },
});
