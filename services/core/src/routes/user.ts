import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import {
  userPath,
  type SecondaryEmail,
  type UserPreferences,
  type UserProfile,
} from "@engineering-notebook/shared";
import { getMetadataStore } from "../db/metadataStore.js";
import { omitUndefined } from "../db/sanitize.js";
import { getUser } from "../http/authPlugin.js";
import {
  limitPrimaryEmailResend,
  limitSecondaryEmailSend,
  rateLimitReply,
} from "../http/rateLimit.js";
import {
  parseBody,
  secondaryEmailSchema,
  secondaryEmailVerifySchema,
} from "../http/validate.js";
import type { NotificationPort } from "../notifications/notificationPort.js";

function publicSecondaryEmails(list: SecondaryEmail[] | undefined) {
  return (list || []).map(({ email, verified, verifiedAt, addedAt }) => ({
    email,
    verified,
    verifiedAt,
    addedAt,
  }));
}

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

export async function registerUserRoutes(
  app: FastifyInstance,
  notifications: NotificationPort
) {
  const store = () => getMetadataStore();

  app.post("/user/me/bootstrap", async (request) => {
    const user = getUser(request);
    const body = (request.body as { displayName?: string } | undefined) ?? {};
    const displayName = body.displayName?.trim() || user.displayName;
    const path = userPath(user.uid);
    const existing = (await store().get(path)) as UserProfile | null;
    const ts = new Date().toISOString();
    if (existing) {
      const updates: Partial<UserProfile> = {};
      if (displayName && !existing.displayName) {
        updates.displayName = displayName;
        existing.displayName = displayName;
      }
      if (user.email && !existing.email) {
        updates.email = user.email;
        existing.email = user.email;
      }
      if (Object.keys(updates).length > 0) {
        await store().set(path, { ...existing, ...updates, updatedAt: ts }, { merge: true });
      }
      return existing;
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
    await store().set(path, profile as unknown as Record<string, unknown>);
    return profile;
  });

  app.get("/user/me", async (request, reply) => {
    const user = getUser(request);
    const profile = (await store().get(userPath(user.uid))) as UserProfile | null;
    if (!profile) {
      return reply.code(404).send({ error: "bootstrap required" });
    }
    return {
      ...profile,
      secondaryEmails: publicSecondaryEmails(profile.secondaryEmails),
    };
  });

  /**
   * Rate-limit gate for primary email verification resend (IdP/Better Auth still sends the mail).
   */
  app.post("/user/me/verification/resend-gate", async (request, reply) => {
    const user = getUser(request);
    const limited = limitPrimaryEmailResend(user.uid);
    if (!limited.ok) return rateLimitReply(reply, limited);
    return { ok: true, cooldownSec: 60 };
  });

  app.post("/user/me/secondary-emails", async (request, reply) => {
    const user = getUser(request);
    const limited = limitSecondaryEmailSend(user.uid);
    if (!limited.ok) return rateLimitReply(reply, limited);
    const path = userPath(user.uid);
    const profile = (await store().get(path)) as UserProfile | null;
    if (!profile) return reply.code(404).send({ error: "bootstrap required" });
    const body = parseBody(secondaryEmailSchema, request.body, reply);
    if (!body) return;
    const email = body.email.trim().toLowerCase();
    const primary = (user.email || profile.email || "").trim().toLowerCase();
    if (email === primary) {
      return reply.code(400).send({ error: "email is already your primary" });
    }
    const existing = profile.secondaryEmails || [];
    if (existing.some((e) => e.email === email)) {
      return reply.code(400).send({ error: "email already added" });
    }
    const verifyToken = randomUUID();
    const entry: SecondaryEmail = {
      email,
      verified: false,
      verifyToken,
      addedAt: new Date().toISOString(),
    };
    const next = [...existing, entry];
    await store().set(
      path,
      { ...profile, secondaryEmails: next, updatedAt: new Date().toISOString() } as unknown as Record<
        string,
        unknown
      >,
      { merge: true }
    );
    const site = (process.env.PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
    const verifyUrl = `${site}/account?verifyEmail=${encodeURIComponent(verifyToken)}`;
    try {
      await notifications.send({
        to: email,
        template: "secondary_email_verify",
        data: { verifyUrl, siteUrl: site },
      });
    } catch (err) {
      request.log.warn({ err }, "secondary email verify send failed");
    }
    return { secondaryEmails: publicSecondaryEmails(next) };
  });

  app.post("/user/me/secondary-emails/verify", async (request, reply) => {
    const user = getUser(request);
    const path = userPath(user.uid);
    const profile = (await store().get(path)) as UserProfile | null;
    if (!profile) return reply.code(404).send({ error: "bootstrap required" });
    const body = parseBody(secondaryEmailVerifySchema, request.body, reply);
    if (!body) return;
    const token = body.token;
    const list = profile.secondaryEmails || [];
    const idx = list.findIndex((e) => e.verifyToken === token);
    if (idx < 0) return reply.code(404).send({ error: "invalid token" });
    const next = list.map((e, i) =>
      i === idx
        ? {
            ...e,
            verified: true,
            verifiedAt: new Date().toISOString(),
            verifyToken: undefined,
          }
        : e
    );
    await store().set(
      path,
      { ...profile, secondaryEmails: next, updatedAt: new Date().toISOString() } as unknown as Record<
        string,
        unknown
      >,
      { merge: true }
    );
    return { secondaryEmails: publicSecondaryEmails(next) };
  });

  app.delete("/user/me/secondary-emails/:email", async (request, reply) => {
    const user = getUser(request);
    const path = userPath(user.uid);
    const profile = (await store().get(path)) as UserProfile | null;
    if (!profile) return reply.code(404).send({ error: "bootstrap required" });
    const email = decodeURIComponent((request.params as { email: string }).email)
      .trim()
      .toLowerCase();
    const next = (profile.secondaryEmails || []).filter((e) => e.email !== email);
    await store().set(
      path,
      { ...profile, secondaryEmails: next, updatedAt: new Date().toISOString() } as unknown as Record<
        string,
        unknown
      >,
      { merge: true }
    );
    return { secondaryEmails: publicSecondaryEmails(next) };
  });

  app.patch("/user/me", async (request, reply) => {
    const user = getUser(request);
    const path = userPath(user.uid);
    const existing = (await store().get(path)) as UserProfile | null;
    if (!existing) {
      return reply.code(404).send({ error: "bootstrap required" });
    }
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
      patch.preferences = omitUndefined({
        ...(existing.preferences || {}),
        ...(next || {}),
        genai:
          next?.genai !== undefined
            ? { ...(existing.preferences?.genai || {}), ...next.genai }
            : existing.preferences?.genai,
      });
    }
    const merged = omitUndefined({ ...existing, ...patch }) as UserProfile;
    await store().set(path, merged as unknown as Record<string, unknown>, { merge: true });
    return merged;
  });
}
