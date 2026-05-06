import { ASSETS_DIR, DATA_DIR } from "./constants";
import { TipTapNode } from "./metadata";

export const escapeLaTeX = (text: string) =>
  text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\^/g, "\\^{}")
    .replace(/~/g, "\\~{}");


export const mapLanguageToLatex = (lang: string): string => {
  const mapping: Record<string, string> = {
    "cpp": "C++",
    "c": "C",
    "python": "Python",
    "javascript": "JavaScript",
    "typescript": "JavaScript",
    "java": "Java",
    "bash": "bash",
    "sql": "SQL",
    "rust": "Rust",
    "go": "Go",
    "csharp": "[Sharp]C",
    "plaintext": "{}",
  };
  return mapping[lang] || lang;
};

export const convertNodeToLatex = (node: TipTapNode): string => {
  if (!node) return "";
  const children = () => (node.content || []).map(convertNodeToLatex).join("");

  switch (node.type) {
    case "doc":
      return children();

    case "text": {
      let t = escapeLaTeX(node.text ?? "");
      for (const mark of (node.marks ?? [])) {
        if (mark.type === "bold") t = `\\textbf{${t}}`;
        if (mark.type === "italic") t = `\\textit{${t}}`;
        if (mark.type === "code") t = `\\texttt{${t}}`;
        if (mark.type === "underline") t = `\\underline{${t}}`;
        if (mark.type === "link") {
          const { href, resourceId } = mark.attrs ?? {};
          if (resourceId) {
            t = `\\hyperref[${resourceId}]{${t}}`;
          } else if (href) {
            t = `\\href{${href}}{${t}}`;
          }
        }
      }
      return t;
    }

    case "hardBreak":
      return "\\\\\n";

    case "paragraph": {
      const inner = children();
      return inner.trim() ? `${inner}\n\n` : "\n";
    }

    case "heading": {
      const level = node.attrs?.level ?? 2;
      const cmd = level === 1 ? "subsection*" : "subsubsection*";
      return `\\${cmd}{${children()}}\n\n`;
    }

    case "bulletList":
      return `\\begin{itemize}\n${children()}\\end{itemize}\n\n`;

    case "orderedList":
      return `\\begin{enumerate}\n${children()}\\end{enumerate}\n\n`;

    case "listItem": {
      // listItem wraps content in a paragraph; extract raw text
      const parts = (node.content || []).map((child) => {
        if (child.type === "paragraph") {
          return (child.content || []).map(convertNodeToLatex).join("");
        }
        return convertNodeToLatex(child);
      });
      return `  \\item ${parts.join("\n").trim()}\n`;
    }

    case "codeBlock": {
      const attrs = (node.attrs || {}) as Record<string, string | undefined>;
      const lang = mapLanguageToLatex(attrs.language ?? "plaintext");
      const code = (node.content || []).map((n) => n.text ?? "").join("");
      const title = attrs.title ? `${attrs.title}: ` : "";
      const escapedCaption = escapeLaTeX(title + (attrs.caption ?? ""));
      const labelId = attrs.id || "";
      return `\\begin{notebookcodeblock}{${lang}}{${escapedCaption}}{${labelId}}\n${code}\n\\end{notebookcodeblock}\n\n`;
    }

    case "image": {
      const attrs = (node.attrs || {}) as Record<string, string | undefined>;
      const filePath = attrs.filePath;
      const src = attrs.src ?? "";
      let imgSrc = filePath
        ? filePath
        : src.startsWith("data:") ? `${ASSETS_DIR}/embedded_image.png` : src;

      // Remove redundant resources/ or assets/ prefix if graphicspath already includes it
      if (imgSrc.startsWith("resources/")) {
        imgSrc = imgSrc.replace("resources/", "");
      }
      if (imgSrc.startsWith(`${ASSETS_DIR}/`)) {
        imgSrc = imgSrc.replace(`${ASSETS_DIR}/`, "");
      }

      const title = attrs.title ? `${attrs.title}: ` : "";
      const escapedCaption = escapeLaTeX(title + (attrs.caption || attrs.alt || "Figure"));

      const escapedInitials = escapeLaTeX(attrs.initials ?? "");

      // Convert "55%" to "0.55\textwidth"
      const rawWidth = (attrs.width ?? "100%").toString().replace("%", "");
      const widthNum = parseFloat(rawWidth);
      const latexWidth = isNaN(widthNum) ? "1" : (widthNum / 100).toFixed(2);

      const labelId = attrs.id || "";
      return `\\notebookimage{${imgSrc}}{${escapedCaption}}{${escapedInitials}}{${latexWidth}\\textwidth}{${labelId}}\n\n`;
    }

    case "table": {
      const rows = node.content ?? [];
      if (!rows.length) return "";
      const colCount = (rows[0]?.content ?? []).length;
      const colSpec = "|l".repeat(colCount) + "|";
      const title = node.attrs?.title ? `${node.attrs.title}: ` : "";
      const caption = title + (node.attrs?.caption ?? "Design Data");

      const body = rows.map((row) => {
        const cells = (row.content ?? []).map((cell) =>
          (cell.content ?? []).map(convertNodeToLatex).join("").replace(/\n+$/, "").trim()
        );
        return cells.join(" & ") + " \\\\ \\hline";
      }).join("\n");

      const escapedCaption = escapeLaTeX(caption);
      const labelId = (node.attrs?.id as string) || "";

      return `\\notebooktable{${colSpec}}{${body}}{${escapedCaption}}{${labelId}}\n\n`;
    }

    // tableRow / tableCell / tableHeader — just recurse
    case "tableRow":
    case "tableCell":
    case "tableHeader":
      return children();

    case "blockquote":
      return `\\begin{quote}\n${children()}\\end{quote}\n\n`;

    case "rawLatex": {
      const code = (node.content || []).map((n) => n.text ?? "").join("");
      return code + "\n\n";
    }

    case "horizontalRule":
      return "\\noindent\\rule{\\linewidth}{0.4pt}\n\n";

    default:
      return children();
  }
};

export const convertJsonToLatex = (input: TipTapNode | string): string => {
  if (!input) return "";
  
  let doc = input;
  if (typeof input === 'string') {
    try {
      doc = JSON.parse(input);
    } catch {
      // Legacy: plain HTML or raw text — strip tags as fallback
      return input.replace(/<[^>]*>/g, "").trim() + "\n";
    }
  }

  return convertNodeToLatex(doc as TipTapNode).replace(/\n{3,}/g, "\n\n").trim() + "\n";
};

export const generateEntryLatex = (cnt: TipTapNode | string, t: string, a: string, p: string, initialCreatedAt: string | undefined, id?: string): string => {
  let dateObj = initialCreatedAt ? new Date(initialCreatedAt) : new Date();

  // Fallback for mangled timestamps (e.g. 2026-04-28T17-36-32)
  if (isNaN(dateObj.getTime()) && initialCreatedAt) {
    const repaired = initialCreatedAt.replace(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/, "$1T$2:$3:$4");
    dateObj = new Date(repaired);
  }

  // Final fallback to now if still invalid
  if (isNaN(dateObj.getTime())) {
    dateObj = new Date();
  }

  const dateStr = dateObj.toISOString().split('T')[0];
  let latex = `\\notebookentry{${escapeLaTeX(t)}}{${dateStr}}{${escapeLaTeX(a)}}{${escapeLaTeX(p)}}\n`;
  if (id) {
    latex += `\\label{${id}}\n`;
  }
  latex += `\n`;
  latex += convertJsonToLatex(cnt);
  return latex;
};

export const generateAllEntriesLatex = (metadata: { entries: Record<string, { id: string, createdAt: string }> }, prefix: string = `${DATA_DIR}/`): string => {
  const entries = Object.values(metadata.entries)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return entries
    .map(entry => `\\input{${prefix}latex/${entry.id}.tex}`)
    .join("\n") + "\n";
};
