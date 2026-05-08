import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Extension } from "@tiptap/react";
import Prism from "prismjs";
import { store } from "@/lib/store";

// Ensure common languages are loaded
import "prismjs/components/prism-latex";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-go";
import "prismjs/components/prism-java";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-typescript";

// Fix Prism LaTeX highlighting for escaped percents
if (Prism.languages.latex) {
  const { comment, ...rest } = Prism.languages.latex;
  Prism.languages.latex = { ...rest, comment };
  Prism.languages.tex = Prism.languages.latex;
  Prism.languages.context = Prism.languages.latex;
}

function getPrismDecorations(doc: import("@tiptap/pm/model").Node) {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name === 'codeBlock' || node.type.name === 'rawLatex') {
      const language = node.attrs.language || (node.type.name === 'rawLatex' ? 'latex' : 'plaintext');
      const text = node.textContent;
      const prismLang = Prism.languages[language] || Prism.languages.markup || {};

      const tokens = Prism.tokenize(text, prismLang);

      let currentPos = pos + 1;

      const addDecorations = (tokenList: (string | Prism.Token)[]) => {
        tokenList.forEach(token => {
          if (typeof token === 'string') {
            currentPos += token.length;
          } else {
            const length = Array.isArray(token.content)
              ? (token.content as (string | Prism.Token)[]).reduce((acc: number, t) => acc + (typeof t === 'string' ? t.length : (t instanceof Prism.Token ? t.length : 0)), 0)
              : token.length;

            decorations.push(Decoration.inline(currentPos, currentPos + length, {
              class: `token ${token.type} ${token.alias || ''}`.trim()
            }));

            if (Array.isArray(token.content)) {
              addDecorations(token.content as (string | Prism.Token)[]);
            } else {
              currentPos += length;
            }
          }
        });
      };

      addDecorations(tokens);
    }
    return true;
  });

  return DecorationSet.create(doc, decorations);
}

export const PrismHighlightPlugin = new Plugin({
  key: new PluginKey('prism-highlight'),
  state: {
    init: (_, { doc }) => getPrismDecorations(doc),
    apply: (tr, set) => {
      if (tr.docChanged) {
        return getPrismDecorations(tr.doc);
      }
      return set.map(tr.mapping, tr.doc);
    },
  },
  props: {
    decorations(state) {
      return this.getState(state);
    },
  },
});

export const PrismHighlightExtension = Extension.create({
  name: 'prismHighlight',
  addProseMirrorPlugins() {
    return [PrismHighlightPlugin];
  },
});

export function getIntegrityDecorations(doc: import("@tiptap/pm/model").Node) {
  const decorations: Decoration[] = [];
  const metadata = store.metadata;
  if (!metadata?.entries) return DecorationSet.create(doc, []);

  const validIds = new Set<string>();
  for (const entry of Object.values(metadata.entries)) {
    validIds.add(entry.id);
    if (entry.resources) {
      for (const resId of Object.keys(entry.resources)) {
        validIds.add(resId);
      }
    }
  }

  doc.descendants((node, pos) => {
    if (node.marks) {
      for (const mark of node.marks) {
        if (mark.type.name === 'link') {
          const { resourceId, href } = mark.attrs || {};
          const targetId = resourceId || (href?.startsWith('#') ? href.slice(1) : null);

          if (targetId && !validIds.has(targetId)) {
            decorations.push(Decoration.inline(pos, pos + node.nodeSize, {
              class: 'nb-broken-link',
              title: `Broken reference to ${targetId}`
            }));
          }
        }
      }
    }
  });

  return DecorationSet.create(doc, decorations);
}

export const IntegrityPlugin = () => new Plugin({
  key: new PluginKey('link-integrity'),
  state: {
    init: (_, { doc }) => getIntegrityDecorations(doc),
    apply: (tr) => {
      // Re-calculate on every transaction if metadata might have changed
      // or if the document changed. tr.docChanged is standard, but we also
      // want to catch store updates.
      return getIntegrityDecorations(tr.doc);
    },
  },
  props: {
    decorations(state) {
      return this.getState(state);
    },
  },
});
