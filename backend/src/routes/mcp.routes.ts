/**
 * MCP (Model Context Protocol) server for Urban Store.
 *
 * Exposes shopping tools that Claude can call on behalf of authenticated users.
 * Transport: Streamable HTTP at POST /mcp  (MCP 2026-07-28 spec)
 * Auth:      OAuth 2.0 Bearer token — same tokens issued by /oauth/token
 *
 * Tools exposed:
 *   search_catalog      — semantic/keyword product search
 *   get_product         — full product + variant details
 *   get_cart            — view current cart
 *   add_to_cart         — add a product variant to cart
 *   remove_from_cart    — remove an item from cart
 *   create_checkout     — create Razorpay order from cart
 *   get_orders          — list past orders
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { McpServer } from "@modelcontextprotocol/server";
import { fastifyMcpPlugin } from "@modelcontextprotocol/fastify";
import * as z from "zod";
import { getUserFromToken } from "../services/auth.service.js";
import { searchProducts, getProduct } from "../services/catalog.service.js";
import { prisma } from "../db/prisma.js";
import { getOrCreateCart, addToCart, removeFromCart } from "../services/cart.service.js";
import { createCheckout } from "../services/checkout.service.js";

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getUserFromRequest(request: FastifyRequest): Promise<{ id: string; name: string; email: string } | null> {
  const auth = request.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    return getUserFromToken(auth.slice(7));
  }
  return null;
}

// ─── Build MCP server instance ────────────────────────────────────────────────

function buildMcpServer() {
  const server = new McpServer({
    name: "urban-store",
    version: "1.0.0",
  });

  // ── search_catalog ──────────────────────────────────────────────────────────
  server.registerTool(
    "search_catalog",
    {
      description:
        "Search Urban Store's product catalogue. Use natural language queries like 'minimal laptop bag under 3000' or filter by category, price range, and availability. Returns up to 10 products with prices, variants, and stock status.",
      inputSchema: z.object({
        query: z.string().optional().describe("Natural language search query, e.g. 'running shoes for trail'"),
        category: z.enum(["footwear", "bags", "fashion", "accessories", "lifestyle"]).optional().describe("Filter by category"),
        minPrice: z.number().optional().describe("Minimum price in INR"),
        maxPrice: z.number().optional().describe("Maximum price in INR"),
        availability: z.enum(["in_stock", "low_stock"]).optional().describe("Filter by stock status"),
        limit: z.number().min(1).max(20).default(10).describe("Number of results to return"),
      }),
    },
    async ({ query, category, minPrice, maxPrice, availability, limit }) => {
      const result = await searchProducts({ query, category, minPrice, maxPrice, availability, limit });
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            total: result.total,
            searchMode: result.searchMode,
            products: result.products.map((p) => ({
              id: p.id,
              name: p.name,
              brand: p.brand,
              category: p.category,
              subcategory: p.subcategory,
              description: p.description,
              price: p.price,
              mrp: p.mrp,
              currency: "INR",
              availability: p.availability,
              variants: p.variants,
            })),
          }, null, 2),
        }],
      };
    }
  );

  // ── get_product ─────────────────────────────────────────────────────────────
  server.registerTool(
    "get_product",
    {
      description:
        "Get full details of a specific product by its ID, including all variants, sizes, colours, prices, and real-time stock availability.",
      inputSchema: z.object({
        productId: z.string().describe("Product ID, e.g. 'urs_bag_001'"),
      }),
    },
    async ({ productId }) => {
      const product = await getProduct(productId);
      if (!product) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Product not found" }) }] };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(product, null, 2) }] };
    }
  );

  // ── get_cart ────────────────────────────────────────────────────────────────
  server.registerTool(
    "get_cart",
    {
      description:
        "Get the current user's shopping cart — items, quantities, prices, subtotal, and savings.",
      inputSchema: z.object({}),
    },
    async (_args, context) => {
      const request = (context as { request?: FastifyRequest }).request;
      if (!request) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "No request context" }) }] };

      const user = await getUserFromRequest(request);
      if (!user) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "UNAUTHORIZED" }) }] };

      const cart = await getOrCreateCart(user.id);
      return { content: [{ type: "text" as const, text: JSON.stringify(cart, null, 2) }] };
    }
  );

  // ── add_to_cart ─────────────────────────────────────────────────────────────
  server.registerTool(
    "add_to_cart",
    {
      description:
        "Add a product variant to the user's cart. You must specify the exact variantSku from get_product. Always confirm the product name and price with the user before calling this.",
      inputSchema: z.object({
        productId: z.string().describe("Product ID"),
        variantSku: z.string().describe("Exact variant SKU from get_product, e.g. 'URS-BAG-001-GRY'"),
        quantity: z.number().min(1).max(5).default(1).describe("Quantity to add (max 5)"),
      }),
    },
    async ({ productId, variantSku, quantity }, context) => {
      const request = (context as { request?: FastifyRequest }).request;
      if (!request) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "No request context" }) }] };

      const user = await getUserFromRequest(request);
      if (!user) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "UNAUTHORIZED" }) }] };

      try {
        const cart = await addToCart(user.id, productId, variantSku, quantity);
        return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, cart }, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to add item";
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }] };
      }
    }
  );

  // ── remove_from_cart ────────────────────────────────────────────────────────
  server.registerTool(
    "remove_from_cart",
    {
      description: "Remove an item from the user's cart by its cart item ID (from get_cart).",
      inputSchema: z.object({
        itemId: z.string().describe("Cart item ID from get_cart response"),
      }),
    },
    async ({ itemId }, context) => {
      const request = (context as { request?: FastifyRequest }).request;
      if (!request) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "No request context" }) }] };

      const user = await getUserFromRequest(request);
      if (!user) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "UNAUTHORIZED" }) }] };

      try {
        const cart = await removeFromCart(user.id, itemId);
        return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, cart }, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to remove item";
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }] };
      }
    }
  );

  // ── create_checkout ─────────────────────────────────────────────────────────
  server.registerTool(
    "create_checkout",
    {
      description:
        "Create a checkout session from the user's current cart. Returns a Razorpay order ID and payment details. IMPORTANT: Always show the user the full cart and total and get explicit confirmation before calling this tool.",
      inputSchema: z.object({}),
    },
    async (_args, context) => {
      const request = (context as { request?: FastifyRequest }).request;
      if (!request) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "No request context" }) }] };

      const user = await getUserFromRequest(request);
      if (!user) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "UNAUTHORIZED" }) }] };

      try {
        const result = await createCheckout(user.id);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Checkout failed";
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }] };
      }
    }
  );

  // ── get_orders ──────────────────────────────────────────────────────────────
  server.registerTool(
    "get_orders",
    {
      description: "Get the user's past orders — order IDs, items, totals, status, and dates.",
      inputSchema: z.object({
        limit: z.number().min(1).max(20).default(10).describe("Number of orders to return"),
      }),
    },
    async ({ limit }, context) => {
      const request = (context as { request?: FastifyRequest }).request;
      if (!request) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "No request context" }) }] };

      const user = await getUserFromRequest(request);
      if (!user) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "UNAUTHORIZED" }) }] };

      const orders = await prisma.order.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          status: true,
          total: true,
          itemsJson: true,
          createdAt: true,
        },
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(orders.map((o) => ({
            id: o.id,
            status: o.status,
            total: o.total,
            currency: "INR",
            items: o.itemsJson,
            createdAt: o.createdAt,
          })), null, 2),
        }],
      };
    }
  );

  return server;
}

// ─── Register Fastify plugin ──────────────────────────────────────────────────

export async function mcpRoutes(app: FastifyInstance) {
  const mcpServer = buildMcpServer();

  await app.register(fastifyMcpPlugin, {
    mcpServer,
    // Expose at /mcp — Claude connects here
    path: "/mcp",
  });
}
