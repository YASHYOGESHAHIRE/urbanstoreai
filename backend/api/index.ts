/**
 * Vercel serverless entry point for the Urban Store Fastify backend.
 *
 * This file is ONLY used by Vercel. Local development still uses server.ts
 * (which calls app.listen()). Do not import server.ts here.
 *
 * Key differences from server.ts:
 *  - No app.listen() — Vercel invokes the handler directly
 *  - No in-memory rate limiting — stateless per invocation
 *  - Everything else (routes, middleware, Prisma) is identical
 */

import Fastify, { FastifyRequest, FastifyReply } from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import { authRoutes } from "../src/routes/auth.routes.js";
import { oauthRoutes } from "../src/routes/oauth.routes.js";
import { catalogRoutes } from "../src/routes/catalog.routes.js";
import { cartRoutes } from "../src/routes/cart.routes.js";
import { checkoutRoutes } from "../src/routes/checkout.routes.js";
import { orderRoutes } from "../src/routes/order.routes.js";
import { agentRoutes } from "../src/routes/agent.routes.js";
import { openApiRoutes } from "../src/routes/openapi.routes.js";
import { adminRoutes } from "../src/routes/admin.routes.js";
import { behaviourRoutes } from "../src/routes/behaviour.routes.js";
import { prisma } from "../src/db/prisma.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: typeof prisma;
  }
}

const app = Fastify({ logger: false });

let isReady = false;

async function build() {
  if (isReady) return;

  app.decorate("prisma", prisma);

  // Allow empty JSON bodies
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    function (_req, body, done) {
      if (!body || body === "") {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";

  await app.register(fastifyCors, {
    origin: frontendUrl,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  await app.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET ?? "change-me-in-production",
  });

  // NOTE: @fastify/rate-limit intentionally omitted here.
  // It uses in-memory state which resets on every cold start.
  // Vercel provides edge-level DDoS protection. Add Upstash Redis
  // rate limiting here if stricter limits are needed.
  await app.register(authRoutes);
  await app.register(oauthRoutes);
  await app.register(catalogRoutes);
  await app.register(cartRoutes);
  await app.register(checkoutRoutes);
  await app.register(orderRoutes);
  await app.register(agentRoutes);
  await app.register(openApiRoutes);
  await app.register(adminRoutes);
  await app.register(behaviourRoutes);

  app.get("/health", async (_req, reply) => {
    return reply.send({ status: "ok", timestamp: new Date().toISOString() });
  });

  await app.ready();
  isReady = true;
}

// Vercel serverless handler
export default async function handler(req: FastifyRequest["raw"], res: FastifyReply["raw"]) {
  await build();
  app.server.emit("request", req, res);
}
