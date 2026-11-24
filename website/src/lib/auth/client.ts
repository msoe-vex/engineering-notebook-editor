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

/**
 * Returns current bearer token for Core API & Collab WebSocket calls:
 * 1. Dev token override if set (e.g. "service-admin" or custom UID)
 * 2. Better Auth session JWT or token
 * 3. Fallback to Firebase Auth user token if available
 */
export async function getIdToken(): Promise<string | null> {
  const dev = getDevToken();
  if (dev) return dev;

  try {
    const session = await authClient.getSession();
    if (session?.data?.session?.token) {
      return session.data.session.token;
    }
  } catch {
    /* ignore */
  }

  // Graceful fallback to Firebase during transition
  try {
    const { getFirebaseAuth } = await import("@/lib/cloud/firebase");
    const current = getFirebaseAuth().currentUser;
    if (current) return await current.getIdToken();
  } catch {
    /* ignore */
  }

  return null;
}
