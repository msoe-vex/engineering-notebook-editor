import type { Firestore } from "firebase-admin/firestore";

let db: Firestore | null = null;
let initPromise: Promise<Firestore> | null = null;

export function getFirestore(): Firestore {
  if (!db) {
    throw new Error("Firestore not initialized — call initFirestore() at startup");
  }
  return db;
}

export async function initFirestore(): Promise<Firestore> {
  if (db) return db;
  if (!initPromise) {
    initPromise = (async () => {
      // FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST are auto-detected by the Admin SDK.
      const admin = await import("firebase-admin");
      if (!admin.apps.length) {
        admin.initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID || "demo-engineering-notebook",
        });
      }
      db = admin.firestore();
      // Optional fields (email, isTemplate, …) must not be written as undefined.
      db.settings({ ignoreUndefinedProperties: true });
      return db;
    })();
  }
  return initPromise;
}
