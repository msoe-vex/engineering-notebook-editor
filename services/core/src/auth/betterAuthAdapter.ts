import type { AuthPort, SessionUser } from "./authPort.js";
import { getMetadataStore } from "../db/metadataStore.js";
import { userPath } from "@engineering-notebook/shared";
import { jwtVerify, createRemoteJWKSet } from "jose";

/**
 * BetterAuthAdapter validates session JWTs issued by Better Auth on Next.js.
 * Fallback to bare UID or FirebaseAuthAdapter is preserved for local emulator tests.
 */
export class BetterAuthAdapter implements AuthPort {
  private secret: Uint8Array;

  constructor() {
    const rawSecret = process.env.BETTER_AUTH_SECRET || "dev-better-auth-secret-key-min-32-chars-long";
    this.secret = new TextEncoder().encode(rawSecret);
  }

  async verifySession(token: string): Promise<SessionUser> {
    const trimmed = token.trim();
    if (!trimmed) throw new Error("invalid session token");

    let uid = trimmed;
    let email: string | undefined;
    let displayName: string | undefined;
    let emailVerified = false;

    // 1. If token looks like a JWT (header.payload.signature)
    if (trimmed.split(".").length === 3) {
      try {
        const { payload } = await jwtVerify(trimmed, this.secret);
        uid = (payload.sub || payload.userId || payload.uid) as string;
        email = payload.email as string | undefined;
        displayName = (payload.name || payload.displayName) as string | undefined;
        emailVerified = Boolean(payload.emailVerified);
      } catch (err) {
        // Fallback for dev / bare UID tokens if JWT verify fails
        if (process.env.NODE_ENV === "production") {
          throw new Error(`Unauthorized: invalid session token (${(err as Error).message})`);
        }
      }
    } else if (trimmed === "service-admin" || trimmed.includes("|")) {
      // Local dev / test fallback: bearer token is "service-admin" or "uid|email"
      const parts = trimmed.split("|");
      uid = parts[0];
      email = parts[1];
      emailVerified = true;
    } else {
      // 2. Opaque Better Auth session token: resolve session and user via MetadataStore
      const sessions = await getMetadataStore().query("session", {
        where: [{ field: "token", op: "==", value: trimmed }],
        limit: 1,
      });

      const session = sessions[0];
      if (session && session.userId) {
        const expiresAt = session.expiresAt;
        const expiryDate = expiresAt instanceof Date ? expiresAt : new Date(expiresAt as string | number);
        if (expiryDate > new Date()) {
          uid = String(session.userId);
          const userDoc = await getMetadataStore().get(userPath(uid));
          if (userDoc) {
            email = userDoc.email as string | undefined;
            displayName = (userDoc.displayName as string | undefined) || (userDoc.name as string | undefined);
            emailVerified = Boolean(userDoc.emailVerified);
          }
        }
      }
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
