import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');
const DEST_DIR = path.join(ROOT_DIR, 'website', 'public');

function run() {
  try {
    if (!fs.existsSync(DEST_DIR)) {
      fs.mkdirSync(DEST_DIR, { recursive: true });
    }

    console.log(`Downloading BusyTeX engine and TeX Live packages to ${DEST_DIR}...`);
    
    // Use the official texlyre-busytex CLI to fetch the latest WASM/Data assets
    execSync(`npx texlyre-busytex download-assets "${DEST_DIR}"`, { 
      stdio: 'inherit',
      shell: true as unknown as string
    });

    console.log(`\nSuccessfully downloaded BusyTeX assets to ${path.join(DEST_DIR, 'busytex')}`);
    console.log(`Reminder: The 'busytex' directory is gitignored to avoid LFS limits.`);
  } catch (error) {
    console.error('Error downloading BusyTeX assets:', error);
    process.exit(1);
  }
}

run();
