import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import { authRoutes } from "./routes/auth.routes.js";
import { oauthRoutes } from "./routes/oauth.routes.js";
import { catalogRoutes } from "./routes/catalog.routes.js";
import { cartRoutes } from "./routes/cart.routes.js";
import { checkoutRoutes } from "./routes/checkout.routes.js";
import { orderRoutes } from "./routes/order.routes.js";
import { agentRoutes } from "./routes/agent.routes.js";
import { openApiRoutes } from "./routes/openapi.routes.js";
import { adminRoutes } from "./routes/admin.routes.js";
import { behaviourRoutes } from "./routes/behaviour.routes.js";
import { mcpRoutes } from "./routes/mcp.routes.js";
import { webhookRoutes } from "./routes/webhook.routes.js";
import { protocolDiscoveryRoutes } from "./routes/protocol-discovery.routes.js";
import { prisma } from "./db/prisma.js";
import { expireOverdueCampaigns } from "./services/campaign.service.js";

const isProd = process.env.NODE_ENV === "production";

declare module "fastify" {
  interface FastifyInstance {
    prisma: typeof prisma;
  }
}

const app = Fastify({
  logger: {
    level: isProd ? "warn" : "info",
    serializers: {
      req(request) {
        return { method: request.method, url: request.url };
      },
    },
  },
});

async function bootstrap() {
  app.decorate("prisma", prisma);

  app.addHook("onSend", async (_request, reply, _payload) => {
    if (!reply.hasHeader("X-Merchant-Primitives")) {
      reply.header(
        "X-Merchant-Primitives",
        "scoped-oauth; server-side-yes-gate; audit-per-grant; hmac-payment-verify; atomic-stock; price-snapshot; margin-floor"
      );
    }
  });

  // Allow empty JSON bodies — needed for POST /api/v1/checkout and similar
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    function (req, body, done) {
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

  // ── CORS ────────────────────────────────────────────────────────────────────
  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin) return cb(null, true);
      // Allow localhost for local dev
      if (origin.startsWith("http://localhost")) return cb(null, true);
      // Allow exact frontend URL
      if (origin === frontendUrl) return cb(null, true);
      // Allow any Vercel preview/production subdomain
      if (origin.endsWith(".vercel.app")) return cb(null, true);
      cb(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  // ── Cookies ─────────────────────────────────────────────────────────────────
  await app.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET ?? "change-me-in-production",
  });

  // ── Auth + OAuth (rate limited) ──────────────────────────────────────────────
  await app.register(async (limitedApp) => {
    await limitedApp.register(fastifyRateLimit, {
      max: 20,
      timeWindow: 60_000,
      keyGenerator: (req) => `ip:${req.ip}`,
      header: true,
      errorResponseBuilder(_err, context) {
        return { error: "RATE_LIMITED", retryAfterMs: context.ttl };
      },
    });
    await limitedApp.register(authRoutes);
    await limitedApp.register(oauthRoutes);
  });

  await protocolDiscoveryRoutes(app);

  // ── Catalog (public) — 120/min per IP ────────────────────────────────────────
  await app.register(async (scoped) => {
    await scoped.register(fastifyRateLimit, {
      max: 120,
      timeWindow: 60_000,
      keyGenerator: (req) => `ip:${req.ip}`,
      header: true,
      errorResponseBuilder(_err, context) {
        return { error: "RATE_LIMITED", retryAfterMs: context.ttl };
      },
    });
    await scoped.register(catalogRoutes);
  });

  // ── Cart — 60/min IP + 30/min USER (key=user if present else ip, max=30) ────
  await app.register(async (scoped) => {
    await scoped.register(fastifyRateLimit, {
      max: 30,
      timeWindow: 60_000,
      keyGenerator: (req) => {
        const userId = (req as any).user?.id;
        return userId ? `u:${userId}` : `ip:${req.ip}`;
      },
      header: true,
      errorResponseBuilder(_err, context) {
        return { error: "RATE_LIMITED", retryAfterMs: context.ttl };
      },
    });
    await scoped.register(cartRoutes);
  });

  // ── Checkout — 20/min IP + 10/min USER (strictest, money action) ─────────────
  await app.register(async (scoped) => {
    await scoped.register(fastifyRateLimit, {
      max: 10,
      timeWindow: 60_000,
      keyGenerator: (req) => {
        const userId = (req as any).user?.id;
        return userId ? `u:${userId}` : `ip:${req.ip}`;
      },
      header: true,
      errorResponseBuilder(_err, context) {
        return { error: "RATE_LIMITED", retryAfterMs: context.ttl };
      },
    });
    await scoped.register(checkoutRoutes);
  });

  // ── Orders — 60/min IP + 30/min USER ─────────────────────────────────────────
  await app.register(async (scoped) => {
    await scoped.register(fastifyRateLimit, {
      max: 30,
      timeWindow: 60_000,
      keyGenerator: (req) => {
        const userId = (req as any).user?.id;
        return userId ? `u:${userId}` : `ip:${req.ip}`;
      },
      header: true,
      errorResponseBuilder(_err, context) {
        return { error: "RATE_LIMITED", retryAfterMs: context.ttl };
      },
    });
    await scoped.register(orderRoutes);
  });

  // ── Agent (rate limited) — PRESERVED existing 30/min cap ─────────────────────
  await app.register(async (limitedApp) => {
    await limitedApp.register(fastifyRateLimit, {
      max: 30,
      timeWindow: 60_000,
      keyGenerator: (req) => `ip:${req.ip}`,
      header: true,
      errorResponseBuilder(_err, context) {
        return { error: "RATE_LIMITED", retryAfterMs: context.ttl };
      },
    });
    await limitedApp.register(agentRoutes);
  });

  // ── OpenAPI spec (public) ──────────────────────────────────────────────────
  await app.register(openApiRoutes);

  // ── Admin — 60/min per USER (user required for admin) ─────────────────────
  await app.register(async (scoped) => {
    await scoped.register(fastifyRateLimit, {
      max: 60,
      timeWindow: 60_000,
      keyGenerator: (req) => {
        const userId = (req as any).user?.id;
        return userId ? `u:${userId}` : `ip:${req.ip}`;
      },
      header: true,
      errorResponseBuilder(_err, context) {
        return { error: "RATE_LIMITED", retryAfterMs: context.ttl };
      },
    });
    await scoped.register(adminRoutes);
  });

  // ── Behaviour tracking — 120/min per IP ────────────────────────────────────
  await app.register(async (scoped) => {
    await scoped.register(fastifyRateLimit, {
      max: 120,
      timeWindow: 60_000,
      keyGenerator: (req) => `ip:${req.ip}`,
      header: true,
      errorResponseBuilder(_err, context) {
        return { error: "RATE_LIMITED", retryAfterMs: context.ttl };
      },
    });
    await scoped.register(behaviourRoutes);
  });

  // ── MCP — 60/min IP + 30/min GRANT ID ──────────────────────────────────────
  await app.register(async (scoped) => {
    await scoped.register(fastifyRateLimit, {
      max: 30,
      timeWindow: 60_000,
      keyGenerator: (req) => {
        const grantId = (req as any).agent?.grantId;
        return grantId ? `g:${grantId}` : `ip:${req.ip}`;
      },
      header: true,
      errorResponseBuilder(_err, context) {
        return { error: "RATE_LIMITED", retryAfterMs: context.ttl };
      },
    });
    await scoped.register(mcpRoutes);
  });

  // ── Webhooks (raw body needed for HMAC verification) ──────────────────────
  await app.register(webhookRoutes);

  // ── Health ────────────────────────────────────────────────────────────────────
  app.get("/health", async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.send({ status: "ok", db: "ok", timestamp: new Date().toISOString() });
    } catch {
      return reply.code(503).send({ status: "degraded", db: "error", timestamp: new Date().toISOString() });
    }
  });

  const host = process.env.HOST ?? "0.0.0.0";
  const port = parseInt(process.env.PORT ?? "4000", 10);
  await app.listen({ host, port });

  // ── Startup tasks ─────────────────────────────────────────────────────────
  // Expire any campaigns that lapsed while the server was down
  expireOverdueCampaigns().catch((err) =>
    console.error("[startup] campaign expiry failed:", err)
  );

  console.log(`\n Urban Store Backend  http://localhost:${port}`);
  console.log(`\n AUTH`);
  console.log(`  POST  /auth/register`);
  console.log(`  POST  /auth/login`);
  console.log(`  POST  /auth/logout`);
  console.log(`  GET   /auth/me`);
  console.log(`\n CATALOG`);
  console.log(`  POST  /api/v1/catalog/search`);
  console.log(`  GET   /api/v1/products/:id`);
  console.log(`  GET   /api/v1/products/:id/availability`);
  console.log(`\n CART`);
  console.log(`  GET   /api/v1/cart`);
  console.log(`  POST  /api/v1/cart/items`);
  console.log(`  PATCH /api/v1/cart/items/:itemId`);
  console.log(`  DELETE /api/v1/cart/items/:itemId`);
  console.log(`\n CHECKOUT`);
  console.log(`  POST  /api/v1/checkout`);
  console.log(`  GET   /api/v1/checkout/:id`);
  console.log(`  POST  /api/v1/checkout/:id/confirm`);
  console.log(`\n ORDERS`);
  console.log(`  GET   /api/v1/orders`);
  console.log(`  GET   /api/v1/orders/:id`);
  console.log(`  POST  /api/v1/orders/:id/cancel`);
  console.log(`\n AGENT`);
  console.log(`  POST  /api/v1/agent/chat\n`);
}

bootstrap().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
