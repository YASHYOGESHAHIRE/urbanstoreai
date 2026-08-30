import { FastifyInstance } from "fastify";
import { z } from "zod";
import { attachUser } from "../middleware/auth.middleware.js";
import { attachAgent } from "../middleware/agent.middleware.js";
import { createCheckout, getCheckout, confirmCheckout } from "../services/checkout.service.js";

export async function checkoutRoutes(app: FastifyInstance) {

  // POST /api/v1/checkout
  app.post(
    "/api/v1/checkout",
    { preHandler: [attachUser, attachAgent] },
    async (request, reply) => {
      const userId = request.user?.id ?? request.agent?.user.id;
      if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });

      try {
        const checkout = await createCheckout(userId, request.agent?.grantId);
        return reply.code(201).send(checkout);
      } catch (err: unknown) {
        if (err instanceof Error) {
          if (err.message === "EMPTY_CART") {
            return reply.code(400).send({ error: "EMPTY_CART" });
          }
          if (err.message === "POLICY_REJECTED") {
            return reply.code(400).send({
              error: "POLICY_REJECTED",
              policy: (err as { policy?: unknown }).policy,
            });
          }
        }
        request.log.error(err, "checkout error");
        return reply.code(500).send({ error: "INTERNAL_ERROR" });
      }
    }
  );

  // GET /api/v1/checkout/:id
  app.get(
    "/api/v1/checkout/:id",
    { preHandler: [attachUser, attachAgent] },
    async (request, reply) => {
      const userId = request.user?.id ?? request.agent?.user.id;
      if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });

      const { id } = request.params as { id: string };
      try {
        const checkout = await getCheckout(id, userId);
        return reply.send(checkout);
      } catch {
        return reply.code(404).send({ error: "CHECKOUT_NOT_FOUND" });
      }
    }
  );

  // POST /api/v1/checkout/:id/confirm
  app.post(
    "/api/v1/checkout/:id/confirm",
    { preHandler: [attachUser, attachAgent] },
    async (request, reply) => {
      const userId = request.user?.id ?? request.agent?.user.id;
      if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });

      const { id } = request.params as { id: string };
      const body = z.object({
        razorpayPaymentId: z.string(),
        razorpaySignature: z.string(),
      }).safeParse(request.body);

      if (!body.success) {
        return reply.code(400).send({ error: "VALIDATION_ERROR", details: body.error.flatten().fieldErrors });
      }

      try {
        const order = await confirmCheckout(
          id,
          userId,
          body.data.razorpayPaymentId,
          body.data.razorpaySignature,
          request.agent?.grantId
        );
        return reply.send(order);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "ERROR";
        const status = msg === "INVALID_SIGNATURE" ? 400 : msg === "CHECKOUT_NOT_FOUND" ? 404 : 500;
        return reply.code(status).send({ error: msg });
      }
    }
  );
}
