import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Slice, Fragment } from "@tiptap/pm/model";
import { remapContentIds } from "@/lib/metadata";

export const IdRemapper = Extension.create({
  name: 'idRemapper',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('idRemapper'),
        props: {
          transformPasted: (slice: Slice): Slice => {
            const json = slice.content.toJSON();
            const remapped = remapContentIds(json);
            try {
              const fragment = Fragment.fromJSON(this.editor.schema, remapped);
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
