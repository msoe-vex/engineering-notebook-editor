import Link from "@tiptap/extension-link";

export const CustomLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      resourceId: {
        default: null,
        parseHTML: element => element.getAttribute('data-resource-id'),
        renderHTML: attributes => {
          if (!attributes.resourceId) return {};
          return { 'data-resource-id': attributes.resourceId };
        },
      },
      entryId: {
        default: null,
        parseHTML: element => element.getAttribute('data-entry-id'),
        renderHTML: attributes => {
          if (!attributes.entryId) return {};
          return { 'data-entry-id': attributes.entryId };
        },
      },
    };
  },
  addProseMirrorPlugins() {
    return this.parent?.() || [];
  },
});
