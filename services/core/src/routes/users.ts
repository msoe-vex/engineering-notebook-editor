import type { FastifyInstance } from "fastify";
import { userPath, type UserProfile } from "@engineering-notebook/shared";
import { getFirestore } from "../db/firestore.js";
import { getUser } from "../http/authPlugin.js";

export async function registerUserRoutes(app: FastifyInstance) {
  app.post("/users/me/bootstrap", async (request) => {
    const user = getUser(request);
    const ref = getFirestore().doc(userPath(user.uid));
    const snap = await ref.get();
    const ts = new Date().toISOString();
    if (snap.exists) {
      const data = snap.data() as UserProfile;
      return data;
    }
    const serviceAdminUid = process.env.SERVICE_ADMIN_UID;
    const profile: UserProfile = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      platformRole:
        (serviceAdminUid && user.uid === serviceAdminUid) || user.uid === "service-admin"
          ? "service_admin"
          : undefined,
      grants: {},
      createdAt: ts,
      updatedAt: ts,
    };
    await ref.set(profile);
    return profile;
  });

  app.get("/users/me", async (request, reply) => {
    const user = getUser(request);
    const snap = await getFirestore().doc(userPath(user.uid)).get();
    if (!snap.exists) {
      return reply.code(404).send({ error: "bootstrap required" });
    }
    return snap.data();
  });
}
