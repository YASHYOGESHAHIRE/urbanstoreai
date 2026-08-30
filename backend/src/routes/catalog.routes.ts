import { FastifyInstance } from "fastify";
import { z } from "zod";
import { searchProducts, getProduct, getProductAvailability } from "../services/catalog.service.js";

export async function catalogRoutes(app: FastifyInstance) {

  // POST /api/v1/catalog/search
  app.post("/api/v1/catalog/search", async (request, reply) => {
    const body = z.object({
      query: z.string().optional(),
      category: z.string().optional(),
      subcategory: z.string().optional(),
      minPrice: z.number().optional(),
      maxPrice: z.number().optional(),
      availability: z.string().optional(),
      limit: z.number().min(1).max(50).optional(),
      offset: z.number().min(0).optional(),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: body.error.flatten().fieldErrors });
    }

    const result = await searchProducts(body.data);
    return reply.send(result);
  });

  // GET /api/v1/products/:id
  app.get("/api/v1/products/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const product = await getProduct(id);
    if (!product) return reply.code(404).send({ error: "PRODUCT_NOT_FOUND" });
    return reply.send(product);
  });

  // GET /api/v1/products/:id/availability
  app.get("/api/v1/products/:id/availability", async (request, reply) => {
    const { id } = request.params as { id: string };
    const avail = await getProductAvailability(id);
    if (!avail) return reply.code(404).send({ error: "PRODUCT_NOT_FOUND" });
    return reply.send(avail);
  });
}
