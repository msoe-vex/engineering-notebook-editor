import { Extension } from "@tiptap/core";
import type { TiptapEditor } from "@/lib/types";

export const NOTEBOOK_TITLE_ATTR = "notebookTitle";

/**
 * Apply a doc-attribute update after the current React turn so TipTap's
 * flushSync never runs inside a lifecycle (useEffect / render).
 */
export function setNotebookTitle(
  editor: TiptapEditor | null,
  title: string,
  options?: { addToHistory?: boolean },
) {
  if (!editor || editor.isDestroyed) return;
  const addToHistory = options?.addToHistory !== false;
  queueMicrotask(() => {
    if (editor.isDestroyed) return;
    const current = editor.state.doc.attrs[NOTEBOOK_TITLE_ATTR];
    if (current === title) return;
    editor.commands.command(({ tr }) => {
      if (!addToHistory) tr.setMeta("addToHistory", false);
      tr.setDocAttribute(NOTEBOOK_TITLE_ATTR, title);
      return true;
    });
  });
}

export const NotebookDocAttrs = Extension.create({
  name: "notebookDocAttrs",
  addGlobalAttributes() {
    return [
      {
        types: ["doc"],
        attributes: {
          [NOTEBOOK_TITLE_ATTR]: {
            default: "",
            parseHTML: (element) => element.getAttribute("data-notebook-title") || "",
            renderHTML: (attributes) => {
              if (!attributes[NOTEBOOK_TITLE_ATTR]) return {};
              return { "data-notebook-title": attributes[NOTEBOOK_TITLE_ATTR] };
            },
          },
        },
      },
    ];
  },
});
