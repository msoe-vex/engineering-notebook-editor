import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root repository directory
const ROOT_DIR = path.resolve(__dirname, '../../');
const versionFile = path.join(ROOT_DIR, 'VERSION');

if (!fs.existsSync(versionFile)) {
  console.error('VERSION file not found at root:', versionFile);
  process.exit(1);
}

const versionRaw = fs.readFileSync(versionFile, 'utf-8').trim();
if (!versionRaw) {
  console.error('VERSION file is empty!');
  process.exit(1);
}

const cleanVersion = versionRaw.replace(/^v/, '');
console.log(`Syncing version ${cleanVersion}...`);

// Update website/package.json
const pkgPath = path.join(ROOT_DIR, 'website/package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  if (pkg.version !== cleanVersion) {
    pkg.version = cleanVersion;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`  Updated website/package.json -> ${cleanVersion}`);
  } else {
    console.log(`  website/package.json already at ${cleanVersion}`);
  }
}

console.log('Version sync complete!');
