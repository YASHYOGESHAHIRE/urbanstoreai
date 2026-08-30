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
} from "../services/campaign.service.js";

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
      } catch {
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

  // ── POST /api/v1/admin/make-admin (dev helper) ───────────────────────────
  // Grants admin to a user by email — only works in development
  app.post(
    "/api/v1/admin/make-admin",
    async (request, reply) => {
      if (process.env.NODE_ENV !== "development") {
        return reply.code(403).send({ error: "ONLY_IN_DEV" });
      }
      const body = z.object({ email: z.string().email() }).safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "VALIDATION_ERROR" });

      const { prisma } = app;
      const user = await prisma.user.update({
        where: { email: body.data.email },
        data: { isAdmin: true },
        select: { id: true, name: true, email: true, isAdmin: true },
      });
      return reply.send({ user });
    }
  );
}
