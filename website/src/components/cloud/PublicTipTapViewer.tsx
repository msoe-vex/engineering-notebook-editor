"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { useEffect } from "react";

/** Read-only TipTap render for public notebook entries (no collab / upload). */
export function PublicTipTapViewer({ doc }: { doc: JSONContent | Record<string, unknown> | null }) {
  const content = (doc || { type: "doc", content: [{ type: "paragraph" }] }) as JSONContent;
  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Underline,
    ],
    content,
    editorProps: {
      attributes: {
        class:
          "prose prose-nb max-w-none focus:outline-none text-nb-on-surface [&_a]:text-nb-primary",
      },
    },
  });

  useEffect(() => {
    if (!editor || !doc) return;
    editor.commands.setContent(doc as JSONContent);
  }, [editor, doc]);

  if (!editor) return null;
  return <EditorContent editor={editor} />;
}
