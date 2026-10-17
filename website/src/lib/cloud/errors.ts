/** Turn Core/fetch errors into short UI copy (no raw `404 {"error":…}`). */

export function formatCloudError(err: unknown, fallback = "Something went wrong"): string {
  const raw = err instanceof Error ? err.message : String(err ?? fallback);
  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  const statusMatch = trimmed.match(/^(\d{3})\s+([\s\S]*)$/);
  const status = statusMatch ? Number(statusMatch[1]) : NaN;
  let body = statusMatch ? statusMatch[2].trim() : trimmed;

  try {
    const parsed = JSON.parse(body) as { error?: string; message?: string };
    if (typeof parsed.error === "string" && parsed.error.trim()) body = parsed.error.trim();
    else if (typeof parsed.message === "string" && parsed.message.trim()) {
      body = parsed.message.trim();
    }
  } catch {
    /* keep body */
  }

  if (status === 404 || /^not found$/i.test(body)) {
    return "Not found";
  }
  if (status === 403 || /^forbidden$/i.test(body)) {
    return "You don’t have access";
  }
  if (status === 401 || /^unauthorized$/i.test(body)) {
    return "Sign in required";
  }
  if (Number.isFinite(status) && body && body !== trimmed) {
    return body;
  }
  if (Number.isFinite(status) && (!body || body.startsWith("{"))) {
    return fallback;
  }
  return body || fallback;
}

export function isNotFoundError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (/^404\b/.test(raw.trim())) return true;
  return /not found/i.test(formatCloudError(err));
}

export function isForbiddenError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (/^403\b/.test(raw.trim())) return true;
  const msg = formatCloudError(err);
  return /don’t have access|forbidden/i.test(msg);
}
