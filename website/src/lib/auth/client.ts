"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL:
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
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

type SessionPayload = {
  session?: { token?: string; expiresAt?: string | Date } | null;
  user?: unknown;
} | null;

type SessionAtomValue = {
  data: SessionPayload;
  error: unknown;
  isPending: boolean;
  isRefetching: boolean;
  refetch: (queryParams?: unknown) => Promise<void>;
};

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let inFlightTokenPromise: Promise<string | null> | null = null;

export function clearIdTokenCache(): void {
  cachedToken = null;
  tokenExpiresAt = 0;
}

/** Seed bearer cache from Better Auth session atom / useSession data (no network). */
export function seedIdTokenFromSession(payload: SessionPayload): void {
  const s = payload?.session;
  if (!s?.token) return;
  cachedToken = s.token;
  const now = Date.now();
  const expiry = s.expiresAt ? new Date(s.expiresAt).getTime() : 0;
  tokenExpiresAt = expiry > now ? expiry : now + 60_000;
}

function readSessionAtom(): SessionAtomValue | null {
  try {
    const atom = authClient.$store?.atoms?.session;
    if (!atom || typeof atom.get !== "function") return null;
    return atom.get() as SessionAtomValue;
  } catch {
    return null;
  }
}

/** Synchronous peek at the shared session atom (no network). */
export function peekSession(): SessionPayload {
  return readSessionAtom()?.data ?? null;
}

function tokenFromPayload(payload: SessionPayload, now: number): string | null {
  const s = payload?.session;
  if (!s?.token) return null;
  cachedToken = s.token;
  const expiry = s.expiresAt ? new Date(s.expiresAt).getTime() : 0;
  tokenExpiresAt = expiry > now ? expiry : now + 60_000;
  return cachedToken;
}

function waitForSessionAtom(timeoutMs = 15_000): Promise<SessionAtomValue | null> {
  const atom = authClient.$store?.atoms?.session;
  if (!atom || typeof atom.subscribe !== "function") {
    return Promise.resolve(readSessionAtom());
  }
  const current = atom.get() as SessionAtomValue;
  if (!current.isPending && !current.isRefetching) {
    return Promise.resolve(current);
  }
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      unsub();
      resolve(atom.get() as SessionAtomValue);
    }, timeoutMs);
    const unsub = atom.subscribe((value: SessionAtomValue) => {
      if (!value.isPending && !value.isRefetching) {
        window.clearTimeout(timer);
        unsub();
        resolve(value);
      }
    });
  });
}

/**
 * Returns current bearer token for Core API & Collab WebSocket calls:
 * 1. Dev token override if set
 * 2. In-memory cache
 * 3. Better Auth session atom (same source as useSession) — waits if pending
 * 4. Fallback `getSession()` only when the atom is unavailable / never subscribed
 *
 * Concurrent callers share one in-flight resolution so home load does not
 * stack a second `/api/auth/get-session` beside `useSession`.
 */
export async function getIdToken(): Promise<string | null> {
  const dev = getDevToken();
  if (dev) return dev;

  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 30_000) {
    return cachedToken;
  }

  if (inFlightTokenPromise) {
    return inFlightTokenPromise;
  }

  inFlightTokenPromise = (async () => {
    try {
      const atomNow = readSessionAtom();
      if (atomNow) {
        if (!atomNow.isPending && !atomNow.isRefetching) {
          const fromAtom = tokenFromPayload(atomNow.data, Date.now());
          if (fromAtom) return fromAtom;
          if (atomNow.data === null) {
            cachedToken = null;
            tokenExpiresAt = 0;
            return null;
          }
        } else {
          const settled = await waitForSessionAtom();
          if (settled) {
            const fromAtom = tokenFromPayload(settled.data, Date.now());
            if (fromAtom) return fromAtom;
            if (settled.data === null) {
              cachedToken = null;
              tokenExpiresAt = 0;
              return null;
            }
          }
        }
      }

      // Fallback: no live atom subscriber (e.g. early call outside SessionProvider).
      const res = await authClient.getSession();
      const payload = (res?.data ?? null) as SessionPayload;
      const token = tokenFromPayload(payload, Date.now());
      if (token) return token;
      cachedToken = null;
      tokenExpiresAt = 0;
      return null;
    } catch {
      cachedToken = null;
      tokenExpiresAt = 0;
      return null;
    } finally {
      inFlightTokenPromise = null;
    }
  })();

  return inFlightTokenPromise;
}
