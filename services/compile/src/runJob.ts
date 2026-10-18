import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildWorkspace } from "./buildWorkspace.js";
import {
  fetchCompileSnapshotMeta,
  reportCompileFailed,
  reportCompileProgress,
  uploadCompileExport,
} from "./coreClient.js";
import { hydrateCompileSnapshot } from "./hydrateSnapshot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function resolveTemplateDir(): string {
  const fromEnv = process.env.TEMPLATE_DIR;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const candidates = [
    path.resolve(__dirname, "../template"),
    path.resolve(__dirname, "../../../notebook"),
    path.resolve(__dirname, "../../../website/public/notebook-template"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "main.tex")) && fs.existsSync(path.join(c, "notebook.sty"))) {
      return c;
    }
  }
  throw new Error("notebook template not found (main.tex + notebook.sty)");
}

function latexLogTail(workDir: string, maxChars = 2500): string {
  const logPath = path.join(workDir, "main.log");
  if (!fs.existsSync(logPath)) return "";
  const text = fs.readFileSync(logPath, "utf8");
  const errIdx = text.lastIndexOf("!");
  const slice = errIdx >= 0 ? text.slice(Math.max(0, errIdx - 200)) : text.slice(-maxChars);
  return slice.slice(-maxChars).trim();
}

function runXeLatex(workDir: string) {
  const runs = Number(process.env.XELATEX_RUNS || 2);
  for (let i = 0; i < runs; i++) {
    console.log(`[compile] xelatex pass ${i + 1}/${runs}…`);
    try {
      execFileSync(
        "xelatex",
        ["-interaction=nonstopmode", "-halt-on-error", "main.tex"],
        { cwd: workDir, stdio: "inherit" }
      );
    } catch (err) {
      const tail = latexLogTail(workDir);
      const base = err instanceof Error ? err.message : String(err);
      throw new Error(tail ? `${base}\n--- main.log ---\n${tail}` : base);
    }
  }
  const pdfPath = path.join(workDir, "main.pdf");
  if (!fs.existsSync(pdfPath)) {
    const tail = latexLogTail(workDir);
    throw new Error(tail ? `main.pdf was not produced\n--- main.log ---\n${tail}` : "main.pdf was not produced");
  }
  return fs.readFileSync(pdfPath);
}

export async function runCompileJob(opts: {
  orgId: string;
  notebookId: string;
  jobId: string;
}): Promise<{ lastCompiled: string }> {
  const { orgId, notebookId, jobId } = opts;
  const templateDir = resolveTemplateDir();

  await reportCompileProgress(orgId, notebookId, jobId, "Fetching notebook metadata…", 12);
  const meta = await fetchCompileSnapshotMeta(orgId, notebookId);
  console.log(
    `[compile] meta: ${Object.keys(meta.entries).length} entries, ${Object.keys(meta.assets).length} asset refs`
  );

  const snapshot = await hydrateCompileSnapshot(meta, {
    onProgress: (message, progress) => {
      void reportCompileProgress(orgId, notebookId, jobId, message, progress);
    },
  });
  console.log(
    `[compile] hydrated: ${Object.keys(snapshot.entries).length} entries, ${Object.keys(snapshot.assets).length} assets downloaded`
  );

  await reportCompileProgress(orgId, notebookId, jobId, "Building LaTeX workspace…", 40);
  const workDir = process.env.WORK_DIR || path.join(os.tmpdir(), `nb-compile-${jobId}`);
  buildWorkspace({ workDir, templateDir, snapshot });
  console.log(`[compile] workspace=${workDir}`);

  await reportCompileProgress(orgId, notebookId, jobId, "Running XeLaTeX…", 55);
  const pdf = runXeLatex(workDir);
  console.log(`[compile] pdf bytes=${pdf.byteLength}`);

  await reportCompileProgress(orgId, notebookId, jobId, "Uploading PDF…", 90);
  const uploaded = await uploadCompileExport(orgId, notebookId, pdf, jobId);
  console.log(`[compile] uploaded lastCompiled=${uploaded.lastCompiled}`);
  return uploaded;
}

export async function runCompileJobSafe(opts: {
  orgId: string;
  notebookId: string;
  jobId: string;
}): Promise<{ ok: true; lastCompiled: string } | { ok: false; error: string }> {
  try {
    const uploaded = await runCompileJob(opts);
    return { ok: true, lastCompiled: uploaded.lastCompiled };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[compile] failed: ${message}`);
    await reportCompileFailed(opts.orgId, opts.notebookId, message, opts.jobId);
    return { ok: false, error: message };
  }
}
