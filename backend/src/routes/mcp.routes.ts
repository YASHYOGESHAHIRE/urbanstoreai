/**
 * MCP (Model Context Protocol) server for Urban Store.
 *
 * Uses @modelcontextprotocol/sdk v1 (stable).
 * Transport: Streamable HTTP at POST /mcp
 * Auth:      OAuth 2.0 Bearer token — same tokens issued by /oauth/token
 *
 * A new McpServer is built per request so the Fastify request object
 * is captured in a closure — no requestContext hacks needed, no type errors.
 */

import { FastifyInstance, FastifyRequest } from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getUserFromToken } from "../services/auth.service.js";
import { searchProducts, getProduct } from "../services/catalog.service.js";
import { getOrCreateCart, addToCart, removeFromCart } from "../services/cart.service.js";
import { createCheckout } from "../services/checkout.service.js";
import { prisma } from "../db/prisma.js";
import { z } from "zod";

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getUserFromRequest(request: FastifyRequest) {
  const auth = request.headers.authorization;
  if (auth?.startsWith("Bearer ")) return getUserFromToken(auth.slice(7));
  return null;
}

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

// ─── Build a fresh McpServer with request in closure ─────────────────────────
// Called once per incoming request — lightweight, no shared state.

function buildMcpServer(request: FastifyRequest) {
  const server = new McpServer({
    name: "urban-store",
    version: "1.0.0",
    instructions: `You are a shopping assistant for Urban Store — a premium Indian e-commerce store.

CATALOGUE:
Urban Store carries: footwear (running shoes, casual, formal), bags (laptop bags, backpacks, travel), fashion (t-shirts, shirts, jeans, jackets, dresses), accessories (watches, wallets, belts, sunglasses), and lifestyle (gifting, journals).
All prices are in INR (Indian Rupees). The store has 500+ products.

HOW TO SHOP:
1. Use search_catalog to find products. Always search before recommending — never invent product names or prices.
2. Use get_product to get full variant details (sizes, colors, SKUs) before adding to cart.
3. Use add_to_cart with the exact variantSku from get_product.
4. ALWAYS show the user the product name, variant, and price BEFORE calling add_to_cart. Get confirmation.
5. ALWAYS show cart contents and total BEFORE calling create_checkout. Get explicit YES from user.
6. create_checkout returns a Razorpay payment link — tell the user to complete payment on the store website.

RULES:
- Never make up products, prices, or availability. Only use data from tool responses.
- Max 3 products per response to avoid overwhelming the user.
- Keep responses conversational and brief.
- Prices shown should always include ₹ symbol.
- If a product is out of stock, suggest alternatives by searching again.
- For vague requests (just "shoes" or "bag"), ask one clarifying question about budget or occasion first.
- Never reveal internal product IDs or SKUs to the user.`,
  });

  // ── search_catalog ──────────────────────────────────────────────────────────
  server.tool(
    "search_catalog",
    "Search Urban Store products. Natural language queries like 'laptop bag under 3000'. Filter by category, price, availability.",
    {
      query:        z.string().optional().describe("Natural language search query"),
      category:     z.enum(["footwear", "bags", "fashion", "accessories", "lifestyle"]).optional(),
      minPrice:     z.number().optional().describe("Min price in INR"),
      maxPrice:     z.number().optional().describe("Max price in INR"),
      availability: z.enum(["in_stock", "low_stock"]).optional(),
      limit:        z.number().min(1).max(20).default(10),
    },
    async ({ query, category, minPrice, maxPrice, availability, limit }) => {
      const result = await searchProducts({ query, category, minPrice, maxPrice, availability, limit });
      return text(result);
    }
  );

  // ── get_product ─────────────────────────────────────────────────────────────
  server.tool(
    "get_product",
    "Get full product details — variants, sizes, colours, prices, stock.",
    { productId: z.string().describe("Product ID e.g. 'urs_bag_001'") },
    async ({ productId }) => {
      const product = await getProduct(productId);
      return product ? text(product) : text({ error: "Product not found" });
    }
  );

  // ── get_cart ────────────────────────────────────────────────────────────────
  server.tool(
    "get_cart",
    "Get the user's cart — items, quantities, prices, subtotal.",
    {},
    async () => {
      const user = await getUserFromRequest(request);
      if (!user) return text({ error: "UNAUTHORIZED" });
      return text(await getOrCreateCart(user.id));
    }
  );

  // ── add_to_cart ─────────────────────────────────────────────────────────────
  server.tool(
    "add_to_cart",
    "Add a product variant to cart. Confirm product name and price with user before calling.",
    {
      productId:  z.string().describe("Product ID"),
      variantSku: z.string().describe("Variant SKU from get_product"),
      quantity:   z.number().min(1).max(5).default(1),
    },
    async ({ productId, variantSku, quantity }) => {
      const user = await getUserFromRequest(request);
      if (!user) return text({ error: "UNAUTHORIZED" });
      try {
        return text({ success: true, cart: await addToCart(user.id, productId, variantSku, quantity) });
      } catch (err) {
        return text({ error: err instanceof Error ? err.message : "Failed" });
      }
    }
  );

  // ── remove_from_cart ────────────────────────────────────────────────────────
  server.tool(
    "remove_from_cart",
    "Remove a cart item by its ID (from get_cart).",
    { itemId: z.string().describe("Cart item ID") },
    async ({ itemId }) => {
      const user = await getUserFromRequest(request);
      if (!user) return text({ error: "UNAUTHORIZED" });
      try {
        return text({ success: true, cart: await removeFromCart(user.id, itemId) });
      } catch (err) {
        return text({ error: err instanceof Error ? err.message : "Failed" });
      }
    }
  );

  // ── create_checkout ─────────────────────────────────────────────────────────
  server.tool(
    "create_checkout",
    "Create Razorpay checkout from cart. ALWAYS show cart total and get explicit user confirmation first.",
    {},
    async () => {
      const user = await getUserFromRequest(request);
      if (!user) return text({ error: "UNAUTHORIZED" });
      try {
        return text(await createCheckout(user.id));
      } catch (err) {
        return text({ error: err instanceof Error ? err.message : "Checkout failed" });
      }
    }
  );

  // ── get_orders ──────────────────────────────────────────────────────────────
  server.tool(
    "get_orders",
    "Get user's past orders — IDs, items, totals, status, dates.",
    { limit: z.number().min(1).max(20).default(10) },
    async ({ limit }) => {
      const user = await getUserFromRequest(request);
      if (!user) return text({ error: "UNAUTHORIZED" });
      const orders = await prisma.order.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { id: true, status: true, total: true, itemsJson: true, createdAt: true },
      });
      return text(orders.map((o) => ({
        id: o.id, status: o.status, total: o.total,
        currency: "INR", items: o.itemsJson, createdAt: o.createdAt,
      })));
    }
  );

  return server;
}

// ─── Fastify routes ───────────────────────────────────────────────────────────

export async function mcpRoutes(app: FastifyInstance) {

  // POST /mcp — new server per request, request captured in closure
  app.post("/mcp", async (request, reply) => {
    const server = buildMcpServer(request);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    reply.raw.on("close", async () => {
      await transport.close();
      await server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });

  app.get("/mcp", async (_req, reply) =>
    reply.code(405).send({ jsonrpc: "2.0", error: { code: -32000, message: "Use POST" }, id: null })
  );

  app.delete("/mcp", async (_req, reply) =>
    reply.code(405).send({ jsonrpc: "2.0", error: { code: -32000, message: "Use POST" }, id: null })
  );
}
