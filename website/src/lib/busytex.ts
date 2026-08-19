import { BusyTexRunner, XeLatex, FileInput } from 'texlyre-busytex';
import { store } from './store';
import { DATA_DIR, LATEX_DIR, TEAM_PATH, PHASES_PATH, ENTRIES_INDEX_PATH } from './constants';

let runner: BusyTexRunner | null = null;
let xelatex: XeLatex | null = null;

const APP_TAG = process.env.NEXT_PUBLIC_APP_VERSION || 'v0.1.0';
const GITHUB_RELEASE_URL = `https://github.com/msoe-vex/engineering-notebook-editor/releases/download/${APP_TAG}`;

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
    // Ignore local failure and try remote release
  }

  // Fallback to remote release via proxy
  const filename = path.split('/').pop();
  const remoteUrl = `${GITHUB_RELEASE_URL}/${filename}`;
  const proxiedUrl = `${window.location.origin}/api/busytex-proxy?url=${encodeURIComponent(remoteUrl)}`;

  try {
    const response = await fetch(proxiedUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  } catch (error) {
    console.error(`[BusyTex] Failed to fetch asset "${path}" from both local path and remote release (${remoteUrl}):`, error);
    throw new Error(`Failed to load asset "${path}" from public or release: ${error instanceof Error ? error.message : String(error)}`);
  }
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
      if (res.ok) {
        packageFiles = await res.json();
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch {
      const remoteManifestUrl = `${GITHUB_RELEASE_URL}/manifest.json`;
      const proxiedUrl = `${window.location.origin}/api/busytex-proxy?url=${encodeURIComponent(remoteManifestUrl)}`;
      try {
        const res = await fetch(proxiedUrl);
        if (res.ok) {
          packageFiles = await res.json();
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (manifestErr) {
        console.error(`[BusyTex] Failed to load LaTeX manifest.json from both local (/latex/manifest.json) and remote release (${remoteManifestUrl}):`, manifestErr);
      }
    }

    for (const pkg of packageFiles) {
      try {
        const content = await fetchAsset(`/latex/${pkg}`);
        files.push({ path: pkg, content });
      } catch (e) {
        console.error(`[BusyTex] Failed to load LaTeX dependency "${pkg}" from public or release:`, e);
      }
    }
  } catch (e) {
    console.error("[BusyTex] Failed to load LaTeX dependencies:", e);
  }

  // 2. Map root template files (main.tex and notebook.sty) from workspace store or bundled template
  const templateCoreFiles = ['main.tex', 'notebook.sty'];
  for (const file of templateCoreFiles) {
    try {
      const userContent = await store.getFileContent(file);
      if (userContent) {
        files.push({ path: file, content: userContent });
        continue;
      }
      const res = await fetch(`/notebook-template/${file}`);
      if (res.ok) {
        const text = await res.text();
        files.push({ path: file, content: text });
      }
    } catch (e) {
      console.error(`[BusyTex] Failed to load template file "${file}":`, e);
    }
  }

  // 3. Map fonts (/notebook-template/fonts/*)
  onStatus?.("Loading typography assets...", 4, TOTAL_STEPS, 50);
  const fontFiles = [
    'inter/Inter-Regular.otf', 'inter/Inter-Bold.otf', 'inter/Inter-Italic.otf', 'inter/Inter-BoldItalic.otf',
    'inconsolata/Inconsolata-Regular.otf', 'inconsolata/Inconsolata-Bold.otf'
  ];

  for (const font of fontFiles) {
    try {
      const res = await fetch(`/notebook-template/fonts/${font}`);
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        files.push({ path: `fonts/${font}`, content: new Uint8Array(buffer) });
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (e) {
      console.error(`[BusyTex] Failed to load font "${font}" from /notebook-template/fonts:`, e);
    }
  }

  // 3. Map project files from store (Only files in latex/ are dynamic)
  onStatus?.("Mapping document structure...", 5, TOTAL_STEPS, 65);
  const teamTex = await store.getFileContent(TEAM_PATH);
  const phasesTex = await store.getFileContent(PHASES_PATH);
  const entriesIndexTex = await store.getFileContent(ENTRIES_INDEX_PATH);

  if (teamTex) files.push({ path: TEAM_PATH, content: teamTex });
  if (phasesTex) files.push({ path: PHASES_PATH, content: phasesTex });
  if (entriesIndexTex) {
    files.push({ path: ENTRIES_INDEX_PATH, content: entriesIndexTex });
  }

  // 4. Map entry .tex files (templates do not have or need .tex files)
  const regularEntries = Object.values(store.metadata.entries).filter(entry => !entry.isTemplate);
  for (const entry of regularEntries) {
    const entryTexPath = `${LATEX_DIR}/${entry.id}.tex`;
    const tex = await store.getFileContent(entryTexPath);
    if (tex) {
      files.push({ path: entryTexPath, content: tex });
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
