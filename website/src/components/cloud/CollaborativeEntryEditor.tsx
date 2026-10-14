"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { collabWsUrl } from "@/lib/cloud/api";

type Props = {
  documentName: string;
  entryTitle: string;
  getToken: () => Promise<string | null>;
};

export function CollaborativeEntryEditor({ documentName, entryTitle, getToken }: Props) {
  const [status, setStatus] = useState("connecting");
  const [ydoc] = useState(() => new Y.Doc());
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);

  useEffect(() => {
    let cancelled = false;
    let p: HocuspocusProvider | null = null;

    void (async () => {
      const token = (await getToken()) || "";
      if (cancelled) return;
      p = new HocuspocusProvider({
        url: collabWsUrl(),
        name: documentName,
        document: ydoc,
        token,
        onStatus: ({ status: s }) => setStatus(s),
      });
      setProvider(p);
    })();

    return () => {
      cancelled = true;
      p?.destroy();
      setProvider(null);
    };
  }, [documentName, getToken, ydoc]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          // TipTap v3: disable built-in undo when using Yjs collaboration
          undoRedo: false,
        }),
        Collaboration.configure({
          document: ydoc,
          field: "default",
        }),
      ],
      editorProps: {
        attributes: {
          class:
            "prose prose-neutral prose-sm max-w-none min-h-[320px] focus:outline-none text-neutral-900",
        },
      },
      immediatelyRender: false,
    },
    [ydoc, provider]
  );

  useEffect(() => {
    const meta = ydoc.getMap("meta");
    if (!meta.get("title")) meta.set("title", entryTitle);
  }, [ydoc, entryTitle]);

  return (
    <div className="text-neutral-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-medium text-neutral-900">{entryTitle}</h2>
        <span className="text-xs uppercase tracking-wide text-neutral-500">{status}</span>
      </div>
      <div className="rounded border border-neutral-200 bg-white p-3 text-neutral-900">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
