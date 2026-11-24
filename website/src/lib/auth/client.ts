"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
});

export const {
  signIn,
  signOut,
  signUp,
  useSession,
  linkSocial,
} = authClient;

const DEV_TOKEN_KEY = "ene_dev_bearer_token";

export function getDevToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(DEV_TOKEN_KEY) || window.localStorage.getItem(DEV_TOKEN_KEY);
}

export function setDevToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    window.sessionStorage.setItem(DEV_TOKEN_KEY, token);
  } else {
    window.sessionStorage.removeItem(DEV_TOKEN_KEY);
    window.localStorage.removeItem(DEV_TOKEN_KEY);
  }
}

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let inFlightSessionPromise: Promise<string | null> | null = null;

/**
 * Returns current bearer token for Core API & Collab WebSocket calls:
 * 1. Dev token override if set (e.g. "service-admin" or custom UID)
 * 2. Better Auth session token (cached using session.expiresAt, with in-flight deduplication)
 */
export async function getIdToken(): Promise<string | null> {
  const dev = getDevToken();
  if (dev) return dev;

  const now = Date.now();
  // Valid token cached in memory (leaving 30s buffer before expiration)
  if (cachedToken && now < tokenExpiresAt - 30_000) {
    return cachedToken;
  }

  // Deduplicate concurrent calls so bursts of requests only make a single /api/auth/get-session call
  if (inFlightSessionPromise) {
    return inFlightSessionPromise;
  }

  inFlightSessionPromise = (async () => {
    try {
      const res = await authClient.getSession();
      const s = res?.data?.session;
      if (s?.token) {
        cachedToken = s.token;
        const expiry = s.expiresAt ? new Date(s.expiresAt).getTime() : 0;
        tokenExpiresAt = expiry > now ? expiry : now + 60_000;
        return cachedToken;
      }
      cachedToken = null;
      tokenExpiresAt = 0;
      return null;
    } catch {
      cachedToken = null;
      tokenExpiresAt = 0;
      return null;
    } finally {
      inFlightSessionPromise = null;
    }
  })();

  return inFlightSessionPromise;
}
