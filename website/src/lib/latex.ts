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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const convertNodeToLatex = (node: any): string => {
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
      const parts = (node.content || []).map((child: any) => {
        if (child.type === "paragraph") {
          return (child.content || []).map(convertNodeToLatex).join("");
        }
        return convertNodeToLatex(child);
      });
      return `  \\item ${parts.join("\n").trim()}\n`;
    }

    case "codeBlock": {
      const lang = mapLanguageToLatex(node.attrs?.language ?? "plaintext");
      const code = (node.content || []).map((n: any) => n.text ?? "").join("");
      const escapedCaption = escapeLaTeX(node.attrs?.caption ?? "");
      const label = node.attrs?.id ? `\\label{code:${node.attrs.id}}` : "";
      return `\\begin{notebookcodeblock}{${lang}}{${escapedCaption}}\n${code}\n\\end{notebookcodeblock}\n${label}\n\n`;
    }

    case "image": {
      const filePath = node.attrs?.filePath;
      const src = node.attrs?.src ?? "";
      let imgSrc = filePath
        ? filePath
        : src.startsWith("data:") ? "assets/embedded_image.png" : src;

      // Remove redundant resources/ or assets/ prefix if graphicspath already includes it
      if (imgSrc.startsWith("resources/")) {
        imgSrc = imgSrc.replace("resources/", "");
      }
      if (imgSrc.startsWith("assets/")) {
        imgSrc = imgSrc.replace("assets/", "");
      }

      const escapedCaption = escapeLaTeX(node.attrs?.alt ?? "Figure");
      const escapedInitials = escapeLaTeX(node.attrs?.title ?? "");

      // Convert "55%" to "0.55\textwidth"
      const rawWidth = (node.attrs?.width ?? "100%").toString().replace("%", "");
      const widthNum = parseFloat(rawWidth);
      const latexWidth = isNaN(widthNum) ? "1" : (widthNum / 100).toFixed(2);

      const label = node.attrs?.id ? `\\label{fig:${node.attrs.id}}` : "";
      return `\\notebookimage{${imgSrc}}{${escapedCaption}}{${escapedInitials}}{${latexWidth}\\textwidth}\n${label}\n\n`;
    }

    case "table": {
      const rows = node.content ?? [];
      if (!rows.length) return "";
      const colCount = (rows[0]?.content ?? []).length;
      const colSpec = "|l".repeat(colCount) + "|";
      const caption = node.attrs?.caption ?? "Design Data";

      const body = rows.map((row: any) => {
        const cells = (row.content ?? []).map((cell: any) =>
          (cell.content ?? []).map(convertNodeToLatex).join("").replace(/\n+$/, "").trim()
        );
        return cells.join(" & ") + " \\\\ \\hline";
      }).join("\n");

      const escapedCaption = escapeLaTeX(caption);
      const label = node.attrs?.id ? `\\label{tab:${node.attrs.id}}` : "";

      return `\\notebooktable{${colSpec}}{${body}}{${escapedCaption}}\n${label}\n\n`;
    }

    // tableRow / tableCell / tableHeader — just recurse
    case "tableRow":
    case "tableCell":
    case "tableHeader":
      return children();

    case "blockquote":
      return `\\begin{quote}\n${children()}\\end{quote}\n\n`;

    case "rawLatex": {
      const code = (node.content || []).map((n: any) => n.text ?? "").join("");
      return code + "\n\n";
    }

    case "horizontalRule":
      return "\\noindent\\rule{\\linewidth}{0.4pt}\n\n";

    default:
      return children();
  }
};

export const convertJsonToLatex = (input: any): string => {
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

  return convertNodeToLatex(doc).replace(/\n{3,}/g, "\n\n").trim() + "\n";
};

export const generateEntryLatex = (cnt: string, t: string, a: string, p: string, initialCreatedAt: string | undefined): string => {
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
  let latex = `\\notebookentry{${escapeLaTeX(t)}}{${dateStr}}{${escapeLaTeX(a)}}{${escapeLaTeX(p)}}\n\n`;
  latex += convertJsonToLatex(cnt);
  return latex;
};
