"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import type { TiptapEditor } from "@/lib/types";
import { cloudApi, collabWsUrl } from "@/lib/cloud/api";
import { analyzeEntryContent } from "@/lib/cloud/entryQuality";
import RichTextArea from "@/components/editor/RichTextArea";
import { NotebookFormatToolbar, insertBlock } from "@/components/editor/NotebookFormatToolbar";
import { Skeleton, SkeletonLines } from "@/components/ui";
import type { TipTapNode } from "@/lib/notebook/metadata";
import type { ProjectPhase } from "@engineering-notebook/shared";
import { showNotification } from "@/components/overlays/Notification";
import { getFirebaseAuth, getDevToken } from "@/lib/cloud/firebase";
import { compressImageToJpeg, convertSvgToPng } from "@/lib/utils";
import { workspaceState } from "@/lib/cloud/workspaceState";
import {
  patchEditorChrome,
  type CollabConnectionStatus,
} from "@/lib/cloud/editorChromeStore";
import { useNotebookWorkspace } from "./NotebookWorkspaceContext";

function mapCollabStatus(raw: string): CollabConnectionStatus {
  if (raw === "connected") return "connected";
  if (raw === "connecting") return "connecting";
  return "offline";
}

type PresenceUser = { clientId: number; name: string; color: string };

const PRESENCE_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#db2777",
];

function colorForId(id: string | number): string {
  const s = String(id);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PRESENCE_COLORS[h % PRESENCE_COLORS.length];
}

type Props = {
  documentName: string;
  entryId: string;
  getToken: () => Promise<string | null>;
  /** Fired when TipTap JSON changes (for live LaTeX preview). */
  onDocChange?: (doc: TipTapNode) => void;
};

/**
 * Cloud entry body: full notebook TipTap schema + Hocuspocus/Yjs sync + format toolbar.
 * Metadata (title/authors/…) stays on the entry route / Firestore via Core PATCH.
 */
export function CollaborativeEntryEditor({
  documentName,
  entryId,
  getToken,
  onDocChange,
}: Props) {
  const { orgId, notebookId, entries, notebookSummary, isArchived } = useNotebookWorkspace();
  const [status, setStatus] = useState("connecting");
  const [ydoc] = useState(() => new Y.Doc());
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  /** TipTap must not bind until Yjs has synced — otherwise an empty local fragment races the load. */
  const [synced, setSynced] = useState(false);
  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const editorRef = useRef<TiptapEditor | null>(null);
  editorRef.current = editor;
  const lastTipTapMirrorRef = useRef("");

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

      const authUser = getFirebaseAuth().currentUser;
      const localName =
        authUser?.displayName ||
        authUser?.email ||
        getDevToken() ||
        "Editor";
      const localColor = colorForId(authUser?.uid || localName);

      setSynced(false);
      p = new HocuspocusProvider({
        url: collabWsUrl(),
        name: documentName,
        document: ydoc,
        token,
        onStatus: ({ status: s }) => {
          setStatus(s);
          patchEditorChrome({ connection: mapCollabStatus(s) });
        },
        onSynced: ({ state }) => {
          if (cancelled) return;
          setSynced(Boolean(state));
        },
        onAuthenticationFailed: ({ reason }) => {
          console.warn("Collab auth failed", reason);
          setStatus("disconnected");
          patchEditorChrome({ connection: "offline" });
        },
        onAwarenessChange: ({ states }) => {
          const next: PresenceUser[] = [];
          for (const state of states) {
            const user = (state as { user?: { name?: string; color?: string }; clientId?: number })
              .user;
            const clientId = Number(
              (state as { clientId?: number }).clientId ?? 0
            );
            if (!user?.name) continue;
            // Skip self when provider marks local client
            if ((state as { clientId?: number }).clientId === p?.awareness?.clientID) {
              continue;
            }
            next.push({
              clientId,
              name: user.name,
              color: user.color || colorForId(clientId),
            });
          }
          patchEditorChrome({ peers: next });
        },
      });
      patchEditorChrome({
        connection: "connecting",
        onReconnect: () => {
          const cur = providerRef.current;
          if (!cur) return;
          try {
            void cur.configuration.websocketProvider.connect();
          } catch (err) {
            console.warn("Collab reconnect failed", err);
          }
        },
      });

      p.setAwarenessField("user", { name: localName, color: localColor });

      if (cancelled) {
        p.destroy();
        return;
      }
      providerRef.current = p;
      setProvider(p);
      // Provider may already be synced (cached room) before onSynced fires.
      if (p.synced) setSynced(true);
    })();

    return () => {
      cancelled = true;
      providerRef.current = null;
      p?.destroy();
      setProvider(null);
      setSynced(false);
      setEditor(null);
      lastTipTapMirrorRef.current = "";
      patchEditorChrome({ connection: null, peers: [], onReconnect: null });
    };
  }, [documentName, ydoc]);

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

  const onDocChangeRef = useRef(onDocChange);
  onDocChangeRef.current = onDocChange;

  useEffect(() => {
    if (!editor) return;
    const emit = () => {
      const doc = editor.getJSON() as TipTapNode;
      onDocChangeRef.current?.(doc);
    };
    emit();
    editor.on("update", emit);
    return () => {
      editor.off("update", emit);
    };
  }, [editor]);

  // Debounced quality pass + TipTap JSON mirror (compile / title-gen / GET content).
  // Collab flush persists Yjs only; TipTap GCS stays a create-time stub unless we PUT here.
  useEffect(() => {
    if (!editor || !synced) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = () => {
      const meta = entriesRef.current[entryId];
      if (!meta) return;
      try {
        const doc = editor.getJSON() as TipTapNode;
        const tipTapPayload = JSON.stringify(doc);
        if (tipTapPayload !== lastTipTapMirrorRef.current) {
          lastTipTapMirrorRef.current = tipTapPayload;
          void cloudApi
            .putEntryContent(orgId, notebookId, entryId, doc)
            .catch((err) => console.warn("Entry TipTap mirror failed", err));
        }
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
          // SSE entry.upserted updates the shell — do not refresh() (full reload loop).
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
  }, [editor, synced, entryId, metaFingerprint, orgId, notebookId]);

  const linkAssetToEntry = useCallback(
    async (assetId: string) => {
      const existing = entries[entryId]?.assetIds ?? [];
      if (existing.includes(assetId)) return;
      await cloudApi.patchEntry(orgId, notebookId, entryId, {
        assetIds: [...existing, assetId],
      });
      // Presence of assetIds arrives via SSE entry.upserted.
    },
    [entries, entryId, orgId, notebookId]
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
          let dataUrl = reader.result as string;
          try {
            if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
              dataUrl = await convertSvgToPng(dataUrl);
            }
            const compressed = await compressImageToJpeg(dataUrl, 1920, 0.8).catch(() => ({
              dataUrl,
            }));
            const preview = compressed.dataUrl;
            const comma = preview.indexOf(",");
            const header = preview.slice(0, comma);
            const contentType =
              /data:([^;]+)/.exec(header)?.[1] || "image/jpeg";
            const bin = atob(preview.slice(comma + 1));
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const assetId = await uploadImageBytes(bytes, contentType, preview);
            const cacheKey = `cloud:${assetId}`;
            insertBlock(editor, {
              type: "image",
              attrs: {
                id: assetId,
                src: preview,
                alt: "",
                title: "",
                filePath: cacheKey,
                originalFilePath: cacheKey,
              },
            });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Image upload failed.";
            console.warn("Cloud asset upload failed; image not inserted", err);
            showNotification(message, "error");
          }
        })();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [editor, uploadImageBytes]);

  if (!provider || !synced) {
    return (
      <div
        className="flex h-full min-h-0 flex-col text-nb-on-surface"
        aria-busy
        aria-label={
          provider && !synced
            ? "Syncing entry content"
            : "Connecting to collaboration"
        }
      >
        <div className="shrink-0 border-b border-nb-outline-variant/20 bg-nb-surface px-3 py-2">
          <Skeleton className="h-8 w-full max-w-xl" />
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-hidden p-4 md:p-8">
          <Skeleton className="h-5 w-1/3 max-w-xs" />
          <SkeletonLines lines={10} className="max-w-2xl" />
          <span className="sr-only">
            Connecting to collaboration… ({status}
            {provider && !synced ? ", syncing" : ""})
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-nb-on-surface">
      {editor && !isArchived && (
        <div className="z-20 shrink-0 border-b border-nb-outline-variant/20 bg-nb-surface">
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
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        <RichTextArea
          key={documentName}
          filename={entryId}
          entryId={entryId}
          editable={!isArchived}
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
                const message =
                  err instanceof Error ? err.message : "Image upload failed.";
                console.warn("Cloud asset upload failed for drag/drop image", err);
                showNotification(message, "error");
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
