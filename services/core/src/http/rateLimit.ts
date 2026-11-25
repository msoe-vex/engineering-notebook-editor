type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

/**
 * Simple fixed-window in-memory limiter (per Core instance).
 * Acceptable for v1 single-instance / best-effort on Cloud Run.
 */
export function checkRateLimit(
  key: string,
  opts: { windowMs: number; max: number }
): RateLimitResult {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now - current.windowStart > opts.windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { ok: true };
  }
  if (current.count >= opts.max) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((current.windowStart + opts.windowMs - now) / 1000)
    );
    return { ok: false, retryAfterSec };
  }
  current.count += 1;
  return { ok: true };
}

/** Auth session / login probing — per IP. */
export function limitAuthIp(ip: string): RateLimitResult {
  return checkRateLimit(`auth:ip:${ip || "unknown"}`, {
    windowMs: 60_000,
    max: 60,
  });
}

/** Invite create / email — per uid. */
export function limitInviteSend(uid: string): RateLimitResult {
  return checkRateLimit(`invite:uid:${uid}`, { windowMs: 60_000, max: 10 });
}

/** Secondary-email verification send — per uid. */
export function limitSecondaryEmailSend(uid: string): RateLimitResult {
  return checkRateLimit(`secondary-email:uid:${uid}`, {
    windowMs: 60_000,
    max: 3,
  });
}

/** Primary email verification resend — per uid (M3 wires the route). */
export function limitPrimaryEmailResend(uid: string): RateLimitResult {
  return checkRateLimit(`primary-email-resend:uid:${uid}`, {
    windowMs: 60_000,
    max: 1,
  });
}

export function rateLimitReply(
  reply: { code: (n: number) => { send: (b: unknown) => unknown; header?: (k: string, v: string) => unknown } },
  result: Extract<RateLimitResult, { ok: false }>
) {
  const r = reply.code(429);
  if (typeof r.header === "function") {
    r.header("retry-after", String(result.retryAfterSec));
  }
  return r.send({
    error: "too many requests",
    code: "rate_limited",
    retryAfterSec: result.retryAfterSec,
  });
}
