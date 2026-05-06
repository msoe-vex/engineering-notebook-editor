export interface NodeViewProps {
  node: import("@tiptap/pm/model").Node;
  selected: boolean;
  updateAttributes: (attrs: Record<string, unknown>) => void;
  deleteNode: () => void;
  editor: import("@tiptap/react").Editor;
  getPos: () => number | undefined;
}
