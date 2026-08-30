import { FastifyInstance } from "fastify";
import { z } from "zod";
import { attachUser } from "../middleware/auth.middleware.js";
import { trackBehaviour, getMostViewedProducts, getTrendingSearches } from "../services/behaviour.service.js";

export async function behaviourRoutes(app: FastifyInstance) {

  // POST /api/v1/behaviour — track an event
  app.post(
    "/api/v1/behaviour",
    { preHandler: [attachUser] },
    async (request, reply) => {
      const body = z.object({
        sessionKey: z.string().min(1),
        event: z.enum([
          "product_viewed",
          "category_browsed",
          "search_query",
          "cart_add",
          "chat_message",
          "product_page_viewed",
        ]),
        productId: z.string().optional(),
        categoryId: z.string().optional(),
        query: z.string().optional(),
        metadata: z.record(z.unknown()).optional(),
      }).safeParse(request.body);

      if (!body.success) {
        return reply.code(400).send({ error: "VALIDATION_ERROR" });
      }

      await trackBehaviour({
        userId: request.user?.id,
        ...body.data,
      });

      return reply.code(204).send();
    }
  );

  // GET /api/v1/behaviour/trending — trending products and searches
  app.get("/api/v1/behaviour/trending", async (_request, reply) => {
    const [products, searches] = await Promise.all([
      getMostViewedProducts(7, 5),
      getTrendingSearches(7, 5),
    ]);
    return reply.send({ products, searches });
  });
}
