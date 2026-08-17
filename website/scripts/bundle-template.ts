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

function bundleLatexDependencies() {
  console.log('=== Bundling LaTeX Dependencies into public/latex ===');
  try {
    // 1. Run xelatex to generate .fls record in the notebook directory if xelatex is installed
    let flsFile = path.join(NOTEBOOK_DIR, 'main.fls');
    try {
      console.log('Running xelatex -recorder main.tex...');
      execSync('xelatex -interaction=batchmode -recorder main.tex', {
        cwd: NOTEBOOK_DIR,
        stdio: 'inherit'
      });
    } catch {
      console.warn('xelatex execution returned non-zero (or not in PATH), checking existing main.fls...');
    }

    if (!fs.existsSync(flsFile)) {
      console.warn('main.fls not found. Skipping external LaTeX package bundle step (existing files preserved).');
      return;
    }

    const flsContent = fs.readFileSync(flsFile, 'utf8');
    const inputs = flsContent.split('\n')
      .filter(line => line.startsWith('INPUT '))
      .map(line => line.substring(6).trim().replace(/\\/g, '/'))
      // Filter for LaTeX dependency types
      .filter(file => /\.(sty|cls|def|clo|cfg|fd|tex|fontspec)$/.test(file))
      // Exclude temporary/generated files
      .filter(file => !/(main\.aux|main\.fls|main\.log|main\.out|main\.toc)$/.test(file))
      // Exclude local data files and local template/dynamic files
      .filter(file => !file.includes('data/') && !file.includes('latex/'))
      .filter(file => !/(main\.tex|notebook\.sty|entries\.tex|team\.tex|phases\.tex)$/.test(path.basename(file)));

    // Map of basename -> absolute path from .fls if available
    const flsFileMap = new Map<string, string>();
    for (const rawLine of flsContent.split('\n')) {
      if (!rawLine.startsWith('INPUT ')) continue;
      const fullPath = rawLine.substring(6).trim();
      const norm = fullPath.replace(/\\/g, '/');
      if (norm.includes('data/') || norm.includes('latex/')) continue;
      const base = path.basename(fullPath);
      if (/(main\.tex|notebook\.sty|entries\.tex|team\.tex|phases\.tex)$/.test(base)) continue;
      if (/\.(sty|cls|def|clo|cfg|fd|tex|fontspec|sym)$/.test(base)) {
        if (path.isAbsolute(fullPath) && fs.existsSync(fullPath)) {
          flsFileMap.set(base, fullPath);
        } else {
          const localP = path.join(NOTEBOOK_DIR, fullPath);
          if (fs.existsSync(localP)) {
            flsFileMap.set(base, localP);
          }
        }
      }
    }

    // Get unique basenames
    const uniqueFiles = Array.from(new Set(inputs.map(f => path.basename(f))));

    if (!fs.existsSync(LATEX_DEST_DIR)) {
      fs.mkdirSync(LATEX_DEST_DIR, { recursive: true });
    }

    console.log(`Copying LaTeX dependencies to ${LATEX_DEST_DIR}...`);
    const manifest: string[] = [];

    for (const file of uniqueFiles) {
      let absPath = flsFileMap.get(file);

      if (!absPath || !fs.existsSync(absPath)) {
        try {
          const found = execSync(`kpsewhich ${file}`, { encoding: 'utf8' }).trim();
          if (found && fs.existsSync(found)) {
            absPath = found;
          }
        } catch {
          const localPath = path.join(NOTEBOOK_DIR, file);
          if (fs.existsSync(localPath)) {
            absPath = localPath;
          }
        }
      }

      if (absPath && fs.existsSync(absPath)) {
        const normalizedPath = absPath.replace(/\\/g, '/');
        if (normalizedPath.includes('/tex/latex/l3kernel/')) {
          continue;
        }

        console.log(`  [+] ${file}`);
        fs.copyFileSync(absPath, path.join(LATEX_DEST_DIR, file));
        manifest.push(file);
      } else {
        console.warn(`  [!] Warning: Could not find ${file}`);
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
