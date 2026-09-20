import type { AuthPort, SessionUser } from "./authPort.js";

/**
 * Placeholder adapter used until Firebase Admin SDK wiring is added.
 */
export class FirebaseAuthAdapter implements AuthPort {
  async verifySession(token: string): Promise<SessionUser> {
    const uid = token.trim();
    if (!uid) throw new Error("invalid session token");
    return {
      uid,
      platformRole: uid === "service-admin" ? "service_admin" : undefined,
      grants: {},
    };
  }
}
