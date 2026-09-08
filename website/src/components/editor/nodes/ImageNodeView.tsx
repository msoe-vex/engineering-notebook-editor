import React, { useState, useEffect, useRef } from "react";
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from "@tiptap/react";
import { Image as TiptapImage, type ImageOptions } from "@tiptap/extension-image";
import Image from "next/image";
import { GripVertical, Trash2, Image as ImageIcon, Upload, Loader2 } from "lucide-react";
import { generateResourceCaption, generateResourceTitle, type ResourceForAI } from "@/lib/genai";
import { events, EventNames } from "@/lib/events";

import { compressImageToJpeg, hashContent, convertSvgToPng, getExtensionFromDataUrl, getMimeTypeFromExtension } from "@/lib/utils";
import { ASSETS_COMPRESSED_DIR, ASSETS_ORIGINAL_DIR } from "@/lib/constants";
import { NodeViewInput } from "./NodeViewInput";
import GenerateButton from "../ui/GenerateButton";
export const ImageNodeView = ({ node, selected, updateAttributes, deleteNode, dbName, editor }: NodeViewProps & { dbName: string }) => {
  const isDataUrl = Boolean(node.attrs.src?.startsWith('data:'));
  const [resolvedSrc, setResolvedSrc] = useState(isDataUrl ? node.attrs.src : "");
  const [isVisible, setIsVisible] = useState(isDataUrl);
  const [isLoading, setIsLoading] = useState(!isDataUrl);
  const [dragEnabled, setDragEnabled] = useState(false);
  const [, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputId = `replace-image-${node.attrs.id}`;

  useEffect(() => {
    if (isDataUrl || isVisible) return;
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isDataUrl, isVisible]);

  useEffect(() => {
    if (!isVisible) return;
    let active = true;
    const load = async () => {
      const targetPath = (node.attrs.filePath as string) || (node.attrs.src as string) || "";
      if (!targetPath) {
        if (active) setIsLoading(false);
        return;
      }

      if (targetPath.startsWith('data:')) {
        if (active) {
          setResolvedSrc(targetPath);
          setIsLoading(false);
        }
        return;
      }

      try {
        const { store } = await import("@/lib/store");

        // 1. Check in-memory session cache (0ms)
        if (store.assetCache.has(targetPath)) {
          const cached = store.assetCache.get(targetPath)!;
          if (active) {
            setResolvedSrc(cached);
            setIsLoading(false);
          }
          return;
        }

        // 2. Fetch on-demand via store (pending / disk / GitHub)
        const b64 = await store.getAssetBase64(targetPath);
        if (b64 && active) {
          const dataUrl = b64.startsWith('data:') ? b64 : `data:${getMimeTypeFromExtension(targetPath)};base64,${b64}`;
          setResolvedSrc(dataUrl);
          setIsLoading(false);
          return;
        }
      } catch (err) {
        console.warn("Failed to load image lazily:", err);
      }

      if (active) {
        setIsLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [node.attrs.src, node.attrs.filePath, dbName, isVisible]);

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

  const resource = (): ResourceForAI => ({
    type: "image",
    title: node.attrs.title,
    caption: node.attrs.caption,
    imageDataUrl: resolvedSrc?.startsWith("data:") ? resolvedSrc : undefined,
  });

  return (
    <NodeViewWrapper
      ref={containerRef}
      draggable={dragEnabled}
      data-id={node.attrs.id}
      className={`my-6 group relative w-full transition ${selected ? 'z-100' : 'z-10'} pl-12`}
    >
      <div contentEditable={false} className="absolute left-0 top-0 bottom-0 w-8 flex flex-col items-center justify-center gap-2 z-70">
        <div
          data-drag-handle
          onMouseEnter={() => setDragEnabled(true)}
          onMouseLeave={() => setDragEnabled(false)}
          className="w-8 h-8 rounded-full bg-nb-surface text-nb-on-surface-variant flex items-center justify-center cursor-grab active:cursor-grabbing shadow-sm border border-nb-outline-variant/30 hover:bg-nb-surface-high hover:text-nb-primary transition"
        >
          <GripVertical size={14} />
        </div>
        <button
          onClick={deleteNode}
          title="Delete Image"
          className="w-8 h-8 rounded-full bg-nb-surface text-red-500 flex items-center justify-center hover:bg-red-50 transition border border-nb-outline-variant/30 shadow-sm"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className={`rounded-xl border border-nb-outline-variant/30 overflow-hidden bg-nb-surface transition-all duration-300 ${selected ? 'ring-2 ring-nb-primary/50' : ''}`}>
        <div contentEditable={false} className="flex items-center justify-between px-4 py-2 bg-nb-surface-low/50 border-b border-nb-outline-variant/10 overflow-x-auto scrollbar-hide">
          <div className="flex-1 flex items-center gap-3">
            <ImageIcon size={12} className="text-nb-primary shrink-0" />
            <NodeViewInput
              editor={editor}
              value={node.attrs.title || ""}
              onUpdate={(title) => updateAttributes({ title })}
              placeholder="Give this image a title..."
              required
              missingMessage="Title is required for this image."
              className="flex-1 bg-transparent border-none outline-none text-[12px] font-bold tracking-wider text-nb-on-surface-variant placeholder:text-nb-on-surface-variant/30"
            />
            <GenerateButton
              label="Generate title"
              disabled={!resolvedSrc?.startsWith("data:")}
              run={() => generateResourceTitle(resource())}
              onResult={(title) => updateAttributes({ title })}
            />
          </div>
          <div className="flex items-center gap-2">
            <input id={fileInputId} type="file" accept="image/*" className="hidden" onChange={async (ev) => {
              const f = (ev.target as HTMLInputElement).files?.[0];
              if (!f) return;
              try {
                const readAsDataUrl = (file: File) => new Promise<string>((res, rej) => {
                  const r = new FileReader();
                  r.onload = () => res(r.result as string);
                  r.onerror = rej;
                  r.readAsDataURL(file);
                });

                const dataUrl = await readAsDataUrl(f);
                const compressed = await compressImageToJpeg(dataUrl);
                const originalExt = getExtensionFromDataUrl(dataUrl);
                const originalHash = await hashContent(dataUrl);
                const compressedHash = await hashContent(compressed.base64);
                const originalPath = `${ASSETS_ORIGINAL_DIR}/${originalHash}.${originalExt}`;
                const newPath = `${ASSETS_COMPRESSED_DIR}/${compressedHash}.jpg`;

                // If original is svg, convert to png for preview
                let previewOriginal = dataUrl;
                if (dataUrl.startsWith("data:image/svg+xml")) {
                  previewOriginal = await convertSvgToPng(dataUrl);
                }

                const { store } = await import("@/lib/store");
                store.assetCache.set(newPath, compressed.dataUrl);
                store.assetCache.set(originalPath, previewOriginal);

                updateAttributes({ src: compressed.dataUrl, originalSrc: dataUrl, filePath: newPath, originalFilePath: originalPath });
                setResolvedSrc(compressed.dataUrl);
                setIsLoading(false);
                events.emit(EventNames.SHOW_NOTIFICATION, { message: 'Image replaced', type: 'success' });
              } catch (err) {
                console.error('Replace image failed', err);
                events.emit(EventNames.SHOW_NOTIFICATION, { message: 'Failed to replace image', type: 'error' });
              } finally {
                (ev.target as HTMLInputElement).value = '';
              }
            }} />
            <label htmlFor={fileInputId} className="flex items-center gap-2 cursor-pointer p-1 rounded-md hover:bg-nb-surface-low">
              <Upload size={12} className="text-nb-on-surface-variant" />
              <span className="text-xs text-nb-on-surface-variant">Replace</span>
            </label>
          </div>
        </div>

        <div className="relative flex justify-center min-h-30 bg-nb-surface-low/10">
          {isLoading || !resolvedSrc || !resolvedSrc.startsWith('data:') ? (
            <div
              style={{ width: node.attrs.width ?? "100%" }}
              className="h-44 rounded-lg bg-nb-surface-low animate-pulse flex flex-col items-center justify-center gap-2 text-nb-on-surface-variant/40"
            >
              <Loader2 size={20} className="animate-spin text-nb-primary/50" />
              <span className="text-[10px] font-bold tracking-wider uppercase">Loading image...</span>
            </div>
          ) : (
            <Image
              src={resolvedSrc}
              alt={node.attrs.caption || node.attrs.alt || ""}
              width={0}
              height={0}
              sizes="100vw"
              style={{ width: node.attrs.width ?? "100%", height: "auto" }}
              className="block select-none pointer-events-none"
              draggable={false}
              loading="lazy"
              unoptimized
            />
          )}
          <div
            contentEditable={false}
            onMouseDown={startResize}
            className="absolute -bottom-1 left-0 right-0 h-4 cursor-ns-resize flex items-center justify-center group/resize z-50"
            aria-hidden="true"
          >
            <div className={`w-16 h-1 bg-nb-primary rounded-full transition-opacity ${selected ? 'opacity-100' : 'opacity-30 group-hover/resize:opacity-100'}`} />
          </div>
        </div>

        <div contentEditable={false} className="bg-nb-surface-low/30 border-t border-nb-outline-variant/10 px-4 py-2 flex items-start justify-center gap-2 group/caption">
          <NodeViewInput
            editor={editor}
            value={node.attrs.caption || ""}
            onUpdate={(caption) => updateAttributes({ caption })}
            placeholder="Add figure description..."
            required
            missingMessage="Caption is required for this image."
            multiline
            className="w-full bg-transparent border-none outline-none text-center text-xs font-medium italic text-nb-on-surface/50 group-hover/caption:text-nb-on-surface focus:text-nb-on-surface focus:opacity-100 transition-all leading-relaxed"
          />
          <GenerateButton
            label="Generate caption"
            disabled={!resolvedSrc?.startsWith("data:")}
            run={() => generateResourceCaption(resource())}
            onResult={(caption) => updateAttributes({ caption })}
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
        keepOnSplit: true,
        parseHTML: element => element.getAttribute('data-id'),
        renderHTML: attributes => (attributes.id ? { 'data-id': attributes.id } : {}),
      },
      alt: { default: "" },
      title: { default: "" },
      filePath: { default: null },
      originalFilePath: { default: null },
      caption: { default: "" },
      width: { default: "100%" },
    };
  },
  draggable: true,
  addNodeView() {
    return ReactNodeViewRenderer((props) => <ImageNodeView {...props as NodeViewProps} dbName={(this.options as unknown as { dbName: string }).dbName} />);
  },
});
