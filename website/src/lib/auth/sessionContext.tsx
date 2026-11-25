"use client";

import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import {
  useSession as useBetterAuthSession,
  seedIdTokenFromSession,
  clearIdTokenCache,
} from "@/lib/auth/client";

export type AppSessionState = ReturnType<typeof useBetterAuthSession>;

const SessionContext = createContext<AppSessionState | null>(null);

/**
 * Single Better Auth `useSession` subscriber for the app tree.
 * Mount once near the root of authenticated chrome so `/api/auth/get-session`
 * is driven by the shared session atom — not by parallel `getSession()` calls.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useBetterAuthSession();

  useEffect(() => {
    seedIdTokenFromSession(session.data);
    if (!session.isPending && !session.data) {
      clearIdTokenCache();
    }
  }, [session.data, session.isPending]);

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

/** Shared session from {@link SessionProvider}. */
export function useAppSession(): AppSessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useAppSession must be used within SessionProvider");
  }
  return ctx;
}
