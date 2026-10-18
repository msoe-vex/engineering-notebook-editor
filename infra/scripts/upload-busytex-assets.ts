/**
 * Upload BusyTeX / LaTeX template assets to GCS.
 *
 * Usage (from repo root after download:busytex / bundle:template):
 *   npx tsx infra/scripts/upload-busytex-assets.ts
 *
 * Env:
 *   GCS_BUCKET (required)
 *   ASSETS_APP_VERSION (default: latest)
 *   BUSYTEX_DIR (default: website/public/busytex)
 *   LATEX_DIR (default: website/public/latex — optional host harvest; may be empty)
 *   GCS_EMULATOR_ENDPOINT (optional, for fake-gcs-server; prefer over STORAGE_EMULATOR_HOST)
 */
import { Storage } from "@google-cloud/storage";
import * as fs from "node:fs";
import * as path from "node:path";

const bucketName = process.env.GCS_BUCKET;
if (!bucketName) {
  console.error("GCS_BUCKET is required");
  process.exit(1);
}

const version = process.env.ASSETS_APP_VERSION || "latest";
const busytexDir = process.env.BUSYTEX_DIR || path.resolve("website/public/busytex");
const latexDir = process.env.LATEX_DIR || path.resolve("website/public/latex");

const rawEmulator = process.env.GCS_EMULATOR_ENDPOINT || process.env.STORAGE_EMULATOR_HOST || "";
const apiEndpoint = rawEmulator
  ? rawEmulator.startsWith("http")
    ? rawEmulator.replace(/\/$/, "")
    : `http://${rawEmulator}`
  : undefined;
// STORAGE_EMULATOR_HOST makes @google-cloud/storage omit /storage/v1 on reads.
if (apiEndpoint && process.env.STORAGE_EMULATOR_HOST) {
  delete process.env.STORAGE_EMULATOR_HOST;
}

const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "demo-engineering-notebook",
  ...(apiEndpoint ? { apiEndpoint } : {}),
});

async function uploadDir(localDir: string, gcsPrefix: string) {
  if (!fs.existsSync(localDir)) {
    console.warn(`skip missing dir: ${localDir}`);
    return;
  }
  const walk = (dir: string, rel = ""): string[] => {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const next = path.join(dir, entry.name);
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) out.push(...walk(next, nextRel));
      else out.push(nextRel);
    }
    return out;
  };

  const files = walk(localDir);
  for (const rel of files) {
    const key = `${gcsPrefix}/${rel}`.replace(/\\/g, "/");
    const localPath = path.join(localDir, rel);
    await storage.bucket(bucketName!).upload(localPath, { destination: key, resumable: false });
    console.log(`uploaded gs://${bucketName}/${key}`);
  }
}

await uploadDir(busytexDir, `static/busytex/${version}`);
await uploadDir(latexDir, `static/latex-template/${version}`);
console.log("done");
