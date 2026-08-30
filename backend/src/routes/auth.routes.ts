import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  registerUser,
  loginUser,
  logoutSession,
  getUserFromToken,
} from "../services/auth.service.js";
import { attachUser, COOKIE_NAME } from "../middleware/auth.middleware.js";

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const RegisterSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128)
    .regex(/[A-Za-z]/, "Password must contain at least one letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ─── Cookie options ───────────────────────────────────────────────────────────

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

function cookieOptions(isProd: boolean) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? ("none" as const) : ("lax" as const),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance) {
  const isProd = process.env.NODE_ENV === "production";

  // POST /auth/register
  app.post("/auth/register", async (request, reply) => {
    const result = RegisterSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        error: "VALIDATION_ERROR",
        details: result.error.flatten().fieldErrors,
      });
    }

    const { name, email, password } = result.data;

    try {
      const { user, sessionToken } = await registerUser(name, email, password);
      reply.setCookie(COOKIE_NAME, sessionToken, cookieOptions(isProd));
      return reply.code(201).send({ user });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "EMAIL_ALREADY_EXISTS") {
        return reply.code(409).send({ error: "EMAIL_ALREADY_EXISTS" });
      }
      request.log.error(err, "register error");
      return reply.code(500).send({ error: "INTERNAL_ERROR" });
    }
  });

  // POST /auth/login
  app.post("/auth/login", async (request, reply) => {
    const result = LoginSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        error: "VALIDATION_ERROR",
        details: result.error.flatten().fieldErrors,
      });
    }

    const { email, password } = result.data;

    try {
      const { user, sessionToken } = await loginUser(email, password);
      reply.setCookie(COOKIE_NAME, sessionToken, cookieOptions(isProd));
      return reply.send({ user });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "INVALID_CREDENTIALS") {
        return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
      }
      request.log.error(err, "login error");
      return reply.code(500).send({ error: "INTERNAL_ERROR" });
    }
  });

  // POST /auth/logout
  app.post(
    "/auth/logout",
    { preHandler: [attachUser] },
    async (request, reply) => {
      const token = request.cookies?.[COOKIE_NAME];
      if (token) {
        await logoutSession(token);
      }
      reply.clearCookie(COOKIE_NAME, { path: "/" });
      return reply.send({ success: true });
    }
  );

  // GET /auth/me
  app.get(
    "/auth/me",
    { preHandler: [attachUser] },
    async (request, reply) => {
      if (!request.user) {
        return reply.send({ authenticated: false, user: null });
      }
      return reply.send({ authenticated: true, user: request.user });
    }
  );

}

