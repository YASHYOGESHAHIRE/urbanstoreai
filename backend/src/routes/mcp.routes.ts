/**
 * MCP (Model Context Protocol) server for Urban Store.
 *
 * Uses @modelcontextprotocol/sdk v1 (stable).
 * Transport: Streamable HTTP at POST /mcp
 * Auth:      OAuth 2.0 Bearer token — same tokens issued by /oauth/token
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

// ─── Build MCP server ─────────────────────────────────────────────────────────

function buildMcpServer() {
  const server = new McpServer({ name: "urban-store", version: "1.0.0" });

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
    async (_args, { requestContext }) => {
      const req = (requestContext as { request?: FastifyRequest })?.request;
      if (!req) return text({ error: "No request context" });
      const user = await getUserFromRequest(req);
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
    async ({ productId, variantSku, quantity }, { requestContext }) => {
      const req = (requestContext as { request?: FastifyRequest })?.request;
      if (!req) return text({ error: "No request context" });
      const user = await getUserFromRequest(req);
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
    async ({ itemId }, { requestContext }) => {
      const req = (requestContext as { request?: FastifyRequest })?.request;
      if (!req) return text({ error: "No request context" });
      const user = await getUserFromRequest(req);
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
    async (_args, { requestContext }) => {
      const req = (requestContext as { request?: FastifyRequest })?.request;
      if (!req) return text({ error: "No request context" });
      const user = await getUserFromRequest(req);
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
    async ({ limit }, { requestContext }) => {
      const req = (requestContext as { request?: FastifyRequest })?.request;
      if (!req) return text({ error: "No request context" });
      const user = await getUserFromRequest(req);
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

// ─── Singleton ────────────────────────────────────────────────────────────────

const mcpServer = buildMcpServer();

// ─── Fastify routes ───────────────────────────────────────────────────────────

export async function mcpRoutes(app: FastifyInstance) {

  app.post("/mcp", async (request, reply) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    reply.raw.on("close", () => transport.close());
    await mcpServer.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });

  app.get("/mcp", async (_req, reply) =>
    reply.code(405).send({ jsonrpc: "2.0", error: { code: -32000, message: "Use POST" }, id: null })
  );

  app.delete("/mcp", async (_req, reply) =>
    reply.code(405).send({ jsonrpc: "2.0", error: { code: -32000, message: "Use POST" }, id: null })
  );
}
