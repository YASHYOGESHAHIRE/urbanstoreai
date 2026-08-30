import { FastifyInstance } from "fastify";
import { attachUser } from "../middleware/auth.middleware.js";
import { attachAgent } from "../middleware/agent.middleware.js";
import { getUserOrders, getOrder, cancelOrder, handleRazorpayWebhook } from "../services/order.service.js";

export async function orderRoutes(app: FastifyInstance) {

  // GET /api/v1/orders
  app.get(
    "/api/v1/orders",
    { preHandler: [attachUser, attachAgent] },
    async (request, reply) => {
      const userId = request.user?.id ?? request.agent?.user.id;
      if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });
      const orders = await getUserOrders(userId);
      return reply.send({ orders });
    }
  );

  // GET /api/v1/orders/:id
  app.get(
    "/api/v1/orders/:id",
    { preHandler: [attachUser, attachAgent] },
    async (request, reply) => {
      const userId = request.user?.id ?? request.agent?.user.id;
      if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });
      const { id } = request.params as { id: string };
      try {
        const order = await getOrder(id, userId);
        return reply.send(order);
      } catch {
        return reply.code(404).send({ error: "ORDER_NOT_FOUND" });
      }
    }
  );

  // POST /api/v1/orders/:id/cancel
  app.post(
    "/api/v1/orders/:id/cancel",
    { preHandler: [attachUser, attachAgent] },
    async (request, reply) => {
      const userId = request.user?.id ?? request.agent?.user.id;
      if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });
      const { id } = request.params as { id: string };
      try {
        const result = await cancelOrder(id, userId, request.agent?.grantId);
        return reply.send(result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "ERROR";
        return reply.code(400).send({ error: msg });
      }
    }
  );

  // POST /api/v1/webhooks/razorpay
  app.post(
    "/api/v1/webhooks/razorpay",
    { config: { rawBody: true } },
    async (request, reply) => {
      const signature = (request.headers["x-razorpay-signature"] as string) ?? "";
      try {
        await handleRazorpayWebhook(JSON.stringify(request.body), signature);
        return reply.send({ received: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "ERROR";
        return reply.code(400).send({ error: msg });
      }
    }
  );
}
