import { FastifyRequest, FastifyReply } from "fastify";
import { getUserFromToken } from "../services/auth.service.js";
import { COOKIE_NAME } from "./auth.middleware.js";

/**
 * Guard — requires user to be authenticated AND have isAdmin: true.
 * Reads the same HTTP-only session cookie as the regular auth middleware.
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Accept Bearer token (cross-domain) or cookie (local dev)
  let token: string | undefined;
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    token = request.cookies?.[COOKIE_NAME];
  }

  if (!token) {
    reply.code(401).send({ error: "UNAUTHORIZED" });
    return;
  }

  const sessionUser = await getUserFromToken(token);
  if (!sessionUser) {
    reply.code(401).send({ error: "UNAUTHORIZED" });
    return;
  }

  // Attach user to request for downstream use
  request.user = sessionUser;
}
