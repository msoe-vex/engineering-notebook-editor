import type { FastifyInstance } from "fastify";
import { userPath, type UserProfile } from "@engineering-notebook/shared";
import { getFirestore } from "../db/firestore.js";
import { omitUndefined } from "../db/sanitize.js";
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
    const isAdmin =
      (serviceAdminUid && user.uid === serviceAdminUid) || user.uid === "service-admin";
    const profile = omitUndefined({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      platformRole: isAdmin ? ("service_admin" as const) : undefined,
      grants: {},
      createdAt: ts,
      updatedAt: ts,
    }) as UserProfile;
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
