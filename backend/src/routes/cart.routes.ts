import { FastifyInstance } from "fastify";
import { z } from "zod";
import { attachUser, requireAuth } from "../middleware/auth.middleware.js";
import { attachAgent, requireAgent, requireScope } from "../middleware/agent.middleware.js";
import { getOrCreateCart, addToCart, updateCartItem, removeFromCart } from "../services/cart.service.js";

function getUserId(request: { user: { id: string } | null; agent: { user: { id: string } } | null }): string {
  return (request.user?.id ?? request.agent?.user.id)!;
}

function getAgentGrantId(request: { agent: { grantId: string } | null }): string | undefined {
  return request.agent?.grantId;
}

export async function cartRoutes(app: FastifyInstance) {

  // GET /api/v1/cart
  app.get(
    "/api/v1/cart",
    { preHandler: [attachUser, attachAgent] },
    async (request, reply) => {
      const userId = request.user?.id ?? request.agent?.user.id;
      if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });
      const cart = await getOrCreateCart(userId, getAgentGrantId(request as never));
      return reply.send(cart);
    }
  );

  // POST /api/v1/cart/items
  app.post(
    "/api/v1/cart/items",
    { preHandler: [attachUser, attachAgent] },
    async (request, reply) => {
      const userId = request.user?.id ?? request.agent?.user.id;
      if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });

      const body = z.object({
        productId: z.string(),
        variantSku: z.string(),
        quantity: z.number().min(1).default(1),
      }).safeParse(request.body);

      if (!body.success) {
        return reply.code(400).send({ error: "VALIDATION_ERROR", details: body.error.flatten().fieldErrors });
      }

      try {
        const cart = await addToCart(
          userId,
          body.data.productId,
          body.data.variantSku,
          body.data.quantity,
          getAgentGrantId(request as never)
        );
        return reply.code(201).send(cart);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "ERROR";
        return reply.code(400).send({ error: msg });
      }
    }
  );

  // PATCH /api/v1/cart/items/:itemId
  app.patch(
    "/api/v1/cart/items/:itemId",
    { preHandler: [attachUser, attachAgent] },
    async (request, reply) => {
      const userId = request.user?.id ?? request.agent?.user.id;
      if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });

      const { itemId } = request.params as { itemId: string };
      const body = z.object({ quantity: z.number().min(1) }).safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "VALIDATION_ERROR" });
      }

      try {
        const cart = await updateCartItem(userId, itemId, body.data.quantity, getAgentGrantId(request as never));
        return reply.send(cart);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "ERROR";
        return reply.code(400).send({ error: msg });
      }
    }
  );

  // DELETE /api/v1/cart/items/:itemId
  app.delete(
    "/api/v1/cart/items/:itemId",
    { preHandler: [attachUser, attachAgent] },
    async (request, reply) => {
      const userId = request.user?.id ?? request.agent?.user.id;
      if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });

      const { itemId } = request.params as { itemId: string };

      try {
        const cart = await removeFromCart(userId, itemId, getAgentGrantId(request as never));
        return reply.send(cart);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "ERROR";
        return reply.code(400).send({ error: msg });
      }
    }
  );
}
