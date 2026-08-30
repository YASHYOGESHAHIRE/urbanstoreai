/**
 * MCP (Model Context Protocol) server for Urban Store.
 *
 * Transport: Streamable HTTP at POST /mcp
 * Auth:      OAuth 2.0 Bearer token — same tokens issued by /oauth/token
 *
 * Tools: search_catalog, get_product, get_cart, add_to_cart,
 *        remove_from_cart, create_checkout, get_orders
 */

import { FastifyInstance, FastifyRequest } from "fastify";
import { McpServer } from "@modelcontextprotocol/server";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import * as z from "zod/v4";
import { getUserFromToken } from "../services/auth.service.js";
import { searchProducts, getProduct } from "../services/catalog.service.js";
import { getOrCreateCart, addToCart, removeFromCart } from "../services/cart.service.js";
import { createCheckout } from "../services/checkout.service.js";
import { prisma } from "../db/prisma.js";

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getUserFromRequest(request: FastifyRequest) {
  const auth = request.headers.authorization;
  if (auth?.startsWith("Bearer ")) return getUserFromToken(auth.slice(7));
  return null;
}

// ─── Build MCP server (one instance, stateless per-request transport) ─────────

function buildMcpServer() {
  const server = new McpServer({ name: "urban-store", version: "1.0.0" });

  // ── search_catalog ──────────────────────────────────────────────────────────
  server.registerTool(
    "search_catalog",
    {
      description: "Search Urban Store's product catalogue. Supports natural language queries like 'minimal laptop bag under 3000'. Filter by category, price range, and availability.",
      inputSchema: {
        query:        z.string().optional().describe("Natural language search query"),
        category:     z.enum(["footwear", "bags", "fashion", "accessories", "lifestyle"]).optional(),
        minPrice:     z.number().optional().describe("Minimum price in INR"),
        maxPrice:     z.number().optional().describe("Maximum price in INR"),
        availability: z.enum(["in_stock", "low_stock"]).optional(),
        limit:        z.number().min(1).max(20).default(10),
      },
    },
    async ({ query, category, minPrice, maxPrice, availability, limit }) => {
      const result = await searchProducts({ query, category, minPrice, maxPrice, availability, limit });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── get_product ─────────────────────────────────────────────────────────────
  server.registerTool(
    "get_product",
    {
      description: "Get full product details by ID — all variants, sizes, colours, prices, and stock.",
      inputSchema: { productId: z.string().describe("Product ID e.g. 'urs_bag_001'") },
    },
    async ({ productId }) => {
      const product = await getProduct(productId);
      if (!product) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Not found" }) }] };
      return { content: [{ type: "text" as const, text: JSON.stringify(product, null, 2) }] };
    }
  );

  // ── get_cart ────────────────────────────────────────────────────────────────
  server.registerTool(
    "get_cart",
    { description: "Get the current user's shopping cart — items, quantities, prices, and subtotal." },
    async (_args, context) => {
      const req = (context as { request?: FastifyRequest }).request;
      if (!req) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "No request context" }) }] };
      const user = await getUserFromRequest(req);
      if (!user) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "UNAUTHORIZED" }) }] };
      const cart = await getOrCreateCart(user.id);
      return { content: [{ type: "text" as const, text: JSON.stringify(cart, null, 2) }] };
    }
  );

  // ── add_to_cart ─────────────────────────────────────────────────────────────
  server.registerTool(
    "add_to_cart",
    {
      description: "Add a product variant to the user's cart. Always confirm product name and price with the user before calling this.",
      inputSchema: {
        productId:  z.string().describe("Product ID"),
        variantSku: z.string().describe("Exact variant SKU from get_product"),
        quantity:   z.number().min(1).max(5).default(1),
      },
    },
    async ({ productId, variantSku, quantity }, context) => {
      const req = (context as { request?: FastifyRequest }).request;
      if (!req) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "No request context" }) }] };
      const user = await getUserFromRequest(req);
      if (!user) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "UNAUTHORIZED" }) }] };
      try {
        const cart = await addToCart(user.id, productId, variantSku, quantity);
        return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, cart }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: err instanceof Error ? err.message : "Failed" }) }] };
      }
    }
  );

  // ── remove_from_cart ────────────────────────────────────────────────────────
  server.registerTool(
    "remove_from_cart",
    {
      description: "Remove an item from the cart by its item ID (from get_cart).",
      inputSchema: { itemId: z.string().describe("Cart item ID from get_cart") },
    },
    async ({ itemId }, context) => {
      const req = (context as { request?: FastifyRequest }).request;
      if (!req) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "No request context" }) }] };
      const user = await getUserFromRequest(req);
      if (!user) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "UNAUTHORIZED" }) }] };
      try {
        const cart = await removeFromCart(user.id, itemId);
        return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, cart }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: err instanceof Error ? err.message : "Failed" }) }] };
      }
    }
  );

  // ── create_checkout ─────────────────────────────────────────────────────────
  server.registerTool(
    "create_checkout",
    { description: "Create a checkout and Razorpay order from the user's cart. ALWAYS show the cart total and get explicit user confirmation before calling this." },
    async (_args, context) => {
      const req = (context as { request?: FastifyRequest }).request;
      if (!req) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "No request context" }) }] };
      const user = await getUserFromRequest(req);
      if (!user) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "UNAUTHORIZED" }) }] };
      try {
        const result = await createCheckout(user.id);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: err instanceof Error ? err.message : "Checkout failed" }) }] };
      }
    }
  );

  // ── get_orders ──────────────────────────────────────────────────────────────
  server.registerTool(
    "get_orders",
    {
      description: "Get the user's past orders — IDs, items, totals, status, and dates.",
      inputSchema: { limit: z.number().min(1).max(20).default(10) },
    },
    async ({ limit }, context) => {
      const req = (context as { request?: FastifyRequest }).request;
      if (!req) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "No request context" }) }] };
      const user = await getUserFromRequest(req);
      if (!user) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "UNAUTHORIZED" }) }] };
      const orders = await prisma.order.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { id: true, status: true, total: true, itemsJson: true, createdAt: true },
      });
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(orders.map((o) => ({
            id: o.id, status: o.status, total: o.total,
            currency: "INR", items: o.itemsJson, createdAt: o.createdAt,
          })), null, 2),
        }],
      };
    }
  );

  return server;
}

// ─── Register routes ──────────────────────────────────────────────────────────

const mcpServer = buildMcpServer();

export async function mcpRoutes(app: FastifyInstance) {

  // POST /mcp — main MCP endpoint (Streamable HTTP)
  app.post("/mcp", async (request, reply) => {
    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    reply.raw.on("close", () => transport.close());

    // Pass the original request object so tools can access auth headers
    await mcpServer.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });

  // GET /mcp — required: return 405 with JSON-RPC error for non-POST
  app.get("/mcp", async (_request, reply) => {
    return reply.code(405).send({
      jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. Use POST." }, id: null,
    });
  });

  // DELETE /mcp — same
  app.delete("/mcp", async (_request, reply) => {
    return reply.code(405).send({
      jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. Use POST." }, id: null,
    });
  });
}
