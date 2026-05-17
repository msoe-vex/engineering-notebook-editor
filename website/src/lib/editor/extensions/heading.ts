import { Heading } from "@tiptap/extension-heading";
import { generateUUID } from "@/lib/utils";

type HeadingAttrs = { id?: string } & Record<string, unknown>;

/**
 * Custom Heading extension that auto-generates UUIDs for tracking headers as resources.
 * All headings will have an id in attrs to enable reference linking and resource tracking.
 */
export const CustomHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-id"),
        renderHTML: (attributes) => {
          if (!attributes.id) return {};
          return { "data-id": attributes.id };
        },
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setHeading:
        (attributes) =>
        ({ commands }) => {
          // Auto-generate ID if not present
          const attrs = {
            ...attributes,
            id: (attributes as HeadingAttrs).id || generateUUID(),
          };
          return commands.setNode(this.name, attrs);
        },
      toggleHeading:
        (attributes) =>
        ({ commands }) => {
          // Auto-generate ID if not present
          const attrs = {
            ...attributes,
            id: (attributes as HeadingAttrs).id || generateUUID(),
          };
          return commands.toggleNode(this.name, "paragraph", attrs);
        },
    };
  },
});
