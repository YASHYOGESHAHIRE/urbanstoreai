import { FastifyRequest, FastifyReply } from "fastify";
import { getUserFromToken } from "../services/auth.service.js";
import { SafeUser } from "../services/auth.service.js";

export const COOKIE_NAME = "urban_session";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

// Augment Fastify request type
declare module "fastify" {
  interface FastifyRequest {
    user: SafeUser | null;
  }
}

export async function attachUser(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  // Try Bearer token first (cross-domain deployments)
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    request.user = await getUserFromToken(token);
    return;
  }
  // Fall back to cookie (local dev / same-domain)
  const token = request.cookies?.[COOKIE_NAME];
  if (!token) { request.user = null; return; }
  request.user = await getUserFromToken(token);
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    const hasToken = !!request.headers.authorization || !!request.cookies?.[COOKIE_NAME];
    reply.code(401).send({
      error: hasToken ? "TOKEN_EXPIRED" : "TOKEN_MISSING",
      message: hasToken
        ? "Your session has expired. Please log in again."
        : "Authentication required. Please log in.",
      loginUrl: `${FRONTEND_URL}/login`,
    });
  }
}
