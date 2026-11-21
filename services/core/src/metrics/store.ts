import { getMetadataStore } from "../db/metadataStore.js";

export type MetricsSnapshot = {
  totalRequests: number;
  status2xx: number;
  status4xx: number;
  status5xx: number;
  totalLatencyMs: number;
  activeCollaborationConnections: number;
  /** Last successful persist (ISO), if any. */
  persistedAt?: string;
};

const METRICS_PATH = "system/metrics";

const metrics: MetricsSnapshot = {
  totalRequests: 0,
  status2xx: 0,
  status4xx: 0,
  status5xx: 0,
  totalLatencyMs: 0,
  activeCollaborationConnections: 0,
};

let dirty = false;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let loaded = false;

export function observeRequest(statusCode: number, latencyMs: number) {
  metrics.totalRequests += 1;
  metrics.totalLatencyMs += latencyMs;
  if (statusCode >= 500) metrics.status5xx += 1;
  else if (statusCode >= 400) metrics.status4xx += 1;
  else metrics.status2xx += 1;
  dirty = true;
}

export function setActiveCollaborationConnections(count: number) {
  metrics.activeCollaborationConnections = Math.max(0, Math.floor(count));
  dirty = true;
}

export function getMetrics(): MetricsSnapshot {
  return { ...metrics };
}

/** Load counters from MetadataStore once at boot (best-effort). */
export async function loadPersistedMetrics(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const doc = await getMetadataStore().get(METRICS_PATH);
    if (!doc) return;
    metrics.totalRequests = Number(doc.totalRequests) || 0;
    metrics.status2xx = Number(doc.status2xx) || 0;
    metrics.status4xx = Number(doc.status4xx) || 0;
    metrics.status5xx = Number(doc.status5xx) || 0;
    metrics.totalLatencyMs = Number(doc.totalLatencyMs) || 0;
    if (typeof doc.persistedAt === "string") metrics.persistedAt = doc.persistedAt;
    dirty = false;
  } catch (err) {
    console.warn("[metrics] load failed", err);
  }
}

export async function persistMetrics(): Promise<void> {
  if (!dirty) return;
  const ts = new Date().toISOString();
  const payload = {
    totalRequests: metrics.totalRequests,
    status2xx: metrics.status2xx,
    status4xx: metrics.status4xx,
    status5xx: metrics.status5xx,
    totalLatencyMs: metrics.totalLatencyMs,
    persistedAt: ts,
  };
  try {
    await getMetadataStore().set(METRICS_PATH, payload, { merge: true });
    metrics.persistedAt = ts;
    dirty = false;
  } catch (err) {
    console.warn("[metrics] persist failed", err);
  }
}

/** Periodic flush + process signal hooks. Safe to call once at startup. */
export function startMetricsPersistence(intervalMs = 30_000): void {
  void loadPersistedMetrics();
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void persistMetrics();
  }, intervalMs);
  if (typeof flushTimer.unref === "function") flushTimer.unref();

  const flush = () => {
    void persistMetrics();
  };
  process.once("beforeExit", flush);
  process.once("SIGTERM", flush);
  process.once("SIGINT", flush);
}
