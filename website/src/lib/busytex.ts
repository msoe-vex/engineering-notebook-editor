import { BusyTexRunner, XeLatex, FileInput } from 'texlyre-busytex';
import { store } from './store';
import { DATA_DIR, LATEX_DIR } from './constants';

let runner: BusyTexRunner | null = null;
let xelatex: XeLatex | null = null;

const GITHUB_RELEASE_URL = 'https://github.com/msoe-vex/engineering-notebook-editor/releases/download/v0.1.0';

export async function initBusyTex() {
  if (runner && runner.isInitialized()) return;

  const basePath = typeof window !== 'undefined'
    ? window.location.origin + '/busytex'
    : '/busytex';

  // Load the package via the base path. Next.js handles proxying in production.
  const proxiedPackageUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/busytex/texlive-recommended.js`
    : '/busytex/texlive-recommended.js';

  runner = new BusyTexRunner({
    busytexBasePath: basePath,
    engineMode: 'combined',
    preloadDataPackages: [proxiedPackageUrl],
    verbose: true,
  });

  await runner.initialize(true); // useWorker = true
  xelatex = new XeLatex(runner);
}

async function fetchAsset(path: string): Promise<Uint8Array> {
  // Try local first, then fallback to remote release
  try {
    const response = await fetch(path);
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    }
  } catch {
    // Ignore local failure and try remote
  }

  // Fallback to remote release via proxy
  const filename = path.split('/').pop();
  const remoteUrl = `${GITHUB_RELEASE_URL}/${filename}`;
  const proxiedUrl = `${window.location.origin}/api/busytex-proxy?url=${encodeURIComponent(remoteUrl)}`;

  const response = await fetch(proxiedUrl);
  if (!response.ok) throw new Error(`Failed to fetch asset from ${path} or ${remoteUrl}`);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

export interface CompileResult {
  success: boolean;
  pdfUrl?: string;
  pdf?: Uint8Array;
  log: string;
}

export type CompileMode = "quality" | "compressed";

export type CompileStatusCallback = (status: string, step: number, totalSteps: number, percentage: number) => void;

export async function compileNotebook(mode: CompileMode = "quality", onStatus?: CompileStatusCallback): Promise<CompileResult> {
  const TOTAL_STEPS = 7;

  onStatus?.("Updating project metadata...", 1, TOTAL_STEPS, 10);
  await store.updateLatexMetadata();

  onStatus?.("Initializing LaTeX engine...", 2, TOTAL_STEPS, 20);
  await initBusyTex();
  if (!xelatex) throw new Error("BusyTex not initialized");

  const files: FileInput[] = [];

  // 1. Map public dependencies (manifest.json + .sty files)
  onStatus?.("Loading LaTeX dependencies...", 3, TOTAL_STEPS, 35);
  try {
    // Fetch manifest.json (try local first, then remote)
    let packageFiles: string[] = [];
    try {
      const res = await fetch('/latex/manifest.json');
      if (res.ok) packageFiles = await res.json();
      else throw new Error();
    } catch {
      const remoteManifestUrl = `${GITHUB_RELEASE_URL}/manifest.json`;
      const proxiedUrl = `${window.location.origin}/api/busytex-proxy?url=${encodeURIComponent(remoteManifestUrl)}`;
      const res = await fetch(proxiedUrl);
      if (res.ok) packageFiles = await res.json();
    }

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

        const content = await fetchAsset(`/latex/${pkg}`);
        files.push({ path: pkg, content });
      } catch (e) {
        console.warn(`Failed to pre-load ${pkg}`, e);
      }
    }
  } catch (e) {
    console.error("Failed to load LaTeX dependencies", e);
  }

  // 2. Map fonts (/fonts/*)
  onStatus?.("Loading typography assets...", 4, TOTAL_STEPS, 50);
  const fontFiles = [
    'inter/Inter-Regular.otf', 'inter/Inter-Bold.otf', 'inter/Inter-Italic.otf', 'inter/Inter-BoldItalic.otf',
    'inconsolata/Inconsolata-Regular.otf', 'inconsolata/Inconsolata-Bold.otf'
  ];

  for (const font of fontFiles) {
    try {
      const content = await fetchAsset(`/fonts/${font}`);
      files.push({ path: `fonts/${font}`, content });
    } catch (e) {
      console.warn(`Failed to pre-load font ${font}`, e);
    }
  }

  // 3. Map project files from store (Only files in data/ are dynamic)
  onStatus?.("Mapping document structure...", 5, TOTAL_STEPS, 65);
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
  onStatus?.("Processing notebook assets...", 6, TOTAL_STEPS, 80);
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
  onStatus?.("Executing LaTeX engine...", 7, TOTAL_STEPS, 95);

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

  const prelude = mode === "quality"
    ? "\\newif\\ifnotebookqualityimages\\notebookqualityimagestrue\n"
    : "\\newif\\ifnotebookqualityimages\\notebookqualityimagesfalse\n";

  const result = await (xelatex as unknown as {
    compile: (options: {
      input: string;
      mainTexPath: string;
      additionalFiles: FileInput[];
      rerun?: boolean;
      cmd?: string;
    }) => Promise<BusyTexResult>
  }).compile({
    input: `${prelude}${finalInput || ''}`,
    mainTexPath: 'main.tex',
    additionalFiles: files,
    rerun: true,
    cmd: 'xelatex -synctex=1 --no-shell-escape --interaction=batchmode --halt-on-error --no-pdf --fmt /texlive/texmf-dist/texmf-var/web2c/xetex/xelatex.fmt main.tex'
  });

  if (result.log) {
    console.log("[BusyTeX] Final LaTeX Log Output:\n", result.log);
  }

  // Detect errors in the log even if success is true
  const hasErrorMarker = result.log.split('\n').some(line => line.startsWith('! '));
  const isActuallySuccessful = result.success && !hasErrorMarker;

  if (isActuallySuccessful && result.pdf) {
    const blob = new Blob([result.pdf.slice()], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    return { success: true, pdfUrl: url, pdf: result.pdf, log: result.log };
  }

  return { success: false, log: result.log };
}
