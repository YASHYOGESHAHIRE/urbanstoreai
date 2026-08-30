import { FastifyRequest, FastifyReply } from "fastify";
import { getUserFromToken } from "../services/auth.service.js";
import { SafeUser } from "../services/auth.service.js";

export const COOKIE_NAME = "urban_session";

// Augment Fastify request type
declare module "fastify" {
  interface FastifyRequest {
    user: SafeUser | null;
  }
}

/**
 * Prehandler hook — reads the HTTP-only session cookie, validates the session,
 * and attaches the authenticated user to request.user.
 * Never trusts userId from the request body/query.
 */
export async function attachUser(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const token = request.cookies?.[COOKIE_NAME];
  if (!token) {
    request.user = null;
    return;
  }
  request.user = await getUserFromToken(token);
}

/**
 * Guard hook — call this on routes that require authentication.
 * Returns 401 if no valid session.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    reply.code(401).send({ error: "UNAUTHORIZED" });
  }
}
