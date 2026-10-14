import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthPort, SessionUser } from "../auth/authPort.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser;
  }
}

export function createAuthGuard(auth: AuthPort) {
  return async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    const header = request.headers.authorization;
    const token = typeof header === "string" ? header.replace(/^Bearer\s+/i, "") : "";
    if (!token) {
      return reply.code(401).send({ error: "missing token" });
    }
    try {
      request.user = await auth.verifySession(token);
    } catch {
      return reply.code(401).send({ error: "invalid token" });
    }
  };
}

export function getUser(request: FastifyRequest): SessionUser {
  if (!request.user) {
    const err = new Error("unauthorized");
    (err as Error & { statusCode: number }).statusCode = 401;
    throw err;
  }
  return request.user;
}
