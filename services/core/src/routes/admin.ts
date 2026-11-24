import type { FastifyInstance } from "fastify";
import { userPath, type UserGrants, type UserProfile } from "@engineering-notebook/shared";
import { getMetadataStore } from "../db/metadataStore.js";
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

  app.get("/api/admin/user", async (request) => {
    requireServiceAdmin(getUser(request));
    const rows = await getMetadataStore().query("user", { limit: 200 });
    return rows.map((d) => {
      const { id, name, ...rest } = d;
      return {
        uid: id,
        displayName: (d.displayName as string | undefined) || (name as string | undefined),
        ...rest,
      };
    });
  });

  app.get("/api/admin/user/:uid", async (request, reply) => {
    requireServiceAdmin(getUser(request));
    const { uid } = request.params as { uid: string };
    const data = await getMetadataStore().get(userPath(uid));
    if (!data) return reply.code(404).send({ error: "not found" });
    return { uid, ...data };
  });

  app.patch("/api/admin/user/:uid", async (request, reply) => {
    const caller = getUser(request);
    requireServiceAdmin(caller);
    const { uid } = request.params as { uid: string };
    const body = request.body as {
      platformRole?: "service_admin" | null;
      grants?: UserGrants;
      displayName?: string;
    };

    // Prevent self-demotion
    if (caller.uid === uid && body.platformRole === null) {
      return reply.code(400).send({ error: "Cannot demote yourself from service admin" });
    }

    const existing = ((await getMetadataStore().get(userPath(uid))) ?? {}) as Partial<UserProfile>;
    const updated: Record<string, unknown> = {
      ...existing,
      uid,
      displayName: body.displayName ?? existing.displayName,
      updatedAt: new Date().toISOString(),
    };

    if (body.platformRole === null) {
      delete updated.platformRole;
    } else if (body.platformRole !== undefined) {
      updated.platformRole = body.platformRole;
    }

    if (body.grants !== undefined) {
      updated.grants = body.grants;
    }

    await getMetadataStore().set(userPath(uid), updated, {
      merge: false,
    });
    return updated;
  });

  app.delete("/api/admin/user/:uid", async (request, reply) => {
    const caller = getUser(request);
    requireServiceAdmin(caller);
    const { uid } = request.params as { uid: string };

    // Prevent deleting oneself
    if (caller.uid === uid) {
      return reply.code(400).send({ error: "Cannot delete your own account" });
    }

    // Only allow user deletion in dev / non-prod environments or when DEV_ADMIN_DELETE=true
    const isDev = process.env.NODE_ENV !== "production" || process.env.DEV_ADMIN_DELETE === "true";
    if (!isDev) {
      return reply.code(403).send({ error: "User deletion is only available in development mode" });
    }

    await getMetadataStore().delete(userPath(uid));
    return { status: "deleted", uid };
  });

  app.get("/api/admin/org", async (request) => {
    requireServiceAdmin(getUser(request));
    const orgRows = await getMetadataStore().query("org", { limit: 100 });
    return Promise.all(
      orgRows.map(async (row) => {
        const orgId = String(row.id);
        const [membersCount, notebooksCount] = await Promise.all([
          getMetadataStore().count?.(`org/${orgId}/member`) ?? 0,
          getMetadataStore().count?.(`org/${orgId}/notebook`) ?? 0,
        ]).catch(() => [0, 0]);
        return {
          ...row,
          membersCount,
          notebooksCount,
        };
      })
    );
  });
}
