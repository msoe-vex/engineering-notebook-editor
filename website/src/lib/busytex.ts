import { BusyTexRunner, XeLatex, FileInput } from 'texlyre-busytex';
import { store } from './store';
import { DATA_DIR, LATEX_DIR } from './constants';

let runner: BusyTexRunner | null = null;
let xelatex: XeLatex | null = null;

const GITHUB_PACKAGE_URL = 'https://github.com/msoe-vex/engineering-notebook-editor/releases/download/v0.1.0/texlive-recommended.js';

export async function initBusyTex() {
  if (runner && runner.isInitialized()) return;

  const basePath = typeof window !== 'undefined'
    ? window.location.origin + '/busytex'
    : '/busytex';

  // Use the CORS proxy to fetch the remote package.
  // The proxy also fixes the MIME type so the browser can execute the script.
  const proxiedPackageUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/busytex-proxy?url=${encodeURIComponent(GITHUB_PACKAGE_URL)}`
    : GITHUB_PACKAGE_URL;

  runner = new BusyTexRunner({
    busytexBasePath: basePath,
    engineMode: 'combined',
    // By providing the proxied URL to the .js file, BusyTeX will 
    // automatically use the same proxy for the .data file.
    preloadDataPackages: [proxiedPackageUrl],
    verbose: true,
  });

  await runner.initialize(true); // useWorker = true
  xelatex = new XeLatex(runner);
}

async function fetchPublicFile(path: string): Promise<Uint8Array> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to fetch ${path}`);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

export interface CompileResult {
  success: boolean;
  pdfUrl?: string;
  pdf?: Uint8Array;
  log: string;
}

export async function compileNotebook(onStatus?: (status: string) => void): Promise<CompileResult> {
  // 0. Ensure LaTeX metadata (entries.tex, etc.) is up to date in the store
  onStatus?.("Updating project metadata...");
  await store.updateLatexMetadata();

  onStatus?.("Initializing LaTeX engine...");
  await initBusyTex();
  if (!xelatex) throw new Error("BusyTex not initialized");

  const files: FileInput[] = [];

  // 1. Map public dependencies (/latex/*) and user overrides
  onStatus?.("Pre-loading LaTeX dependencies...");
  try {
    const manifestResponse = await fetch('/latex/manifest.json');
    if (manifestResponse.ok) {
      const packageFiles = await manifestResponse.json() as string[];
      for (const pkg of packageFiles) {
        try {
          // Try to pull main.tex and engineering_notebook.sty from workspace first
          if (pkg === 'main.tex' || pkg === 'engineering_notebook.sty') {
            const userContent = await store.getFileContent(pkg);
            if (userContent) {
              files.push({ path: pkg, content: userContent });
              continue;
            }
          }

          const content = await fetchPublicFile(`/latex/${pkg}`);
          files.push({ path: pkg, content });
        } catch (e) {
          console.warn(`Failed to pre-load ${pkg}`, e);
        }
      }
    }
  } catch (e) {
    console.error("Failed to load manifest.json", e);
  }

  // 2. Map fonts (/fonts/*)
  onStatus?.("Loading typography assets...");
  const fontFiles = [
    'inter/Inter-Regular.otf', 'inter/Inter-Bold.otf', 'inter/Inter-Italic.otf', 'inter/Inter-BoldItalic.otf',
    'inconsolata/Inconsolata-Regular.otf', 'inconsolata/Inconsolata-Bold.otf'
  ];

  for (const font of fontFiles) {
    try {
      const content = await fetchPublicFile(`/fonts/${font}`);
      files.push({ path: `fonts/${font}`, content });
    } catch (e) {
      console.warn(`Failed to pre-load font ${font}`, e);
    }
  }

  // 3. Map project files from store (Only files in data/ are dynamic)
  onStatus?.("Mapping document structure...");
  const teamTex = await store.getFileContent(`${DATA_DIR}/team.tex`);
  const phasesTex = await store.getFileContent(`${DATA_DIR}/phases.tex`);
  const entriesIndexTex = await store.getFileContent(`${DATA_DIR}/entries.tex`);

  if (teamTex) files.push({ path: 'data/team.tex', content: teamTex });
  if (phasesTex) files.push({ path: 'data/phases.tex', content: phasesTex });
  if (entriesIndexTex) {
    files.push({ path: 'data/entries.tex', content: entriesIndexTex });
  }

  // 4. Map entry .tex files
  const entryIds = Object.keys(store.metadata.entries);
  for (const entryId of entryIds) {
    const entryTexPath = `${LATEX_DIR}/${entryId}.tex`;
    const tex = await store.getFileContent(entryTexPath);
    if (tex) {
      files.push({ path: `data/latex/${entryId}.tex`, content: tex });
    }
  }

  // 5. Map assets (images)
  onStatus?.("Processing notebook assets...");
  const assetPaths = new Set<string>();
  Object.values(store.metadata.entries).forEach(entry => {
    (entry.assets || []).forEach(asset => assetPaths.add(asset));
  });
  if (store.metadata.team?.logo) assetPaths.add(store.metadata.team.logo);
  if (store.metadata.team?.members) {
    store.metadata.team.members.forEach(m => {
      if (m.image) assetPaths.add(m.image);
    });
  }

  for (const assetPath of assetPaths) {
    try {
      let base64 = store.assetCache.get(assetPath);
      if (base64 && base64.startsWith('data:')) {
        base64 = base64.split(',')[1];
      }

      if (!base64) {
        base64 = (await store.getAssetBase64(assetPath)) ?? undefined;
      }

      if (base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const vfsPath = assetPath.replace(`${DATA_DIR}/assets/`, 'data/assets/');
        files.push({ path: vfsPath, content: bytes });
      }
    } catch (e) {
      console.warn(`Failed to map asset ${assetPath}`, e);
    }
  }

  console.log("[BusyTeX] Starting compilation...");
  onStatus?.("Executing LaTeX engine...");

  // Use main.tex from the bundled files (static template)
  let finalInput = '';
  const mainFile = files.find(f => f.path === 'main.tex');
  if (mainFile && typeof mainFile.content !== 'string') {
    finalInput = new TextDecoder().decode(mainFile.content);
  } else if (mainFile && typeof mainFile.content === 'string') {
    finalInput = mainFile.content;
  }

  interface BusyTexResult {
    success: boolean;
    pdf?: Uint8Array;
    log: string;
  }

  const result = await (xelatex as unknown as {
    compile: (options: {
      input: string;
      mainTexPath: string;
      additionalFiles: FileInput[];
      rerun?: boolean;
      cmd?: string;
    }) => Promise<BusyTexResult>
  }).compile({
    input: finalInput || '',
    mainTexPath: 'main.tex',
    additionalFiles: files,
    rerun: true,
    cmd: 'xelatex -synctex=1 --no-shell-escape --interaction=batchmode --no-pdf --fmt /texlive/texmf-dist/texmf-var/web2c/xetex/xelatex.fmt main.tex'
  });

  if (result.log) {
    console.log("[BusyTeX] Final LaTeX Log Output:\n", result.log);
  }

  if (result.success && result.pdf) {
    const blob = new Blob([result.pdf.slice()], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    return { success: true, pdfUrl: url, pdf: result.pdf, log: result.log };
  }

  return { success: false, log: result.log };
}
