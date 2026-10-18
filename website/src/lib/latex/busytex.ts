import { BusyTexRunner, XeLatex, FileInput } from 'texlyre-busytex';

let runner: BusyTexRunner | null = null;
let xelatex: XeLatex | null = null;

export async function initBusyTex() {
  if (runner && runner.isInitialized()) return;

  const basePath = typeof window !== 'undefined'
    ? window.location.origin + '/busytex'
    : '/busytex';

  // Recommended alone misses several notebook.sty deps (tcolorbox, titlesec, …).
  // Extra fills those without needing a host TeX `public/latex` harvest.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const preloadDataPackages = [
    `${origin}/busytex/texlive-recommended.js`,
    `${origin}/busytex/texlive-extra.js`,
  ];

  runner = new BusyTexRunner({
    busytexBasePath: basePath,
    engineMode: "combined",
    preloadDataPackages,
    verbose: true,
  });

  await runner.initialize(true); // useWorker = true
  xelatex = new XeLatex(runner);
}

async function fetchAsset(path: string): Promise<Uint8Array> {
  // Served from website/public or rewritten to Core/GCS via NEXT_PUBLIC_ASSETS_BASE_URL.
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load asset "${path}": HTTP ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

export interface CompileResult {
  success: boolean;
  pdfUrl?: string;
  pdf?: Uint8Array;
  log: string;
}

export type CompileStatusCallback = (status: string, step: number, totalSteps: number, percentage: number) => void;

/** Load shared BusyTeX deps (packages, template, fonts) into the VFS file list. */
export async function loadBusyTexStaticFiles(
  onStatus?: CompileStatusCallback
): Promise<FileInput[]> {
  const files: FileInput[] = [];

  onStatus?.("Loading LaTeX dependencies...", 3, 7, 35);
  try {
    let packageFiles: string[] = [];
    try {
      const res = await fetch("/latex/manifest.json");
      if (res.ok) packageFiles = await res.json();
    } catch (manifestErr) {
      console.error(`[BusyTex] Failed to load /latex/manifest.json:`, manifestErr);
    }
    for (const pkg of packageFiles) {
      try {
        const content = await fetchAsset(`/latex/${pkg}`);
        files.push({ path: pkg, content });
      } catch (e) {
        console.error(`[BusyTex] Failed to load LaTeX dependency "${pkg}":`, e);
      }
    }
  } catch (e) {
    console.error("[BusyTex] Failed to load LaTeX dependencies:", e);
  }

  for (const file of ["main.tex", "notebook.sty"]) {
    try {
      const res = await fetch(`/notebook-template/${file}`);
      if (res.ok) {
        files.push({ path: file, content: await res.text() });
      }
    } catch (e) {
      console.error(`[BusyTex] Failed to load template file "${file}":`, e);
    }
  }

  onStatus?.("Loading typography assets...", 4, 7, 50);
  const fontFiles = [
    "inter/Inter-Regular.otf",
    "inter/Inter-Bold.otf",
    "inter/Inter-Italic.otf",
    "inter/Inter-BoldItalic.otf",
    "inconsolata/Inconsolata-Regular.otf",
    "inconsolata/Inconsolata-Bold.otf",
  ];
  for (const font of fontFiles) {
    try {
      const res = await fetch(`/notebook-template/fonts/${font}`);
      if (res.ok) {
        files.push({ path: `fonts/${font}`, content: new Uint8Array(await res.arrayBuffer()) });
      }
    } catch (e) {
      console.error(`[BusyTex] Failed to load font "${font}":`, e);
    }
  }

  return files;
}

export async function runXeLatex(
  files: FileInput[],
  onStatus?: CompileStatusCallback
): Promise<CompileResult> {
  onStatus?.("Initializing LaTeX engine...", 2, 7, 20);
  await initBusyTex();
  if (!xelatex) throw new Error("BusyTex not initialized");

  onStatus?.("Executing LaTeX engine...", 7, 7, 95);

  let finalInput = "";
  const mainFile = files.find((f) => f.path === "main.tex");
  if (mainFile && typeof mainFile.content !== "string") {
    finalInput = new TextDecoder().decode(mainFile.content);
  } else if (mainFile && typeof mainFile.content === "string") {
    finalInput = mainFile.content;
  }

  interface BusyTexResult {
    success: boolean;
    pdf?: Uint8Array;
    log: string;
  }

  // Cloud assets are a single compressed JPEG; keep the sty switch off.
  const prelude = "\\newif\\ifnotebookqualityimages\\notebookqualityimagesfalse\n";

  const result = await (
    xelatex as unknown as {
      compile: (options: {
        input: string;
        mainTexPath: string;
        additionalFiles: FileInput[];
        rerun?: boolean;
        cmd?: string;
      }) => Promise<BusyTexResult>;
    }
  ).compile({
    input: `${prelude}${finalInput || ""}`,
    mainTexPath: "main.tex",
    additionalFiles: files,
    rerun: true,
    cmd: "xelatex -synctex=1 --no-shell-escape --interaction=batchmode --halt-on-error --no-pdf --fmt /texlive/texmf-dist/texmf-var/web2c/xetex/xelatex.fmt main.tex",
  });

  if (result.log) {
    console.log("[BusyTeX] Final LaTeX Log Output:\n", result.log);
  }

  const hasErrorMarker = result.log.split("\n").some((line) => line.startsWith("! "));
  const isActuallySuccessful = result.success && !hasErrorMarker;

  if (isActuallySuccessful && result.pdf) {
    const blob = new Blob([result.pdf.slice()], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    return { success: true, pdfUrl: url, pdf: result.pdf, log: result.log };
  }

  return { success: false, log: result.log };
}
