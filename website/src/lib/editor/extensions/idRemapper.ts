import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Slice, Fragment } from "@tiptap/pm/model";
import { EditorView } from "@tiptap/pm/view";
import { remapContentIds } from "@/lib/metadata";

interface InternalEditorView extends EditorView {
  isDraggingFromHere?: boolean;
  isInternalMove?: boolean;
}

export const IdRemapper = Extension.create({
  name: 'idRemapper',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('idRemapper'),
        props: {
          handleDOMEvents: {
            dragstart: (view) => {
              (view as InternalEditorView).isDraggingFromHere = true;
              return false;
            },
            dragend: (view) => {
              (view as InternalEditorView).isDraggingFromHere = false;
              (view as InternalEditorView).isInternalMove = false;
              return false;
            },
            drop: (view, event) => {
              // This runs before transformPasted
              const v = view as InternalEditorView;
              v.isInternalMove = v.isDraggingFromHere && !event.ctrlKey && !event.altKey && !event.metaKey;
              return false;
            }
          },
          transformPasted: (slice: Slice): Slice => {
            if ((this.editor.view as InternalEditorView).isInternalMove) {
              return slice;
            }
            const json = slice.content.toJSON();
            const remapped = remapContentIds(json);
            try {
              const fragment = Fragment.fromJSON(this.editor.schema, remapped.doc);
              return new Slice(fragment, slice.openStart, slice.openEnd);
            } catch (e) {
              console.error("Failed to remap pasted IDs", e);
              return slice;
            }
          }
        }
      })
    ]
  }
});
