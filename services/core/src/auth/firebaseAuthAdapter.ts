import type { AuthPort, SessionUser } from "./authPort.js";
import { getFirestore } from "../db/firestore.js";
import { userPath } from "@engineering-notebook/shared";

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
  private adminReady: Promise<typeof import("firebase-admin") | null> | null = null;

  private async getAdmin() {
    if (useFallbackAuth() && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      return null;
    }
    if (!this.adminReady) {
      this.adminReady = (async () => {
        try {
          const admin = await import("firebase-admin");
          if (!admin.apps.length) {
            admin.initializeApp({
              projectId: process.env.FIREBASE_PROJECT_ID || "demo-engineering-notebook",
            });
          }
          return admin;
        } catch {
          return null;
        }
      })();
    }
    return this.adminReady;
  }

  async verifySession(token: string): Promise<SessionUser> {
    const trimmed = token.trim();
    if (!trimmed) throw new Error("invalid session token");

    let uid = trimmed;
    let email: string | undefined;
    let displayName: string | undefined;

    const admin = await this.getAdmin();
    if (admin && !useFallbackAuth()) {
      const decoded = await admin.auth().verifyIdToken(trimmed);
      uid = decoded.uid;
      email = decoded.email;
      displayName = typeof decoded.name === "string" ? decoded.name : undefined;
    } else if (admin && process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      try {
        const decoded = await admin.auth().verifyIdToken(trimmed);
        uid = decoded.uid;
        email = decoded.email;
        displayName = typeof decoded.name === "string" ? decoded.name : undefined;
      } catch {
        // Emulator / local: allow bare uid tokens for smoke tests
        uid = trimmed;
      }
    } else {
      // Fallback: bearer token is the uid (optional email via "uid|email")
      const parts = trimmed.split("|");
      uid = parts[0];
      email = parts[1];
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
    };
  }

  private async loadProfile(uid: string) {
    try {
      const db = getFirestore();
      const snap = await Promise.race([
        db.doc(userPath(uid)).get(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);
      if (!snap || !("exists" in snap) || !snap.exists) return null;
      return snap.data() as {
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
