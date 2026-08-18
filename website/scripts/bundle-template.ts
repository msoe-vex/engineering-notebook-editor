import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths relative to project root
const ROOT_DIR = path.resolve(__dirname, '../../');
const NOTEBOOK_DIR = path.join(ROOT_DIR, 'notebook');
const TEMPLATE_DEST_DIR = path.join(ROOT_DIR, 'website/public/notebook-template');
const LATEX_DEST_DIR = path.join(ROOT_DIR, 'website/public/latex');

function copyRecursiveSync(src: string, dest: string) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    const parentDir = path.dirname(dest);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

function bundleNotebookTemplate() {
  console.log('=== Bundling Notebook Template into public/notebook-template ===');

  if (fs.existsSync(TEMPLATE_DEST_DIR)) {
    fs.rmSync(TEMPLATE_DEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEMPLATE_DEST_DIR, { recursive: true });

  try {
    // Query tracked and untracked (non-ignored) files from git submodule
    // This includes newly added files in data/ while cleanly ignoring .aux, .fls, .log, .toc, .fdb_latexmk
    const output = execSync('git ls-files -c --others --exclude-standard', { cwd: NOTEBOOK_DIR, encoding: 'utf8' });
    const trackedFiles = output
      .split('\n')
      .map(f => f.trim())
      .filter(f => f && !f.startsWith('.git') && !f.endsWith('.bat') && !f.endsWith('.md') && !f.endsWith('.pdf') && !f.includes('build.bat'));

    for (const relPath of trackedFiles) {
      const src = path.join(NOTEBOOK_DIR, relPath);
      const dest = path.join(TEMPLATE_DEST_DIR, relPath);
      const parentDir = path.dirname(dest);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.copyFileSync(src, dest);
      console.log(`  [+] ${relPath}`);
    }

    console.log(`\nSuccessfully bundled ${trackedFiles.length} template files into ${TEMPLATE_DEST_DIR}\n`);
  } catch (err) {
    console.error('Failed to list files from git in notebook submodule, falling back to manual copy:', err);
    // Fallback: copy core files if git is not available
    const fallbackDirs = ['fonts', 'data'];
    for (const d of fallbackDirs) {
      const src = path.join(NOTEBOOK_DIR, d);
      if (fs.existsSync(src)) copyRecursiveSync(src, path.join(TEMPLATE_DEST_DIR, d));
    }
    for (const f of ['main.tex', 'notebook.sty']) {
      const src = path.join(NOTEBOOK_DIR, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(TEMPLATE_DEST_DIR, f));
    }
  }
}

function getAugmentedEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const candidateBinDirs = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'MiKTeX', 'miktex', 'bin', 'x64'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'MiKTeX', 'miktex', 'bin'),
    path.join(process.env.APPDATA || '', 'MiKTeX', 'miktex', 'bin', 'x64'),
    'C:\\Program Files\\MiKTeX\\miktex\\bin\\x64',
    'C:\\Program Files (x86)\\MiKTeX\\miktex\\bin',
    'C:\\texlive\\2026\\bin\\windows',
    'C:\\texlive\\2025\\bin\\windows',
    'C:\\texlive\\2024\\bin\\windows',
    '/usr/local/texlive/2026/bin/x86_64-linux',
    '/usr/local/texlive/2025/bin/x86_64-linux',
    '/Library/TeX/texbin'
  ].filter(d => fs.existsSync(d));

  if (candidateBinDirs.length > 0) {
    const sep = path.delimiter;
    const currentPath = env.PATH || env.Path || '';
    env.PATH = candidateBinDirs.join(sep) + sep + currentPath;
    env.Path = env.PATH;
  }
  return env;
}

function bundleLatexDependencies() {
  console.log('=== Bundling LaTeX Dependencies into public/latex ===');
  try {
    const env = getAugmentedEnv();

    // 1. Run xelatex to generate .fls record in the notebook directory if xelatex is installed
    const flsFile = path.join(NOTEBOOK_DIR, 'main.fls');
    try {
      console.log('Running xelatex -recorder main.tex...');
      execSync('xelatex -interaction=batchmode -recorder main.tex', {
        cwd: NOTEBOOK_DIR,
        stdio: 'inherit',
        env
      });
    } catch {
      console.warn('xelatex execution returned non-zero (or not in PATH), checking existing main.fls...');
    }

    if (!fs.existsSync(flsFile)) {
      console.warn('main.fls not found. Skipping external LaTeX package bundle step (existing files preserved).');
      return;
    }

    const flsContent = fs.readFileSync(flsFile, 'utf8');
    const localDataNorm = path.join(NOTEBOOK_DIR, 'data').replace(/\\/g, '/');
    const localLatexNorm = path.join(NOTEBOOK_DIR, 'latex').replace(/\\/g, '/');

    // Map of basename -> absolute path from .fls
    const flsFileMap = new Map<string, string>();
    for (const rawLine of flsContent.replace(/\r/g, '').split('\n')) {
      if (!rawLine.startsWith('INPUT ')) continue;
      const fullPath = rawLine.substring(6).trim();
      const norm = fullPath.replace(/\\/g, '/');
      if (norm.startsWith(localDataNorm) || norm.startsWith(localLatexNorm)) continue;
      if (norm.startsWith('./data/') || norm.startsWith('./latex/') || norm.startsWith('data/') || norm.startsWith('latex/')) continue;
      const base = path.basename(norm);
      if (/(main\.tex|notebook\.sty|entries\.tex|team\.tex|phases\.tex)$/.test(base)) continue;
      if (/\.(sty|cls|def|clo|cfg|fd|tex|fontspec|sym)$/.test(base)) {
        if (!flsFileMap.has(base)) {
          flsFileMap.set(base, fullPath);
        }
      }
    }

    // Get unique basenames directly discovered by xelatex in .fls
    const uniqueFiles = Array.from(flsFileMap.keys()).sort();

    if (!fs.existsSync(LATEX_DEST_DIR)) {
      fs.mkdirSync(LATEX_DEST_DIR, { recursive: true });
    }

    console.log(`Copying LaTeX dependencies to ${LATEX_DEST_DIR}...`);
    const manifest: string[] = [];

    for (const file of uniqueFiles) {
      const rawPath = flsFileMap.get(file);
      let absPath: string | undefined;

      if (rawPath) {
        const normalized = path.normalize(rawPath);
        if (fs.existsSync(normalized)) {
          absPath = normalized;
        } else {
          const localP = path.join(NOTEBOOK_DIR, rawPath);
          if (fs.existsSync(localP)) {
            absPath = localP;
          }
        }
      }

      if (!absPath || !fs.existsSync(absPath)) {
        try {
          const found = execSync(`kpsewhich ${file}`, { encoding: 'utf8' }).trim();
          if (found && fs.existsSync(found)) {
            absPath = found;
          }
        } catch {
          // Check notebook directory
          const localPath = path.join(NOTEBOOK_DIR, file);
          if (fs.existsSync(localPath)) {
            absPath = localPath;
          } else {
            // Search known local TeX distribution directories on Windows / Unix
            const candidateRoots = [
              path.join(process.env.LOCALAPPDATA || '', 'Programs', 'MiKTeX'),
              path.join(process.env.APPDATA || '', 'MiKTeX'),
              'C:\\Program Files\\MiKTeX',
              'C:\\Program Files (x86)\\MiKTeX',
              'C:\\texlive',
              '/usr/share/texmf',
              '/usr/local/texlive'
            ].filter(d => Boolean(d) && fs.existsSync(d));

            function searchDir(dir: string, targetName: string, maxDepth: number = 6): string | null {
              if (maxDepth <= 0) return null;
              try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const e of entries) {
                  const full = path.join(dir, e.name);
                  if (e.isDirectory()) {
                    const match = searchDir(full, targetName, maxDepth - 1);
                    if (match) return match;
                  } else if (e.name.toLowerCase() === targetName.toLowerCase()) {
                    return full;
                  }
                }
              } catch {}
              return null;
            }

            for (const root of candidateRoots) {
              const matched = searchDir(root, file);
              if (matched) {
                absPath = matched;
                break;
              }
            }
          }
        }
      }

      // If still not found on the host machine, check if it was previously bundled in public/latex
      const existingInDest = path.join(LATEX_DEST_DIR, file);
      if ((!absPath || !fs.existsSync(absPath)) && fs.existsSync(existingInDest)) {
        absPath = existingInDest;
      }

      if (absPath && fs.existsSync(absPath)) {
        const normalizedPath = absPath.replace(/\\/g, '/');
        if (normalizedPath.includes('/tex/latex/l3kernel/')) {
          continue;
        }

        if (absPath !== existingInDest) {
          fs.copyFileSync(absPath, existingInDest);
        }
        console.log(`  [+] ${file}`);
        manifest.push(file);
      } else {
        console.warn(`  [!] Warning: Could not find ${file} (raw path: ${rawPath})`);
      }
    }

    if (manifest.length > 0) {
      // Clean up unused files
      const manifestSet = new Set(manifest);
      const existingFiles = fs.readdirSync(LATEX_DEST_DIR);
      for (const file of existingFiles) {
        if (file === 'manifest.json') continue;
        const filePath = path.join(LATEX_DEST_DIR, file);
        if (fs.statSync(filePath).isFile() && !manifestSet.has(file)) {
          console.log(`  [-] Removing: ${file}`);
          fs.unlinkSync(filePath);
        }
      }

      fs.writeFileSync(
        path.join(LATEX_DEST_DIR, 'manifest.json'),
        JSON.stringify(manifest.sort(), null, 2),
        'utf8'
      );
      console.log(`Success! ${manifest.length} dependencies bundled into ${LATEX_DEST_DIR}\n`);
    }
  } catch (error) {
    console.error('Error during LaTeX dependency bundling:', error);
  }
}

bundleNotebookTemplate();
bundleLatexDependencies();
