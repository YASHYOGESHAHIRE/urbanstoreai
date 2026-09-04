import { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../middleware/admin.middleware.js";
import { getDashboardSnapshot } from "../services/analytics.service.js";
import {
  generateCampaignDecisions,
  getCampaigns,
  approveCampaign,
  dismissCampaign,
  getActiveCampaigns,
  getCampaignPerformance,
  getCampaignProjectionSummary,
} from "../services/campaign.service.js";
import { getAllUsersAuditLogs, getUserAuditLogs } from "../services/audit.service.js";
import { prisma } from "../db/prisma.js";

export async function adminRoutes(app: FastifyInstance) {

  // ── GET /api/v1/admin/dashboard ──────────────────────────────────────────
  app.get(
    "/api/v1/admin/dashboard",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      try {
        const snapshot = await getDashboardSnapshot();
        return reply.send(snapshot);
      } catch (err: unknown) {
        request.log.error(err, "dashboard error");
        return reply.code(500).send({ error: "INTERNAL_ERROR" });
      }
    }
  );

  // ── GET /api/v1/admin/campaigns ──────────────────────────────────────────
  app.get(
    "/api/v1/admin/campaigns",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const query = z.object({
        status: z.string().optional(),
      }).safeParse(request.query);

      const campaigns = await getCampaigns(query.data?.status);
      return reply.send({ campaigns });
    }
  );

  // ── POST /api/v1/admin/campaigns/generate ────────────────────────────────
  app.post(
    "/api/v1/admin/campaigns/generate",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      try {
        await generateCampaignDecisions();
        const campaigns = await getCampaigns("pending");
        return reply.code(201).send({
          message: `Generated ${campaigns.length} campaign decisions.`,
          campaigns,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        request.log.error(err, "campaign generation error");
        return reply.code(500).send({ error: "GENERATION_FAILED", detail: msg });
      }
    }
  );

  // ── POST /api/v1/admin/campaigns/:id/approve ─────────────────────────────
  app.post(
    "/api/v1/admin/campaigns/:id/approve",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const campaign = await approveCampaign(id);
        return reply.send({ campaign });
      } catch (err: unknown) {
        if (err instanceof Error) {
          if (err.message === "CAMPAIGN_MARGIN_POLICY") {
            return reply.code(400).send({
              error: "CAMPAIGN_MARGIN_POLICY",
              policy: (err as { policy?: unknown }).policy,
            });
          }
          if (err.message === "Not Found") {
            return reply.code(404).send({ error: "CAMPAIGN_NOT_FOUND" });
          }
        }
        request.log.error(err, "approve campaign error");
        return reply.code(404).send({ error: "CAMPAIGN_NOT_FOUND" });
      }
    }
  );

  // ── POST /api/v1/admin/campaigns/:id/dismiss ─────────────────────────────
  app.post(
    "/api/v1/admin/campaigns/:id/dismiss",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const campaign = await dismissCampaign(id);
        return reply.send({ campaign });
      } catch {
        return reply.code(404).send({ error: "CAMPAIGN_NOT_FOUND" });
      }
    }
  );

  // ── GET /api/v1/admin/campaigns/active (public — used by storefront) ─────
  app.get(
    "/api/v1/campaigns/active",
    async (_request, reply) => {
      const campaigns = await getActiveCampaigns();
      return reply.send({ campaigns });
    }
  );

  // ── GET /api/v1/admin/campaigns/performance — revenue loop
  // Returns one performance-card per approved campaign: projected vs actual
  // units + revenue, delta %, verdict, and narrative feedback for next round.
  // Direct answer to "grow the merchant's revenue — measured, not projected."
  app.get(
    "/api/v1/admin/campaigns/performance",
    { preHandler: [requireAdmin] },
    async (_request, reply) => {
      try {
        const cards = await getCampaignPerformance();
        return reply.send({ cards });
      } catch (err: unknown) {
        request.log.error(err, "campaign performance error");
        return reply.code(500).send({ error: "INTERNAL_ERROR" });
      }
    }
  );

  // ── GET /api/v1/admin/campaigns/projection-summary — single glance header
  // Aggregate accuracy number, verdict counts, total projected vs actual.
  app.get(
    "/api/v1/admin/campaigns/projection-summary",
    { preHandler: [requireAdmin] },
    async (_request, reply) => {
      try {
        const summary = await getCampaignProjectionSummary();
        return reply.send({ summary });
      } catch (err: unknown) {
        request.log.error(err, "projection summary error");
        return reply.code(500).send({ error: "INTERNAL_ERROR" });
      }
    }
  );

  // ── GET /api/v1/admin/users ───────────────────────────────────────────────
  app.get(
    "/api/v1/admin/users",
    { preHandler: [requireAdmin] },
    async (_request, reply) => {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          isAdmin: true,
          isReadOnlyAdmin: true,
          createdAt: true,
          _count: { select: { orders: true, auditLogs: true } },
          orders: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { total: true, createdAt: true, status: true },
          },
        },
      });

      const enriched = await Promise.all(users.map(async (u) => {
        const agg = await prisma.order.aggregate({
          where: { userId: u.id },
          _sum: { total: true },
        });
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          isAdmin: u.isAdmin,
          isReadOnlyAdmin: u.isReadOnlyAdmin,
          createdAt: u.createdAt,
          orderCount: u._count.orders,
          auditEventCount: u._count.auditLogs,
          lastOrder: u.orders[0] ?? null,
          totalSpent: agg._sum.total ?? 0,
        };
      }));

      return reply.send({ users: enriched });
    }
  );

  // ── GET /api/v1/admin/users/:id/audit ─────────────────────────────────────
  app.get(
    "/api/v1/admin/users/:id/audit",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const query = z.object({ limit: z.coerce.number().optional() }).safeParse(request.query);
      const limit = query.data?.limit ?? 200;

      const [logs, user] = await Promise.all([
        getUserAuditLogs(id, limit),
        prisma.user.findUnique({
          where: { id },
          select: { id: true, name: true, email: true, isAdmin: true, isReadOnlyAdmin: true, createdAt: true },
        }),
      ]);

      if (!user) return reply.code(404).send({ error: "USER_NOT_FOUND" });
      return reply.send({ user, logs });
    }
  );
}
