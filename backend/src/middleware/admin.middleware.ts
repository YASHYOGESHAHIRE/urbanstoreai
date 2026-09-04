import { FastifyRequest, FastifyReply } from "fastify";
import { getUserFromToken } from "../services/auth.service.js";
import { COOKIE_NAME } from "./auth.middleware.js";
import { prisma } from "../db/prisma.js";

// Extend FastifyRequest to carry the read-only flag downstream
declare module "fastify" {
  interface FastifyRequest {
    isReadOnlyAdmin?: boolean;
  }
}

/**
 * requireAdmin — allows both full admins and read-only admins.
 * Sets request.isReadOnlyAdmin = true when the user only has read-only access.
 * Write routes call requireFullAdmin instead.
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  let token: string | undefined;
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    token = request.cookies?.[COOKIE_NAME];
  }

  if (!token) { reply.code(401).send({ error: "UNAUTHORIZED" }); return; }

  const sessionUser = await getUserFromToken(token);
  if (!sessionUser) { reply.code(401).send({ error: "UNAUTHORIZED" }); return; }

  const adminOpen = process.env.ADMIN_OPEN === "true";
  if (!adminOpen) {
    const dbUser = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { isAdmin: true, isReadOnlyAdmin: true },
    });
    if (!dbUser?.isAdmin) {
      reply.code(403).send({ error: "FORBIDDEN", message: "Admin access required." });
      return;
    }
    // Stamp read-only flag for downstream route handlers to check
    request.isReadOnlyAdmin = dbUser.isReadOnlyAdmin;
  }

  request.user = sessionUser;
}

/**
 * requireFullAdmin — blocks read-only admins from destructive actions.
 * Use as a second preHandler after requireAdmin on write routes.
 */
export async function requireFullAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (request.isReadOnlyAdmin) {
    reply.code(403).send({
      error: "READ_ONLY_ADMIN",
      message: "Your account has view-only access to the admin panel.",
    });
  }
}
