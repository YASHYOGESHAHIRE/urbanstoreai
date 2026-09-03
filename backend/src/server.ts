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

  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    function (req, body, done) {
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

  // ── Auth + OAuth — 20/min per IP ─────────────────────────────────────────
  await app.register(async (s) => {
    await s.register(fastifyRateLimit, {
      max: 20,
      timeWindow: 60_000,
      keyGenerator: (req) => `ip:${req.ip}`,
      errorResponseBuilder(_err: unknown, context: { ttl: number }) {
        return { error: "RATE_LIMITED", retryAfterMs: context.ttl };
      },
    });
    await s.register(authRoutes);
    await s.register(oauthRoutes);
  });

  await protocolDiscoveryRoutes(app);

  // ── Catalog — 120/min per IP ──────────────────────────────────────────────
  await app.register(async (s) => {
    await s.register(fastifyRateLimit, {
      max: 120,
      timeWindow: 60_000,
      keyGenerator: (req) => `ip:${req.ip}`,
      errorResponseBuilder(_err: unknown, context: { ttl: number }) {
        return { error: "RATE_LIMITED", retryAfterMs: context.ttl };
      },
    });
    await s.register(catalogRoutes);
  });

  // ── Cart — 30/min per user or IP ──────────────────────────────────────────
  await app.register(async (s) => {
    await s.register(fastifyRateLimit, {
      max: 30,
      timeWindow: 60_000,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      keyGenerator: (req) => { const uid = (req as any).user?.id; return uid ? `u:${uid}` : `ip:${req.ip}`; },
      errorResponseBuilder(_err: unknown, context: { ttl: number }) {
        return { error: "RATE_LIMITED", retryAfterMs: context.ttl };
      },
    });
    await s.register(cartRoutes);
  });

  // ── Checkout — 10/min per user or IP (strictest) ──────────────────────────
  await app.register(async (s) => {
    await s.register(fastifyRateLimit, {
      max: 10,
      timeWindow: 60_000,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      keyGenerator: (req) => { const uid = (req as any).user?.id; return uid ? `u:${uid}` : `ip:${req.ip}`; },
      errorResponseBuilder(_err: unknown, context: { ttl: number }) {
        return { error: "RATE_LIMITED", retryAfterMs: context.ttl };
      },
    });
    await s.register(checkoutRoutes);
  });

  // ── Orders — 30/min per user or IP ───────────────────────────────────────
  await app.register(async (s) => {
    await s.register(fastifyRateLimit, {
      max: 30,
      timeWindow: 60_000,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      keyGenerator: (req) => { const uid = (req as any).user?.id; return uid ? `u:${uid}` : `ip:${req.ip}`; },
      errorResponseBuilder(_err: unknown, context: { ttl: number }) {
        return { error: "RATE_LIMITED", retryAfterMs: context.ttl };
      },
    });
    await s.register(orderRoutes);
  });

  // ── Agent — 30/min per IP ─────────────────────────────────────────────────
  await app.register(async (s) => {
    await s.register(fastifyRateLimit, {
      max: 30,
      timeWindow: 60_000,
      keyGenerator: (req) => `ip:${req.ip}`,
      errorResponseBuilder(_err: unknown, context: { ttl: number }) {
        return { error: "RATE_LIMITED", retryAfterMs: context.ttl };
      },
    });
    await s.register(agentRoutes);
  });

  await app.register(openApiRoutes);

  // ── Admin — 60/min per user or IP ─────────────────────────────────────────
  await app.register(async (s) => {
    await s.register(fastifyRateLimit, {
      max: 60,
      timeWindow: 60_000,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      keyGenerator: (req) => { const uid = (req as any).user?.id; return uid ? `u:${uid}` : `ip:${req.ip}`; },
      errorResponseBuilder(_err: unknown, context: { ttl: number }) {
        return { error: "RATE_LIMITED", retryAfterMs: context.ttl };
      },
    });
    await s.register(adminRoutes);
  });

  // ── Behaviour — 120/min per IP ────────────────────────────────────────────
  await app.register(async (s) => {
    await s.register(fastifyRateLimit, {
      max: 120,
      timeWindow: 60_000,
      keyGenerator: (req) => `ip:${req.ip}`,
      errorResponseBuilder(_err: unknown, context: { ttl: number }) {
        return { error: "RATE_LIMITED", retryAfterMs: context.ttl };
      },
    });
    await s.register(behaviourRoutes);
  });

  // ── MCP — 30/min per grant or IP ─────────────────────────────────────────
  await app.register(async (s) => {
    await s.register(fastifyRateLimit, {
      max: 30,
      timeWindow: 60_000,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      keyGenerator: (req) => { const gid = (req as any).agent?.grantId; return gid ? `g:${gid}` : `ip:${req.ip}`; },
      errorResponseBuilder(_err: unknown, context: { ttl: number }) {
        return { error: "RATE_LIMITED", retryAfterMs: context.ttl };
      },
    });
    await s.register(mcpRoutes);
  });

  await app.register(webhookRoutes);

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

  expireOverdueCampaigns().catch((err) =>
    console.error("[startup] campaign expiry failed:", err)
  );

  console.log(`\n Urban Store Backend  http://localhost:${port}\n`);
}

bootstrap().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
