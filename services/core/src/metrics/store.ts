export type MetricsSnapshot = {
  totalRequests: number;
  status2xx: number;
  status4xx: number;
  status5xx: number;
  totalLatencyMs: number;
  activeCollaborationConnections: number;
};

const metrics: MetricsSnapshot = {
  totalRequests: 0,
  status2xx: 0,
  status4xx: 0,
  status5xx: 0,
  totalLatencyMs: 0,
  activeCollaborationConnections: 0,
};

export function observeRequest(statusCode: number, latencyMs: number) {
  metrics.totalRequests += 1;
  metrics.totalLatencyMs += latencyMs;
  if (statusCode >= 500) metrics.status5xx += 1;
  else if (statusCode >= 400) metrics.status4xx += 1;
  else metrics.status2xx += 1;
}

export function setActiveCollaborationConnections(count: number) {
  metrics.activeCollaborationConnections = Math.max(0, Math.floor(count));
}

export function getMetrics(): MetricsSnapshot {
  return { ...metrics };
}
