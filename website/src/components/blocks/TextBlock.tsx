"use client";

import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { useEffect } from 'react';

export default function TextBlock({ content, onChange }: { content: string, onChange: (content: string) => void }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] }
      }),
    ],
    content: content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
        attributes: {
            class: 'prose dark:prose-invert max-w-none focus:outline-none min-h-[50px] p-2',
        },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  return (
    <div className="relative [&_h1]:text-2xl [&_h1]:font-black [&_h1]:border-b [&_h1]:dark:border-zinc-800 [&_h1]:pb-1 [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-4">
      <EditorContent editor={editor} />
    </div>
  );
}
