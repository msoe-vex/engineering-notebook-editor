import type { FastifyInstance } from "fastify";
import { userPath, type UserGrants, type UserProfile } from "@engineering-notebook/shared";
import { getFirestore } from "../db/firestore.js";
import { omitUndefined } from "../db/sanitize.js";
import { requireServiceAdmin } from "../rbac.js";
import { getUser } from "../http/authPlugin.js";
import { getMetrics } from "../metrics/store.js";

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get("/api/admin/metrics", async (request) => {
    requireServiceAdmin(getUser(request));
    const snapshot = getMetrics();
    const avgLatencyMs =
      snapshot.totalRequests === 0 ? 0 : snapshot.totalLatencyMs / snapshot.totalRequests;
    return {
      ...snapshot,
      averageLatencyMs: Number(avgLatencyMs.toFixed(2)),
    };
  });

  app.get("/api/admin/users", async (request) => {
    requireServiceAdmin(getUser(request));
    const snap = await getFirestore().collection("users").limit(200).get();
    return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  });

  app.get("/api/admin/users/:uid", async (request, reply) => {
    requireServiceAdmin(getUser(request));
    const { uid } = request.params as { uid: string };
    const snap = await getFirestore().doc(userPath(uid)).get();
    if (!snap.exists) return reply.code(404).send({ error: "not found" });
    return { uid, ...snap.data() };
  });

  app.patch("/api/admin/users/:uid", async (request, reply) => {
    requireServiceAdmin(getUser(request));
    const { uid } = request.params as { uid: string };
    const body = request.body as {
      platformRole?: "service_admin" | null;
      grants?: UserGrants;
      displayName?: string;
    };
    const ref = getFirestore().doc(userPath(uid));
    const snap = await ref.get();
    const existing = (snap.data() ?? {}) as Partial<UserProfile>;
    const updated = omitUndefined({
      uid,
      email: existing.email,
      displayName: body.displayName ?? existing.displayName,
      platformRole:
        body.platformRole === null
          ? undefined
          : (body.platformRole ?? existing.platformRole),
      grants: body.grants ?? existing.grants ?? {},
      createdAt: existing.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }) as UserProfile;
    await ref.set(updated, { merge: true });
    return updated;
  });

  app.get("/api/admin/orgs", async (request) => {
    requireServiceAdmin(getUser(request));
    const snap = await getFirestore().collection("organizations").get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
}
