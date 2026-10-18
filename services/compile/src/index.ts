/**
 * Compile worker entry:
 *   COMPILE_MODE=server  → HTTP worker (local Compose / Cloud Run service)
 *   COMPILE_MODE=job     → one-shot CLI (Cloud Run Job / compose run)
 *
 * CLI:
 *   ORG_ID=… NOTEBOOK_ID=… npm start
 *   npm start -- --org <id> --notebook <id>
 */
import { runCompileJobSafe } from "./runJob.js";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

const mode = (process.env.COMPILE_MODE || "server").toLowerCase();

if (mode === "server") {
  await import("./server.js");
} else {
  const orgId = argValue("--org") || process.env.ORG_ID;
  const notebookId = argValue("--notebook") || process.env.NOTEBOOK_ID;
  const jobId = argValue("--job") || process.env.JOB_ID || `job-${Date.now()}`;

  if (!orgId || !notebookId) {
    console.error("Usage: COMPILE_MODE=job ORG_ID=… NOTEBOOK_ID=… npm start");
    process.exit(2);
  }

  console.log(`[compile] job mode org=${orgId} notebook=${notebookId} job=${jobId}`);
  const result = await runCompileJobSafe({ orgId, notebookId, jobId });
  process.exit(result.ok ? 0 : 1);
}
