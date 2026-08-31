import { FastifyRequest, FastifyReply } from "fastify";
import { getUserFromToken } from "../services/auth.service.js";
import { COOKIE_NAME } from "./auth.middleware.js";
import { prisma } from "../db/prisma.js";

/**
 * Guard — requires user to be authenticated AND have isAdmin: true.
 *
 * Set ADMIN_OPEN=true in .env to bypass the isAdmin check (demo/dev only).
 * Never set this in production.
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

  // Skip isAdmin check only when ADMIN_OPEN=true (demo mode)
  const adminOpen = process.env.ADMIN_OPEN === "true";
  if (!adminOpen) {
    const dbUser = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { isAdmin: true },
    });
    if (!dbUser?.isAdmin) {
      reply.code(403).send({ error: "FORBIDDEN", message: "Admin access required." });
      return;
    }
  }

  request.user = sessionUser;
}
