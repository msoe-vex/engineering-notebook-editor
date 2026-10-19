import type { FastifyInstance } from "fastify";
import {
  userPath,
  type UserPreferences,
  type UserProfile,
} from "@engineering-notebook/shared";
import { getFirestore } from "../db/firestore.js";
import { omitUndefined } from "../db/sanitize.js";
import { getUser } from "../http/authPlugin.js";

function sanitizePreferences(raw: unknown): UserPreferences | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const body = raw as Record<string, unknown>;
  const prefs: UserPreferences = {};
  if (body.theme === "light" || body.theme === "dark" || body.theme === "system") {
    prefs.theme = body.theme;
  }
  if (Array.isArray(body.defaultAuthors)) {
    prefs.defaultAuthors = body.defaultAuthors
      .filter((a): a is string => typeof a === "string")
      .map((a) => a.trim())
      .filter(Boolean)
      .slice(0, 64);
  }
  if (body.genai && typeof body.genai === "object") {
    const g = body.genai as Record<string, unknown>;
    // Never accept API keys from the client into Firestore.
    prefs.genai = omitUndefined({
      enabled: typeof g.enabled === "boolean" ? g.enabled : undefined,
      provider: typeof g.provider === "string" ? g.provider : undefined,
      models:
        g.models && typeof g.models === "object" && !Array.isArray(g.models)
          ? Object.fromEntries(
              Object.entries(g.models as Record<string, unknown>).filter(
                ([, v]) => typeof v === "string"
              ) as [string, string][]
            )
          : undefined,
      baseUrls:
        g.baseUrls && typeof g.baseUrls === "object" && !Array.isArray(g.baseUrls)
          ? Object.fromEntries(
              Object.entries(g.baseUrls as Record<string, unknown>).filter(
                ([, v]) => typeof v === "string"
              ) as [string, string][]
            )
          : undefined,
    });
  }
  if (typeof body.lastOrgId === "string") prefs.lastOrgId = body.lastOrgId;
  if (body.explorerSort && typeof body.explorerSort === "object") {
    const s = body.explorerSort as Record<string, unknown>;
    if (
      (s.by === "date" || s.by === "title" || s.by === "order") &&
      (s.direction === "asc" || s.direction === "desc")
    ) {
      prefs.explorerSort = { by: s.by, direction: s.direction };
    }
  }
  return prefs;
}

export async function registerUserRoutes(app: FastifyInstance) {
  app.post("/users/me/bootstrap", async (request) => {
    const user = getUser(request);
    const body = (request.body as { displayName?: string } | undefined) ?? {};
    const displayName = body.displayName?.trim() || user.displayName;
    const ref = getFirestore().doc(userPath(user.uid));
    const snap = await ref.get();
    const ts = new Date().toISOString();
    if (snap.exists) {
      const data = snap.data() as UserProfile;
      if (displayName && !data.displayName) {
        await ref.update({ displayName, updatedAt: ts });
        data.displayName = displayName;
      }
      return data;
    }
    const serviceAdminUid = process.env.SERVICE_ADMIN_UID;
    const isAdmin =
      (serviceAdminUid && user.uid === serviceAdminUid) || user.uid === "service-admin";
    const profile = omitUndefined({
      uid: user.uid,
      email: user.email,
      displayName,
      platformRole: isAdmin ? ("service_admin" as const) : undefined,
      grants: {},
      preferences: {},
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

  app.patch("/users/me", async (request, reply) => {
    const user = getUser(request);
    const ref = getFirestore().doc(userPath(user.uid));
    const snap = await ref.get();
    if (!snap.exists) {
      return reply.code(404).send({ error: "bootstrap required" });
    }
    const existing = snap.data() as UserProfile;
    const body = (request.body ?? {}) as {
      displayName?: string;
      preferences?: unknown;
    };
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (typeof body.displayName === "string") {
      patch.displayName = body.displayName.trim() || undefined;
    }
    if (body.preferences !== undefined) {
      const next = sanitizePreferences(body.preferences);
      // Shallow-merge top-level preference keys; replace genai object when provided.
      patch.preferences = omitUndefined({
        ...(existing.preferences || {}),
        ...(next || {}),
        genai:
          next?.genai !== undefined
            ? { ...(existing.preferences?.genai || {}), ...next.genai }
            : existing.preferences?.genai,
      });
    }
    await ref.update(omitUndefined(patch));
    const updated = await ref.get();
    return updated.data();
  });
}
