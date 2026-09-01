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
import { validateAccessToken } from "../services/oauth.service.js";
import { searchProducts, getProduct } from "../services/catalog.service.js";
import { getOrCreateCart, addToCart, removeFromCart } from "../services/cart.service.js";
import { createCheckout } from "../services/checkout.service.js";
import { prisma } from "../db/prisma.js";
import { z } from "zod";

// ─── Auth helper — accepts OAuth access tokens AND session tokens ─────────────

async function getUserFromRequest(request: FastifyRequest) {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);

  // Try OAuth access token first (Claude/agent connections via /oauth/token)
  const oauthResult = await validateAccessToken(token);
  if (oauthResult) return oauthResult.user;

  // Fall back to session token (direct user session)
  return getUserFromToken(token);
}

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function authError() {
  return text({
    error: "OAUTH_TOKEN_EXPIRED_OR_INVALID",
    message: "Urban Store could not authenticate you. Your OAuth token may have expired.",
    action: "Please reconnect Urban Store from Claude Settings → Integrations.",
    reauthorizeUrl: `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/connect`,
  });
}

// ─── Build a fresh McpServer with request in closure ─────────────────────────
// Called once per incoming request — lightweight, no shared state.

function buildMcpServer(request: FastifyRequest) {
  const server = new McpServer({
    name: "urban-store",
    version: "1.0.0",
  });

  // Expose shopping instructions as a prompt Claude reads automatically
  server.prompt(
    "shopping-instructions",
    "Instructions for shopping at Urban Store",
    () => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `You are a shopping assistant for Urban Store — a premium Indian e-commerce store.

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
- Keep responses conversational and brief. No markdown tables.
- Prices shown should always include the ₹ symbol.
- If a product is out of stock, suggest alternatives by searching again.
- For vague requests like "shoes" or "bag", ask one clarifying question about budget or occasion first.
- Never reveal internal product IDs or SKUs to the user.`,
        },
      }],
    })
  );

  // ── search_catalog ──────────────────────────────────────────────────────────
  server.tool(
    "search_catalog",
    `Search Urban Store's product catalogue (500+ products across footwear, bags, fashion, accessories, lifestyle).
Returns up to 'limit' products, each with: id, name, brand, price (INR), mrp, availability, and variants[].
Each variant has: sku (needed for add_to_cart), attributes (size/color), price, availability.
Use this first — productIds and variantSkus needed by other tools come from here.
Tip: if results are empty, retry with broader terms (drop subcategory or price filters).`,
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
    `Get complete details for a product by its ID (e.g. 'urs_bag_001').
Returns all variants with exact SKUs needed for add_to_cart, plus stock levels per variant.
Use after search_catalog when you need variant-level details before adding to cart.`,
    { productId: z.string().describe("Product ID e.g. 'urs_bag_001'") },
    async ({ productId }) => {
      const product = await getProduct(productId);
      return product ? text(product) : text({ error: "Product not found" });
    }
  );

  // ── get_cart ────────────────────────────────────────────────────────────────
  server.tool(
    "get_cart",
    `View the user's current shopping cart.
Returns items[] each with: id (needed for remove_from_cart), productName, attributes, quantity, price, subtotal.
Also returns: subtotal, savings, itemCount.
Use before create_checkout to show the user what they're paying for.`,
    {},
    async () => {
      const user = await getUserFromRequest(request);
      if (!user) return authError();
      return text(await getOrCreateCart(user.id));
    }
  );

  // ── add_to_cart ─────────────────────────────────────────────────────────────
  server.tool(
    "add_to_cart",
    `Add a specific product variant to the user's cart.
IMPORTANT: variantSku must come from search_catalog or get_product results — it is not guessable.
Always show the user the product name, variant attributes, and price BEFORE calling this and get confirmation.
Returns the updated cart with all items and subtotal.
Related tools: get_cart (view cart), remove_from_cart (remove item), create_checkout (pay).`,
    {
      productId:  z.string().describe("Product ID"),
      variantSku: z.string().describe("Variant SKU from get_product"),
      quantity:   z.number().min(1).max(5).default(1),
    },
    async ({ productId, variantSku, quantity }) => {
      const user = await getUserFromRequest(request);
      if (!user) return authError();
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
    `Remove a specific item from the cart using its item ID.
The item ID (not the product ID) comes from get_cart response — items[].id.
Returns the updated cart after removal.`,
    { itemId: z.string().describe("Cart item ID") },
    async ({ itemId }) => {
      const user = await getUserFromRequest(request);
      if (!user) return authError();
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
    `Initiate checkout for the user's current cart. This is the "preview/dry-run" step — it validates stock and pricing and creates a Razorpay order, but does NOT charge the user.
The user must complete payment manually at the returned paymentUrl.
ALWAYS call get_cart first and show the user the full cart contents and total.
ALWAYS get explicit YES confirmation from the user before calling this.
Returns: checkoutId, subtotal, razorpayOrderId, paymentUrl, policyWarnings[].
Error codes: EMPTY_CART (nothing in cart), POLICY_REJECTED (stock/price issue), CONFIRMATION_REQUIRED (user hasn't confirmed).`,
    {},
    async () => {
      const user = await getUserFromRequest(request);
      if (!user) return authError();
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
    `Get the user's order history, most recent first.
Returns orders[] each with: id, status (placed/processing/shipped/delivered/cancelled), total (INR), items[], createdAt.
Useful for: checking order status, reordering previous items, finding order IDs for cancellation.`,
    { limit: z.number().min(1).max(20).default(10) },
    async ({ limit }) => {
      const user = await getUserFromRequest(request);
      if (!user) return authError();
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

  // GET /mcp/debug — diagnose token state (remove in production)
  app.get("/mcp/debug", async (request, reply) => {
    const auth = request.headers.authorization;
    const hasToken = auth?.startsWith("Bearer ");

    // Count grants in DB
    const totalGrants = await prisma.oAuthGrant.count();
    const activeGrants = await prisma.oAuthGrant.count({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
    });
    const expiredGrants = await prisma.oAuthGrant.count({
      where: { expiresAt: { lt: new Date() } },
    });

    // Recent grants
    const recentGrants = await prisma.oAuthGrant.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        accessToken: true,
        expiresAt: true,
        revokedAt: true,
        scopes: true,
        createdAt: true,
        client: { select: { clientId: true, name: true } },
      },
    });

    // Claude client state
    const claudeClient = await prisma.oAuthClient.findUnique({
      where: { clientId: "claude" },
      select: { id: true, redirectUris: true, clientSecret: true, scopes: true },
    });

    // All OAuth clients
    const allClients = await prisma.oAuthClient.findMany({
      select: { clientId: true, name: true, redirectUris: true },
    });

    return reply.send({
      now: new Date().toISOString(),
      incomingToken: hasToken ? "present" : "absent",
      grants: {
        total: totalGrants,
        active: activeGrants,
        expired: expiredGrants,
      },
      recentGrants: recentGrants.map(g => ({
        tokenPrefix: g.accessToken.substring(0, 12) + "...",
        client: g.client.clientId,
        scopes: g.scopes,
        createdAt: g.createdAt,
        expiresAt: g.expiresAt,
        expired: g.expiresAt < new Date(),
        revoked: !!g.revokedAt,
      })),
      claudeClient: claudeClient ? {
        exists: true,
        hasSecret: !!claudeClient.clientSecret,
        redirectUris: claudeClient.redirectUris,
        scopes: claudeClient.scopes,
      } : { exists: false },
      allClients: allClients.map(c => ({ clientId: c.clientId, name: c.name })),
    });
  });

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
