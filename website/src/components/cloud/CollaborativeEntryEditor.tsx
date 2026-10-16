"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import type { TiptapEditor } from "@/lib/types";
import { cloudApi, collabWsUrl } from "@/lib/cloud/api";
import { analyzeEntryContent } from "@/lib/cloud/entryQuality";
import RichTextArea from "@/components/editor/RichTextArea";
import { NotebookFormatToolbar, insertBlock } from "@/components/editor/NotebookFormatToolbar";
import type { TipTapNode } from "@/lib/notebook/metadata";
import type { ProjectPhase } from "@engineering-notebook/shared";
import { workspaceState } from "@/lib/cloud/workspaceState";
import { useNotebookWorkspace } from "./NotebookWorkspaceContext";

type Props = {
  documentName: string;
  entryTitle: string;
  entryId: string;
  getToken: () => Promise<string | null>;
};

/**
 * Cloud entry body: full notebook TipTap schema + Hocuspocus/Yjs sync + format toolbar.
 * Metadata (title/authors/…) stays on the entry route / Firestore for now.
 */
export function CollaborativeEntryEditor({
  documentName,
  entryTitle,
  entryId,
  getToken,
}: Props) {
  const { orgId, notebookId, entries, notebookSummary, refresh } = useNotebookWorkspace();
  const [status, setStatus] = useState("connecting");
  const [ydoc] = useState(() => new Y.Doc());
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const editorRef = useRef<TiptapEditor | null>(null);
  editorRef.current = editor;

  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [textColorPos, setTextColorPos] = useState({ top: 0, left: 0 });
  const [highlightPos, setHighlightPos] = useState({ top: 0, left: 0 });
  const [headingPos, setHeadingPos] = useState({ top: 0, left: 0 });
  const [gridPos, setGridPos] = useState({ top: 0, left: 0 });
  const [showTableGrid, setShowTableGrid] = useState(false);
  const toggleLinkFn = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    let p: HocuspocusProvider | null = null;

    void (async () => {
      const token = (await getTokenRef.current()) || "";
      if (cancelled) return;

      p = new HocuspocusProvider({
        url: collabWsUrl(),
        name: documentName,
        document: ydoc,
        token,
        onStatus: ({ status: s }) => setStatus(s),
        onAuthenticationFailed: ({ reason }) => {
          console.warn("Collab auth failed", reason);
          setStatus("disconnected");
        },
      });

      if (cancelled) {
        p.destroy();
        return;
      }
      providerRef.current = p;
      setProvider(p);
    })();

    return () => {
      cancelled = true;
      providerRef.current = null;
      p?.destroy();
      setProvider(null);
      setEditor(null);
    };
  }, [documentName, ydoc]);

  useEffect(() => {
    const meta = ydoc.getMap("meta");
    if (!meta.get("title")) meta.set("title", entryTitle);
  }, [ydoc, entryTitle]);

  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const phasesRef = useRef(notebookSummary?.phases);
  phasesRef.current = notebookSummary?.phases;
  const lastQualityRef = useRef("");
  const metaFingerprint = [
    entries[entryId]?.title,
    entries[entryId]?.date,
    entries[entryId]?.phase,
    entries[entryId]?.isTemplate,
    (entries[entryId]?.authors || []).join("\0"),
  ].join("|");

  // Debounced quality pass: resources / references / isValid → Firestore entry meta.
  useEffect(() => {
    if (!editor) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = () => {
      const meta = entriesRef.current[entryId];
      if (!meta) return;
      try {
        const doc = editor.getJSON() as TipTapNode;
        const result = analyzeEntryContent(
          entryId,
          meta,
          doc,
          (phasesRef.current as Record<string, ProjectPhase>) || {},
          Object.keys(entriesRef.current)
        );
        const payload = JSON.stringify({
          resources: result.resources,
          references: result.references,
          isValid: result.isValid,
          validationErrors: result.validationErrors,
        });
        if (payload === lastQualityRef.current) return;
        lastQualityRef.current = payload;
        void cloudApi
          .patchEntry(orgId, notebookId, entryId, {
            resources: result.resources,
            references: result.references,
            isValid: result.isValid,
            validationErrors: result.validationErrors,
          })
          .then(() => refresh())
          .catch((err) => console.warn("Entry quality patch failed", err));
      } catch (err) {
        console.warn("Entry quality analysis failed", err);
      }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, 1200);
    };

    schedule();
    editor.on("update", schedule);
    return () => {
      if (timer) clearTimeout(timer);
      editor.off("update", schedule);
    };
  }, [editor, entryId, metaFingerprint, orgId, notebookId, refresh]);

  const reconnect = useCallback(() => {
    const p = providerRef.current;
    if (!p) return;
    try {
      void p.configuration.websocketProvider.connect();
    } catch (err) {
      console.warn("Collab reconnect failed", err);
    }
  }, []);

  const linkAssetToEntry = useCallback(
    async (assetId: string) => {
      const existing = entries[entryId]?.assetIds ?? [];
      if (existing.includes(assetId)) return;
      await cloudApi.patchEntry(orgId, notebookId, entryId, {
        assetIds: [...existing, assetId],
      });
      refresh();
    },
    [entries, entryId, orgId, notebookId, refresh]
  );

  const uploadImageBytes = useCallback(
    async (
      bytes: Blob | Uint8Array,
      contentType: string,
      previewDataUrl: string
    ): Promise<string> => {
      const { asset } = await cloudApi.createAsset(orgId, notebookId, {
        contentType,
        byteSize: bytes instanceof Blob ? bytes.size : bytes.byteLength,
        usedByEntryId: entryId,
      });
      await cloudApi.uploadAssetContent(orgId, notebookId, asset.id, bytes, contentType);
      const cacheKey = `cloud:${asset.id}`;
      workspaceState.assetCache.set(cacheKey, previewDataUrl);
      await linkAssetToEntry(asset.id);
      return asset.id;
    },
    [orgId, notebookId, entryId, linkAssetToEntry]
  );

  const remapatImageNode = useCallback((oldPath: string, assetId: string, previewDataUrl: string) => {
    const ed = editorRef.current;
    if (!ed) return;
    const cacheKey = `cloud:${assetId}`;
    workspaceState.assetCache.set(cacheKey, previewDataUrl);
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name !== "image") return;
      if (node.attrs.filePath !== oldPath && node.attrs.id !== oldPath) return;
      ed.chain()
        .command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            id: assetId,
            filePath: cacheKey,
            originalFilePath: cacheKey,
            src: previewDataUrl,
          });
          return true;
        })
        .run();
    });
  }, []);

  const insertImage = useCallback(() => {
    if (!editor) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        void (async () => {
          const dataUrl = reader.result as string;
          const contentType = file.type || "application/octet-stream";
          try {
            const assetId = await uploadImageBytes(file, contentType, dataUrl);
            const cacheKey = `cloud:${assetId}`;
            insertBlock(editor, {
              type: "image",
              attrs: {
                id: assetId,
                src: dataUrl,
                alt: "",
                title: "",
                filePath: cacheKey,
                originalFilePath: cacheKey,
              },
            });
          } catch (err) {
            console.warn("Cloud asset upload failed; image not inserted", err);
          }
        })();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [editor, uploadImageBytes]);

  if (!provider) {
    return (
      <p className="text-sm text-nb-on-surface-variant">
        Connecting to collaboration… ({status})
      </p>
    );
  }

  const statusLabel =
    status === "connected" ? "Live" : status === "connecting" ? "Connecting…" : "Offline";

  return (
    <div className="flex flex-col gap-2 text-nb-on-surface">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-nb px-2 py-0.5 text-nb-caption font-semibold ${
            status === "connected"
              ? "bg-nb-success/10 text-nb-success"
              : "bg-nb-warning/10 text-nb-warning"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              status === "connected" ? "bg-nb-success" : "bg-nb-warning"
            }`}
          />
          {statusLabel}
        </span>
        {status !== "connected" && (
          <button
            type="button"
            className="text-nb-label font-semibold text-nb-primary hover:underline"
            onClick={reconnect}
          >
            Reconnect
          </button>
        )}
      </div>
      {editor && (
        <div className="sticky top-0 z-10 overflow-hidden rounded-nb-xl border border-nb-outline-variant/30 bg-nb-surface shadow-nb-sm">
          <NotebookFormatToolbar
            editor={editor}
            activeMenu={activeMenu}
            setActiveMenu={setActiveMenu}
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
            insertImage={insertImage}
            toggleLinkFn={toggleLinkFn}
          />
        </div>
      )}
      <div className="rounded-xl border border-nb-outline-variant/30 bg-nb-surface">
        <RichTextArea
          key={documentName}
          filename={entryId}
          entryId={entryId}
          collaborationDoc={ydoc}
          onEditorInit={setEditor}
          onImageUpload={(path, _base64) => {
            void (async () => {
              try {
                const dataUrl = workspaceState.assetCache.get(path);
                if (!dataUrl?.startsWith("data:")) return;
                const comma = dataUrl.indexOf(",");
                const header = dataUrl.slice(0, comma);
                const contentType =
                  /data:([^;]+)/.exec(header)?.[1] || "application/octet-stream";
                const bin = atob(dataUrl.slice(comma + 1));
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                const assetId = await uploadImageBytes(bytes, contentType, dataUrl);
                remapatImageNode(path, assetId, dataUrl);
              } catch (err) {
                console.warn("Cloud asset upload failed for drag/drop image", err);
              }
            })();
          }}
          onToggleLink={(fn) => {
            toggleLinkFn.current = fn;
          }}
        />
      </div>
    </div>
  );
}
