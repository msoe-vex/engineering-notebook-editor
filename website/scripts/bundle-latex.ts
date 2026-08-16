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
const DEST_DIR = path.join(ROOT_DIR, 'website/public/latex');

function bundle() {
  try {
    // 1. Run xelatex to generate .fls record in the notebook directory
    console.log('Running xelatex -recorder main.tex...');
    execSync('xelatex -interaction=batchmode -recorder main.tex', {
      cwd: NOTEBOOK_DIR,
      stdio: 'inherit'
    });

    // 2. Parse main.fls
    const flsFile = path.join(NOTEBOOK_DIR, 'main.fls');
    if (!fs.existsSync(flsFile)) {
      throw new Error('main.fls not found. xelatex might have failed.');
    }

    const flsContent = fs.readFileSync(flsFile, 'utf8');
    const inputs = flsContent.split('\n')
      .filter(line => line.startsWith('INPUT '))
      .map(line => line.substring(6).trim())
      // Filter for LaTeX dependency types
      .filter(file => /\.(sty|cls|def|clo|cfg|fd|tex|fontspec)$/.test(file))
      // Exclude temporary/generated files
      .filter(file => !/(main\.aux|main\.fls|main\.log|main\.out|main\.toc)$/.test(file))
      // Exclude local data files that are handled separately
      .filter(file => !file.includes('data/') && !file.includes('latex/'));

    // Get unique basenames
    const uniqueFiles = Array.from(new Set(inputs.map(f => path.basename(f))));

    // 3. Ensure destination exists
    if (!fs.existsSync(DEST_DIR)) {
      fs.mkdirSync(DEST_DIR, { recursive: true });
    }

    // 4. Use kpsewhich to find absolute paths and copy
    console.log(`\nCopying dependencies to ${DEST_DIR}...`);
    const manifest: string[] = [];

    const LATEX_SRC_DIR = path.join(NOTEBOOK_DIR, 'latex');

    for (const file of uniqueFiles) {
      // Skip project-specific dynamic files that live in notebook/latex/ or notebook/data/
      if (
        fs.existsSync(path.join(LATEX_SRC_DIR, file)) ||
        fs.existsSync(path.join(NOTEBOOK_DIR, 'data', file))
      ) {
        continue;
      }

      try {
        // Try to find the file in the TeX distribution
        const absPath = execSync(`kpsewhich ${file}`, { encoding: 'utf8' }).trim();

        if (absPath && fs.existsSync(absPath)) {
          const normalizedPath = absPath.replace(/\\/g, '/');

          // Systematically skip internal LaTeX3 engine kernel components (preloaded in xelatex.fmt)
          if (normalizedPath.includes('/tex/latex/l3kernel/')) {
            continue;
          }

          console.log(`  [+] ${file}`);
          fs.copyFileSync(absPath, path.join(DEST_DIR, file));
          manifest.push(file);
        }
      } catch {
        // If kpsewhich fails, it might be a local file in the notebook dir
        const localPath = path.join(NOTEBOOK_DIR, file);
        if (fs.existsSync(localPath)) {
          console.log(`  [+] ${file} (local)`);
          fs.copyFileSync(localPath, path.join(DEST_DIR, file));
          manifest.push(file);
        } else {
          console.warn(`  [!] Warning: Could not find ${file}`);
        }
      }
    }

    // 5. Clean up unused files in destination directory
    console.log('\nCleaning up unused files in destination...');
    const manifestSet = new Set(manifest);
    if (fs.existsSync(DEST_DIR)) {
      const existingFiles = fs.readdirSync(DEST_DIR);
      let deletedCount = 0;
      for (const file of existingFiles) {
        if (file === 'manifest.json') {
          continue;
        }
        const filePath = path.join(DEST_DIR, file);
        if (fs.statSync(filePath).isFile()) {
          if (!manifestSet.has(file)) {
            console.log(`  [-] Removing: ${file}`);
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        }
      }
      if (deletedCount > 0) {
        console.log(`Removed ${deletedCount} unused files.`);
      } else {
        console.log('No unused files to remove.');
      }
    }

    // 6. Generate manifest.json
    fs.writeFileSync(
      path.join(DEST_DIR, 'manifest.json'),
      JSON.stringify(manifest.sort(), null, 2),
      'utf8'
    );

    console.log(`\nSuccess! ${manifest.length} dependencies bundled into ${DEST_DIR}`);
    console.log('You can now upload these files to a GitHub Release.');

  } catch (error) {
    console.error('Error during bundling:', error);
    process.exit(1);
  }
}

bundle();
