import { Mark, mergeAttributes, markInputRule } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import katex from "katex";
import "katex/dist/katex.min.css";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    inlineMath: {
      setInlineMath: () => ReturnType;
      toggleInlineMath: () => ReturnType;
      unsetInlineMath: () => ReturnType;
    };
  }
}

export const InlineMath = Mark.create({
  name: "inlineMath",

  addOptions() {
    return {
      HTMLAttributes: {
        class: "nb-inline-math",
      },
    };
  },

  parseHTML() {
    return [{ tag: "span.nb-inline-math" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setInlineMath: () => ({ commands }) => {
        return commands.setMark(this.name);
      },
      toggleInlineMath: () => ({ commands }) => {
        return commands.toggleMark(this.name);
      },
      unsetInlineMath: () => ({ commands }) => {
        return commands.unsetMark(this.name);
      },
    };
  },

  addInputRules() {
    return [
      markInputRule({
        find: /\$([^$]+)\$$/,
        type: this.type,
      }),
    ];
  },

  addProseMirrorPlugins() {
    const { editor } = this;

    return [
      new Plugin({
        key: new PluginKey("inlineMathPreview"),
        props: {
          decorations(state) {
            const { doc, selection } = state;
            const decorations: Decoration[] = [];

            doc.descendants((node, pos) => {
              if (node.isText) {
                const marks = node.marks.filter(m => m.type.name === "inlineMath");
                if (marks.length > 0) {
                  // Check if cursor is inside this text node
                  const isFocused = selection.from >= pos && selection.to <= pos + node.nodeSize;

                  if (!isFocused) {
                    // Create a decoration that renders KaTeX
                    decorations.push(
                      Decoration.widget(pos, () => {
                        const span = document.createElement("span");
                        span.className = "nb-inline-math-preview cursor-text";
                        try {
                          katex.render(node.text || "", span, {
                            throwOnError: false,
                            displayMode: false,
                          });
                        } catch {
                          span.textContent = node.text || "";
                        }
                        return span;
                      }, { side: -1 })
                    );
                    
                    // Add a decoration to hide the original text
                    decorations.push(
                      Decoration.inline(pos, pos + node.nodeSize, {
                        class: "nb-inline-math-hidden",
                      })
                    );
                  }
                }
              }
            });

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});
