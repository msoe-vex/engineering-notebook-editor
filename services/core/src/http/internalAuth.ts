import type { FastifyRequest } from "fastify";

type ReplyLike = {
  code: (n: number) => { send: (b: unknown) => unknown };
};
type RequestLike = { headers: Record<string, unknown> };

function headerSecret(request: RequestLike): string {
  const raw = request.headers["x-internal-secret"];
  return typeof raw === "string" ? raw : Array.isArray(raw) ? String(raw[0] || "") : "";
}

/** True when Core may leave internal routes open without a shared secret (local only). */
export function allowInsecureInternal(): boolean {
  const isDev =
    process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  return isDev && process.env.ALLOW_INSECURE_INTERNAL === "1";
}

export function internalSecretConfigured(): boolean {
  return Boolean(process.env.INTERNAL_SERVICE_SECRET?.trim());
}

/**
 * Fail closed for worker/collab internal routes unless explicitly relaxed for local smoke.
 * - Production (and any non-dev): secret must be set and header must match.
 * - Development: set `ALLOW_INSECURE_INTERNAL=1` to skip when secret unset; if secret is set, still enforce match.
 */
export function assertInternalSecret(
  request: RequestLike | FastifyRequest,
  reply: ReplyLike
): unknown | null {
  const secret = process.env.INTERNAL_SERVICE_SECRET?.trim() || "";
  const provided = headerSecret(request as RequestLike);

  if (!secret) {
    if (allowInsecureInternal()) return null;
    return reply.code(403).send({
      error: "forbidden",
      code: "internal_secret_required",
    });
  }

  if (provided !== secret) {
    return reply.code(403).send({
      error: "forbidden",
      code: "internal_secret_invalid",
    });
  }
  return null;
}

/** Call once at boot. Fatal in production when secret missing. */
export function assertInternalSecretBootConfig(log: {
  warn: (obj: unknown, msg?: string) => void;
  fatal?: (obj: unknown, msg?: string) => void;
}): void {
  if (internalSecretConfigured()) return;
  if (process.env.NODE_ENV === "production") {
    const err = new Error(
      "INTERNAL_SERVICE_SECRET is required when NODE_ENV=production"
    );
    if (log.fatal) log.fatal(err);
    throw err;
  }
  if (allowInsecureInternal()) {
    log.warn(
      { allowInsecureInternal: true },
      "[core] INTERNAL_SERVICE_SECRET unset; ALLOW_INSECURE_INTERNAL=1 — internal routes are open (local only)"
    );
    return;
  }
  log.warn(
    "[core] INTERNAL_SERVICE_SECRET unset — internal routes will return 403. Set the secret (Compose default) or ALLOW_INSECURE_INTERNAL=1 for local-only open internals."
  );
}
