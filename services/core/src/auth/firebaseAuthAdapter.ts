import type { AuthPort, SessionUser } from "./authPort.js";
import { getMetadataStore } from "../db/metadataStore.js";
import { userPath } from "@engineering-notebook/shared";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

function useFallbackAuth(): boolean {
  if (process.env.AUTH_FALLBACK === "true") return true;
  if (process.env.AUTH_FALLBACK === "false") return false;
  // Default: emulator or missing credentials → fallback bearer-as-uid
  return Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) || !process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

/**
 * Firebase Admin ID-token verification with local fallback for docker-compose.
 */
export class FirebaseAuthAdapter implements AuthPort {
  private authReady: Promise<Auth | null> | null = null;

  private async getAuthInstance(): Promise<Auth | null> {
    if (useFallbackAuth() && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      return null;
    }
    if (!this.authReady) {
      this.authReady = (async () => {
        try {
          if (!getApps().length) {
            initializeApp({
              projectId: process.env.FIREBASE_PROJECT_ID || "demo-engineering-notebook",
            });
          }
          return getAuth();
        } catch {
          return null;
        }
      })();
    }
    return this.authReady;
  }

  async verifySession(token: string): Promise<SessionUser> {
    const trimmed = token.trim();
    if (!trimmed) throw new Error("invalid session token");

    let uid = trimmed;
    let email: string | undefined;
    let displayName: string | undefined;

    let emailVerified = false;

    const auth = await this.getAuthInstance();
    if (auth && !useFallbackAuth()) {
      const decoded = await auth.verifyIdToken(trimmed);
      uid = decoded.uid;
      email = decoded.email;
      displayName = typeof decoded.name === "string" ? decoded.name : undefined;
      emailVerified = Boolean(decoded.email_verified);
    } else if (auth && process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      try {
        const decoded = await auth.verifyIdToken(trimmed);
        uid = decoded.uid;
        email = decoded.email;
        displayName = typeof decoded.name === "string" ? decoded.name : undefined;
        emailVerified = Boolean(decoded.email_verified);
      } catch {
        // Emulator / local: allow bare uid tokens for smoke tests
        uid = trimmed;
        emailVerified = true;
      }
    } else {
      // Fallback: bearer token is the uid (optional email via "uid|email")
      const parts = trimmed.split("|");
      uid = parts[0];
      email = parts[1];
      emailVerified = true;
    }

    const profile = await this.loadProfile(uid);
    const serviceAdminUid = process.env.SERVICE_ADMIN_UID;
    const platformRole =
      profile?.platformRole ??
      (serviceAdminUid && uid === serviceAdminUid ? "service_admin" : undefined) ??
      (uid === "service-admin" ? "service_admin" : undefined);

    return {
      uid,
      email: email ?? profile?.email,
      displayName: displayName ?? profile?.displayName,
      platformRole,
      grants: profile?.grants ?? {},
      emailVerified,
    };
  }

  private async loadProfile(uid: string) {
    try {
      const profile = await Promise.race([
        getMetadataStore().get(userPath(uid)),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);
      if (!profile) return null;
      return profile as {
        email?: string;
        displayName?: string;
        platformRole?: "service_admin";
        grants?: { platformAi?: boolean };
      };
    } catch {
      return null;
    }
  }
}
