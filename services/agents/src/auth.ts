import { userPath, type UserGrants, type PlatformRole } from "@engineering-notebook/shared";

export type AgentUser = {
  uid: string;
  email?: string;
  platformRole?: PlatformRole;
  grants: UserGrants;
};

let adminMod: typeof import("firebase-admin") | null = null;

async function getAdmin() {
  if (!adminMod) {
    const admin = await import("firebase-admin");
    if (!admin.apps.length) {
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || "demo-engineering-notebook",
      });
    }
    adminMod = admin;
  }
  return adminMod;
}

export async function verifyBearer(authorization?: string): Promise<AgentUser> {
  const token = authorization?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) throw Object.assign(new Error("missing token"), { statusCode: 401 });

  let uid = token.split("|")[0];
  let email: string | undefined = token.includes("|") ? token.split("|")[1] : undefined;

  const fallback =
    process.env.AUTH_FALLBACK === "true" ||
    Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) ||
    !process.env.GOOGLE_APPLICATION_CREDENTIALS;

  try {
    const admin = await getAdmin();
    if (!fallback || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        uid = decoded.uid;
        email = decoded.email;
      } catch {
        if (!fallback) throw Object.assign(new Error("invalid token"), { statusCode: 401 });
      }
    }
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode) throw err;
  }

  let grants: UserGrants = {};
  let platformRole: PlatformRole | undefined;
  try {
    const admin = await getAdmin();
    const db = admin.firestore();
    const snap = await db.doc(userPath(uid)).get();
    if (snap.exists) {
      const data = snap.data() as { grants?: UserGrants; platformRole?: PlatformRole; email?: string };
      grants = data.grants ?? {};
      platformRole = data.platformRole;
      email = email ?? data.email;
    }
  } catch {
    /* profile optional */
  }

  if (uid === process.env.SERVICE_ADMIN_UID || uid === "service-admin") {
    platformRole = "service_admin";
  }

  return { uid, email, platformRole, grants };
}
