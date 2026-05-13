import { ASSETS_DIR, DATA_DIR } from "./constants";
import { TipTapNode, ProjectPhase } from "./metadata";

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

// Recursively extract plain text from a TipTap node tree (no formatting commands).
// Used for headings / moving arguments where LaTeX commands would break.
const plainTextFromNode = (node: TipTapNode): string => {
  if (!node) return "";
  if (node.type === "text") return escapeLaTeX(node.text ?? "");
  return (node.content || []).map(plainTextFromNode).join("");
};

const cssColorToHex = (colorStr: string | undefined): string => {
  if (!colorStr) return "000000";
  const str = colorStr as string;
  if (str.startsWith("rgb")) {
    const rgbMatch = str.match(/\d+/g);
    if (rgbMatch && rgbMatch.length >= 3) {
      const r = parseInt(rgbMatch[0]).toString(16).padStart(2, "0");
      const g = parseInt(rgbMatch[1]).toString(16).padStart(2, "0");
      const b = parseInt(rgbMatch[2]).toString(16).padStart(2, "0");
      return r + g + b;
    }
  }
  return str.replace("#", "");
};

export const convertNodeToLatex = (node: TipTapNode, resourceTypes?: Record<string, string>): string => {
  if (!node) return "";

  // Helper to get resource type (entry, header, image, codeBlock, table, etc.)
  const getResourceType = (id: string): string | null => {
    if (!resourceTypes) return null;
    return resourceTypes[id] || null;
  };

  const children = () => (node.content || []).map(n => convertNodeToLatex(n, resourceTypes)).join("");

  switch (node.type) {
    case "doc":
      return children();

    case "text": {
      let t = escapeLaTeX(node.text ?? "");

      const marks = node.marks || [];
      const hasBold = marks.some(m => m.type === "bold");
      const hasItalic = marks.some(m => m.type === "italic");
      const hasCode = marks.some(m => m.type === "code");
      const hasUnderline = marks.some(m => m.type === "underline");
      const strikeMark = marks.find(m => m.type === "strike");
      const colorMark = marks.find(m => m.type === "textStyle" && m.attrs?.color);
      const highlightMark = marks.find(m => m.type === "highlight");
      const superscriptMark = marks.find(m => m.type === "superscript");
      const subscriptMark = marks.find(m => m.type === "subscript");
      const linkMark = marks.find(m => m.type === "link");

      // Auto-wrap abnormally long unbreakable words for regular text
      // (Scripts are handled natively character-by-character in engineering_notebook.sty)
      if (!superscriptMark && !subscriptMark) {
        t = t.replace(/(\S{40,})/g, "\\notebookseqsplit{$1}");
      }

      // Innermost: Scripts (Now handled natively in engineering_notebook.sty via expl3)
      if (superscriptMark) t = `\\notebooksuperscript{${t}}`;
      if (subscriptMark) t = `\\notebooksubscript{${t}}`;

      // Ulem-based universal rich text decorator for line breaking
      let hlColor = "";
      if (highlightMark) {
        hlColor = highlightMark.attrs?.color ? cssColorToHex(highlightMark.attrs.color as string) : "ffff00";
      }
      let hasUl = hasUnderline ? 1 : 0;
      let hasSt = strikeMark ? 1 : 0;

      if (hlColor || hasUl || hasSt) {
        t = `\\notebookdecoration{${hlColor}}{${hasUl}}{${hasSt}}{${t}}`;
      }

      // Semantic: Bold and Italic
      if (hasBold) t = `\\notebookbold{${t}}`;
      if (hasItalic) t = `\\notebookitalic{${t}}`;

      if (hasCode) t = `\\notebookinlinecode{${t}}`;

      if (colorMark) {
        const hex = cssColorToHex(colorMark.attrs?.color as string);
        t = `\\notebooktextcolor{${hex}}{${t}}`;
      }

      if (linkMark) {
        const { href, resourceId, entryId } = linkMark.attrs ?? {};
        const finalResourceId = (resourceId || entryId) as string | undefined;

        if (finalResourceId) {
          const resType = getResourceType(finalResourceId);
          if (resType === "header") {
            t = `\\notebooklink{${t}}{header}{${finalResourceId}}`;
          } else if (resType === "entry") {
            t = `\\notebooklink{${t}}{entry}{${finalResourceId}}`;
          } else if (resType === "image" || resType === "codeBlock" || resType === "table") {
            t = `\\notebooklink{${t}}{${resType}}{${finalResourceId}}`;
          } else if (resType) {
            t = `\\notebooklink{${t}}{${resType}}{${finalResourceId}}`;
          } else {
            t = `\\notebooklink{${t}}{resource}{${finalResourceId}}`;
          }
        } else if (href) {
          t = `\\notebooklink{${t}}{url}{${href}}`;
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
      const formattedText = children().trim();
      const plainText = plainTextFromNode(node).trim();
      const uuid = (node.attrs?.id as string) || "";

      if (uuid) {
        // notebookheader{formatted}{plain}{level}{uuid}
        return `\\notebookheader{${formattedText}}{${plainText}}{${level}}{${uuid}}\n\n`;
      } else {
        // Fallback: standard heading without label (plain text only)
        const cmd = level === 1 ? "subsection" : (level === 2 ? "subsubsection" : "paragraph");
        return `\\${cmd}{${plainText}}\n\n`;
      }
    }

    case "bulletList":
      return `\\begin{itemize}\n${children()}\\end{itemize}\n\n`;

    case "orderedList":
      return `\\begin{enumerate}\n${children()}\\end{enumerate}\n\n`;

    case "listItem": {
      // listItem wraps content in a paragraph; extract raw text
      const parts = (node.content || []).map((child) => {
        if (child.type === "paragraph") {
          return (child.content || []).map(n => convertNodeToLatex(n, resourceTypes)).join("");
        }
        return convertNodeToLatex(child, resourceTypes);
      });
      return `  \\item ${parts.join("\n").trim()}\n`;
    }

    case "codeBlock": {
      const attrs = (node.attrs || {}) as Record<string, string | undefined>;
      const lang = mapLanguageToLatex(attrs.language ?? "plaintext");
      const code = (node.content || []).map((n) => n.text ?? "").join("");
      const title = escapeLaTeX(attrs.title ?? "");
      const caption = escapeLaTeX(attrs.caption ?? "");
      const labelId = attrs.id || "";
      return `\\begin{notebookcodeblock}{${lang}}{${title}}{${caption}}{${labelId}}\n${code}\n\\end{notebookcodeblock}\n\n`;
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

      const title = escapeLaTeX(attrs.title ?? "");
      const caption = escapeLaTeX(attrs.caption || attrs.alt || "");

      // Convert "55%" to "0.55\textwidth"
      const rawWidth = (attrs.width ?? "100%").toString().replace("%", "");
      const widthNum = parseFloat(rawWidth);
      const latexWidth = isNaN(widthNum) ? "1" : (widthNum / 100).toFixed(2);

      const labelId = attrs.id || "";
      return `\\notebookimage{${imgSrc}}{${title}}{${caption}}{${latexWidth}\\textwidth}{${labelId}}\n\n`;
    }

    case "table": {
      const attrs = (node.attrs || {}) as Record<string, string | undefined>;
      const rows = node.content ?? [];
      if (!rows.length) return "";
      const colCount = (rows[0]?.content ?? []).length;
      const colSpec = "|l".repeat(colCount) + "|";
      const title = escapeLaTeX(attrs.title ?? "");
      const caption = escapeLaTeX(attrs.caption ?? "Design Data");

      const body = rows.map((row) => {
        const cells = (row.content ?? []).map((cell) =>
          (cell.content ?? []).map(n => convertNodeToLatex(n, resourceTypes)).join("").replace(/\n+$/, "").trim()
        );
        return cells.join(" & ") + " \\\\ \\hline";
      }).join("\n");

      const labelId = (node.attrs?.id as string) || "";

      return `\\notebooktable{${colSpec}}{${title}}{${body}}{${caption}}{${labelId}}\n\n`;
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

    case "inlineMath": {
      return `$${node.attrs?.latex || ""}$`;
    }

    case "mathBlock": {
      const attrs = (node.attrs || {}) as Record<string, string | undefined>;
      const title = escapeLaTeX(attrs.title ?? "");
      const caption = escapeLaTeX(attrs.caption ?? "");
      const latex = attrs.latex || "";
      const labelId = attrs.id || "";

      return `\\notebookequation{${latex}}{${title}}{${caption}}{${labelId}}\n\n`;
    }

    case "horizontalRule":
      return "\\noindent\\rule{\\linewidth}{0.4pt}\n\n";

    default:
      return children();
  }
};

export const convertJsonToLatex = (input: TipTapNode | string, resourceTypes?: Record<string, string>): string => {
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

  // Unwrap if it's the standard wrapper { version: 3, content: { type: 'doc', ... } }
  if (doc && typeof doc === 'object' && 'content' in doc && !('type' in doc)) {
    doc = (doc as Record<string, unknown>).content as TipTapNode;
  }

  return convertNodeToLatex(doc as TipTapNode, resourceTypes).replace(/\n{3,}/g, "\n\n").trim() + "\n";
};

export const generateEntryLatex = (cnt: TipTapNode | string, t: string, a: string, p: string | number | null, initialCreatedAt: string | undefined, id?: string, resourceTypes?: Record<string, string>, date?: string): string => {
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

  // Build a local fallback map when callers do not provide notebook-wide types.
  const resolvedResourceTypes: Record<string, string> = { ...(resourceTypes || {}) };
  if (id) {
    resolvedResourceTypes[id] = "entry";
  }

  const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
  let latex = `\\notebookentry{${escapeLaTeX(t)}}{${date || dateStr}}{${escapeLaTeX(a)}}{${p ?? ""}}{${id ?? ""}}\n\n`;
  latex += convertJsonToLatex(cnt, resolvedResourceTypes);
  return latex;
};

export const generateAllEntriesLatex = (metadata: { entries: Record<string, { id: string, date: string, createdAt: string, updatedAt?: string }> }, prefix: string = `${DATA_DIR}/`): string => {
  const entries = Object.values(metadata.entries)
    .sort((a, b) => {
      const dateComp = (a.date || "").localeCompare(b.date || "");
      if (dateComp !== 0) return dateComp;
      const timeA = a.updatedAt || a.createdAt || "";
      const timeB = b.updatedAt || b.createdAt || "";
      return timeA.localeCompare(timeB);
    });

  return entries
    .map(entry => `\\input{${prefix}latex/${entry.id}.tex}`)
    .join("\n") + "\n";
};

import { TeamMetadata } from "./metadata";

export const generateTeamLatex = (team: TeamMetadata): string => {
  const cleanImg = (p: string | undefined) => {
    if (!p) return "";
    let s = p;
    if (s.startsWith("resources/")) s = s.replace("resources/", "");
    if (s.startsWith(`${ASSETS_DIR}/`)) s = s.replace(`${ASSETS_DIR}/`, "");
    return s;
  };

  let latex = `\\teamname{${escapeLaTeX(team.teamName || "")}}\n`;
  latex += `\\teamnumber{${escapeLaTeX(team.teamNumber || "")}}\n`;
  latex += `\\startdate{${escapeLaTeX(team.startDate || "")}}\n`;
  latex += `\\projectenddate{${escapeLaTeX(team.endDate || "")}}\n`;
  latex += `\\organization{${escapeLaTeX(team.organization || "")}}\n`;
  latex += `\\teamlogo{${cleanImg(team.logo)}}\n\n`;

  latex += `\\teammembers{\n`;
  team.members.forEach((m, i) => {
    latex += `    \\teammember{${escapeLaTeX(m.name)}}{${escapeLaTeX(m.role)}}{${cleanImg(m.image)}}`;
    if (i % 2 === 0 && i < team.members.length - 1) {
      latex += ` \\hfill`;
    } else if (i < team.members.length - 1) {
      latex += ` \\\\`;
    }
    latex += `\n`;
  });
  latex += `}\n`;
  return latex;
};

export const generatePhasesLatex = (phases: ProjectPhase[]): string => {
  let latex = "% DESIGN PROCESS PHASES - AUTOMATICALLY GENERATED\n\n";

  let phaseListLatex = "\\newcommand{\\phaselist}{\n";

  phases.forEach((p) => {
    // Create a color name based on the stable ID (safe for LaTeX)
    const colorName = `PhaseID${p.id.toString().replace(/-/g, "")}`;
    const hex = p.color.startsWith("#") ? p.color.substring(1) : p.color;

    latex += `% Phase: ${p.name}\n`;
    latex += `\\definecolor{${colorName}}{HTML}{${hex}}\n`;
    latex += `\\csdef{phasecolor@${p.index}}{${colorName}}\n`;
    latex += `\\csdef{phasename@${p.index}}{${escapeLaTeX(p.name)}}\n\n`;

    // Add to phase list using the abstracted command
    phaseListLatex += `    \\notebookphase{${colorName}}{${escapeLaTeX(p.name)}}{${escapeLaTeX(p.description || "")}}\n`;
  });

  phaseListLatex += "}\n";

  return latex + phaseListLatex;
};
