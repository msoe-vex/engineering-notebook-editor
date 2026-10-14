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
 *   LATEX_DIR (default: website/public/latex)
 *   STORAGE_EMULATOR_HOST (optional, for fake-gcs-server)
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

const apiEndpoint = process.env.STORAGE_EMULATOR_HOST
  ? process.env.STORAGE_EMULATOR_HOST.startsWith("http")
    ? process.env.STORAGE_EMULATOR_HOST
    : `http://${process.env.STORAGE_EMULATOR_HOST}`
  : undefined;

const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "demo-engineering-notebook",
  apiEndpoint,
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
