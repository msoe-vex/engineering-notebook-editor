/**
 * In-flight GET dedupe: identical concurrent requests share one Promise.
 * Mutations and non-GET methods always pass through.
 */
const inflight = new Map<string, Promise<unknown>>();

export function dedupeGet<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = run().finally(() => {
    if (inflight.get(key) === p) inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}

export function dedupeKey(method: string, url: string): string {
  return `${method.toUpperCase()} ${url}`;
}
