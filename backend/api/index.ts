/**
 * Vercel serverless entry point for the Urban Store Fastify backend.
 * Local dev still uses src/server.ts (app.listen). This file is Vercel-only.
 */

import type { IncomingMessage, ServerResponse } from "http";
import Fastify from "fastify";
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
import { mcpRoutes } from "../src/routes/mcp.routes.js";
import { prisma } from "../src/db/prisma.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: typeof prisma;
  }
}

const app = Fastify({ logger: false });
let ready = false;

async function build(): Promise<void> {
  if (ready) return;

  app.decorate("prisma", prisma);

  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      if (!body || body === "") { done(null, {}); return; }
      try { done(null, JSON.parse(body as string)); }
      catch (err) { done(err as Error, undefined); }
    }
  );

  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";

  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (origin.startsWith("http://localhost")) return cb(null, true);
      if (origin === frontendUrl) return cb(null, true);
      if (origin.endsWith(".vercel.app")) return cb(null, true);
      cb(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  await app.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET ?? "change-me-in-production",
  });

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
  await app.register(mcpRoutes);

  app.get("/health", async (_req, reply) =>
    reply.send({ status: "ok", timestamp: new Date().toISOString() })
  );

  await app.ready();
  ready = true;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await build();
  app.server.emit("request", req, res);
}
