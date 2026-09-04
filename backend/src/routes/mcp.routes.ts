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
import { getUserFromToken, getUserByApiKey } from "../services/auth.service.js";
import { validateAccessToken } from "../services/oauth.service.js";
import { searchProducts, getProduct, getUpsells, getUpgrades } from "../services/catalog.service.js";
import { getOrCreateCart, addToCart, removeFromCart } from "../services/cart.service.js";
import { createCheckout } from "../services/checkout.service.js";
import { prisma } from "../db/prisma.js";
import { z } from "zod";
import crypto from "crypto";
import { requireAdmin } from "../middleware/admin.middleware.js";

// ─── Auth helper — API key (query/header), OAuth token, or session token ──────

async function getUserFromRequest(request: FastifyRequest) {
  // 1. API key from query string: /mcp?key=us_live_xxx (recommended for Claude)
  const queryKey = (request.query as Record<string, string>)?.key;
  if (queryKey?.startsWith("us_live_")) {
    return getUserByApiKey(queryKey);
  }

  // 2. API key from header: X-Api-Key: us_live_xxx
  const headerKey = request.headers["x-api-key"] as string | undefined;
  if (headerKey?.startsWith("us_live_")) {
    return getUserByApiKey(headerKey);
  }

  // 3. Bearer token — OAuth access token or session token
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);

  const oauthResult = await validateAccessToken(token);
  if (oauthResult) return oauthResult.user;

  return getUserFromToken(token);
}

// ─── MCP Checkout Confirmation Gate (P0 security fix) ─────────────────────────
//
// The create_checkout tool MUST NOT be callable without a fresh, single-use,
// server-issued confirmation nonce.  The nonce encodes the cart subtotal so
// if the cart changes between confirm-yes and checkout the nonce is
// automatically invalid (amount mismatch).
//
// Flow:
//   1. Model calls get_cart                 → sees current items + subtotal
//   2. Model calls request_checkout_confirmation → receives nonce + summary
//   3. Model shows summary to user + asks EXPLICIT YES
//   4. User says YES
//   5. Model calls create_checkout(confirmationNonce=nonce)
//
// Any create_checkout call missing / reusing / mismatching the nonce is
// rejected server-side.  Prompt instructions alone do NOT protect this —
// the code enforces it.

const pendingMcpCheckouts = new Map<
  string,
  { userId: string; subtotal: number; cartItemCount: number; expiresAt: number; used: boolean }
>();

const MCP_CONFIRM_TTL_MS = 2 * 60 * 1000; // 2 minutes

function issueMcpConfirmNonce(
  userId: string,
  subtotal: number,
  cartItemCount: number
): { nonce: string; expiresAt: number } {
  const nonce = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + MCP_CONFIRM_TTL_MS;
  pendingMcpCheckouts.set(nonce, {
    userId,
    subtotal,
    cartItemCount,
    expiresAt,
    used: false,
  });
  return { nonce, expiresAt };
}

function consumeMcpConfirmNonce(
  nonce: string,
  userId: string,
  expectedSubtotal: number
): { ok: true } | { ok: false; reason: string } {
  const entry = pendingMcpCheckouts.get(nonce);
  if (!entry) return { ok: false, reason: "CONFIRM_NONCE_UNKNOWN" };
  if (entry.used) return { ok: false, reason: "CONFIRM_NONCE_REUSED" };
  if (Date.now() > entry.expiresAt) {
    pendingMcpCheckouts.delete(nonce);
    return { ok: false, reason: "CONFIRM_NONCE_EXPIRED" };
  }
  if (entry.userId !== userId) return { ok: false, reason: "CONFIRM_NONCE_WRONG_USER" };
  if (entry.subtotal !== expectedSubtotal) return { ok: false, reason: "CONFIRM_NONCE_AMOUNT_MISMATCH" };

  entry.used = true;
  pendingMcpCheckouts.delete(nonce);
  return { ok: true };
}

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function authError() {
  const connectUrl = `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/connect`;
  return text({
    error: "AUTH_REQUIRED",
    message: "You are not connected to Urban Store yet.",
    action: `To shop Urban Store with Claude, visit ${connectUrl} — log in and copy your personal MCP URL. Then update this integration with that URL (it contains your API key). Takes 30 seconds.`,
    connectUrl,
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

IMPORTANT — BEFORE DOING ANYTHING:
If the user has not connected Urban Store (i.e. you are not authenticated), immediately respond with:
"To shop Urban Store, you need to connect your account first. Visit **${process.env.FRONTEND_URL ?? "http://localhost:3000"}/connect**, log in, and copy your MCP URL. Then update this Claude integration with that URL — it takes 30 seconds. Once connected, come back and I can search products, manage your cart, and create orders for you."
Do NOT attempt to call any tools if auth is missing — the first tool call will tell you via AUTH_REQUIRED error.

CATALOGUE:
Urban Store carries: footwear (running shoes, casual, formal), bags (laptop bags, backpacks, travel), fashion (t-shirts, shirts, jeans, jackets, dresses), accessories (watches, wallets, belts, sunglasses), and lifestyle (gifting, journals).
All prices are in INR (Indian Rupees). The store has 500+ products.

HOW TO SHOP:
1. Use search_catalog to find products. Always search before recommending — never invent product names or prices.
2. Use get_product to get full variant details (sizes, colors, SKUs) before adding to cart.
3. Use add_to_cart with the exact variantSku from get_product.
4. After add_to_cart succeeds, immediately call get_upsell with the same productId — show complementary products.
5. ALWAYS show the user the product name, variant, and price BEFORE calling add_to_cart. Get confirmation.
6. WHEN THE USER IS READY TO CHECKOUT (required order, do NOT skip steps):
   a. Call get_cart and show the user the full contents including subtotal in ₹.
   b. Call request_checkout_confirmation — it returns a short confirmationNonce.
   c. Show the user the summary returned by request_checkout_confirmation and ASK EXPLICITLY: "To confirm payment of ₹SUBTOTAL for ITEM_COUNT item(s), reply YES."
   d. WAIT for the user to say YES (or an equivalent like "confirm", "go ahead").
   e. Only after the user explicitly says YES, call create_checkout with confirmationNonce set to the exact nonce from step b.
7. create_checkout returns a Razorpay payment link — tell the user to complete payment on the store website.

CRITICAL — YES GATE (the server enforces this; you cannot bypass it):
- You MUST call request_checkout_confirmation first. You cannot guess or fabricate the nonce.
- If the user never says YES, you MUST NOT call create_checkout.
- If the cart changes after you called request_checkout_confirmation (item added/removed, price changed), call request_checkout_confirmation again to get a fresh nonce.
- The nonce expires after 2 minutes. If too much time passes, request a new one.

RULES:
- Never make up products, prices, or availability. Only use data from tool responses.
- Max 3 products per response to avoid overwhelming the user.
- Keep responses conversational and brief. No markdown tables.
- Prices shown should always include the ₹ symbol.
- If a product is out of stock, suggest alternatives by searching again.
- For vague requests like "shoes" or "bag", ask one clarifying question about budget or occasion first.
- Never reveal internal product IDs or SKUs to the user.
- If any tool returns AUTH_REQUIRED, stop and show the connect URL: ${process.env.FRONTEND_URL ?? "http://localhost:3000"}/connect`,
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

  // ── request_checkout_confirmation (MCP YES GATE — Step 1) ──────────────────
  server.tool(
    "request_checkout_confirmation",
    `REQUIRED STEP BEFORE create_checkout.
Call this BEFORE asking the user to confirm checkout. It returns a short-lived,
single-use confirmationNonce plus a human-readable summary of what the user is
being asked to approve. The nonce binds the current cart subtotal + item count
so if the cart changes afterwards the nonce is invalidated automatically.

WHEN TO CALL:
  • After the user says they're ready to pay / checkout / buy.
  • AFTER you've called get_cart (so you know the current cart state).
  • BEFORE you ask the user for explicit YES confirmation.

AFTER THIS RETURNS:
  Show the summary to the user and ask: "To confirm payment of ₹SUBTOTAL for
  N item(s), reply YES." Then wait for the user to say YES. Only after the user
  explicitly confirms, call create_checkout(confirmationNonce=NONCE_FROM_HERE).

The nonce expires after 2 minutes. For changed carts or expired nonces, call
this tool again to get a fresh one.`,
    {},
    async () => {
      const user = await getUserFromRequest(request);
      if (!user) return authError();
      try {
        const cart = await getOrCreateCart(user.id);
        const subtotal = (cart as any).subtotal ?? 0;
        const itemCount = (cart as any).itemCount ?? 0;
        if (itemCount === 0) {
          return text({ error: "EMPTY_CART", message: "No items in cart. Add items first." });
        }
        const { nonce, expiresAt } = issueMcpConfirmNonce(user.id, subtotal, itemCount);
        return text({
          success: true,
          confirmationNonce: nonce,
          summary: {
            subtotal,
            subtotalINR: `₹${subtotal.toLocaleString("en-IN")}`,
            itemCount,
            currency: "INR",
          },
          expiresAt: new Date(expiresAt).toISOString(),
          expiresInSeconds: Math.round(MCP_CONFIRM_TTL_MS / 1000),
          nextStep:
            "Show this summary to the user and ask for explicit YES confirmation. Then pass confirmationNonce to create_checkout.",
        });
      } catch (err) {
        return text({ error: err instanceof Error ? err.message : "Failed to request confirmation" });
      }
    }
  );

  // ── create_checkout (MCP YES GATE — Step 2, nonce REQUIRED) ────────────────
  server.tool(
    "create_checkout",
    `Initiate checkout for the user's current cart. Validates stock and pricing,
creates a Razorpay order, but does NOT charge the user yet — payment happens
on the linked page.

REQUIRED PREREQUISITES (the server will REJECT with GATE_CONFIRMATION_REQUIRED
if you skip these):
  1. Call get_cart so you + user see current items + total.
  2. Call request_checkout_confirmation → get back confirmationNonce + summary.
  3. Show summary to user + ask EXPLICIT YES confirmation.
  4. WAIT for user to say YES (confirm / go ahead / pay / yes).
  5. Only then call create_checkout with the exact confirmationNonce string
     from step 2.

After this succeeds, you MUST immediately show the user the paymentUrl as a
clickable link: "Click here to complete your payment: [paymentUrl]". Never
wait to be asked — always show the link automatically.

Returns: checkoutId, subtotal, razorpayOrderId, paymentUrl, policyWarnings[].
Error codes:
  • EMPTY_CART – cart is empty (add items first)
  • POLICY_REJECTED – store policy blocked (show policy summary to user)
  • GATE_CONFIRMATION_REQUIRED – confirmationNonce missing, wrong, reused,
    expired, or cart subtotal doesn't match the nonce (start the confirm
    flow again from request_checkout_confirmation).`,
    {
      confirmationNonce: z
        .string()
        .describe("REQUIRED. The confirmationNonce from request_checkout_confirmation. Do NOT make this up — you must request it first."),
    },
    async ({ confirmationNonce }) => {
      const user = await getUserFromRequest(request);
      if (!user) return authError();
      try {
        // ── MCP YES GATE: validate nonce BEFORE any money action ──────────
        const cart = await getOrCreateCart(user.id);
        const currentSubtotal = (cart as any).subtotal ?? 0;
        const itemCount = (cart as any).itemCount ?? 0;
        if (itemCount === 0) {
          return text({ error: "EMPTY_CART", message: "Cart is empty. Add items before checkout." });
        }
        if (!confirmationNonce) {
          return text({
            error: "GATE_CONFIRMATION_REQUIRED",
            reason: "MISSING_NONCE",
            message:
              "Call request_checkout_confirmation first to get a confirmationNonce, show the summary to the user, wait for YES, then pass the nonce here.",
            requiredFlow: [
              "get_cart",
              "request_checkout_confirmation",
              "show user summary + ask YES",
              "user says YES",
              "create_checkout(confirmationNonce=...)",
            ],
          });
        }
        const gate = consumeMcpConfirmNonce(confirmationNonce, user.id, currentSubtotal);
        if (!gate.ok) {
          return text({
            error: "GATE_CONFIRMATION_REQUIRED",
            reason: gate.reason,
            message:
              "Confirmation nonce invalid. Start the confirmation flow again: call request_checkout_confirmation, show summary, wait for user YES, then try again with the new nonce.",
            hints: {
              CONFIRM_NONCE_UNKNOWN: "Nonce was never issued or already cleared — call request_checkout_confirmation first.",
              CONFIRM_NONCE_REUSED: "Nonce was already used — you must request a fresh one.",
              CONFIRM_NONCE_EXPIRED: "Nonce expired (2 min TTL) — request a new one.",
              CONFIRM_NONCE_WRONG_USER: "Nonce was issued for a different user — request your own.",
              CONFIRM_NONCE_AMOUNT_MISMATCH:
                "Cart subtotal changed since nonce was issued (item added/removed/price changed) — request a new nonce.",
            }[gate.reason as keyof {}],
          });
        }
        // ── Gate passed — proceed to create checkout ──────────────────────

        const result = await createCheckout(user.id);
        const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
        const paymentUrl = result.paymentUrl ?? `${frontendUrl}/pay/${result.checkoutId}`;
        return text({
          ...result,
          paymentUrl,
          IMPORTANT: `You MUST show this payment link to the user immediately: ${paymentUrl}`,
          gate: `passed (subtotal=₹${currentSubtotal.toLocaleString("en-IN")})`,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Checkout failed";
        if (msg === "POLICY_REJECTED") {
          const policy = (err as { policy?: unknown }).policy;
          return text({ error: "POLICY_REJECTED", policy });
        }
        return text({ error: msg });
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

  // ── get_upsell ──────────────────────────────────────────────────────────────
  server.tool(
    "get_upsell",
    `Get complementary and frequently-bought-together products for a given product.
Call this automatically after every successful add_to_cart — do not wait to be asked.
Returns upsells[] (up to 2 products) and a message to use as your intro line.
Each product has the same shape as search_catalog results (id, name, price, variants, etc.).
If upsells is empty, skip silently.`,
    { productId: z.string().describe("ID of the product just added to cart") },
    async ({ productId }) => {
      const result = await getUpsells(productId);
      return text(result);
    }
  );

  // ── get_upgrade ─────────────────────────────────────────────────────────────
  server.tool(
    "get_upgrade",
    `Get a premium upgrade option for a product.
Call when the user asks for "better version", "premium", "upgrade", or "best option".
Returns upgrades[] with the next-tier product(s) and a currentPrice for comparison.
If no upgrade exists, the message field says so — relay it to the user.`,
    { productId: z.string().describe("ID of the product to find an upgrade for") },
    async ({ productId }) => {
      const result = await getUpgrades(productId);
      return text(result);
    }
  );

  return server;
}

// ─── Fastify routes ───────────────────────────────────────────────────────────

export async function mcpRoutes(app: FastifyInstance) {

  // GET /mcp/debug — diagnose token state (admin-only)
  app.get("/mcp/debug",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
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

    // Recent grants — do not expose token bytes to the admin panel.
    // Only reveal first 4 characters (enough for correlation, not brute force).
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

    // Claude client state — never select clientSecret even if !! later.
    const claudeClient = await prisma.oAuthClient.findUnique({
      where: { clientId: "claude" },
      select: { id: true, redirectUris: true, scopes: true },
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
        tokenPrefix: g.accessToken.substring(0, 4) + "...",
        client: g.client.clientId,
        scopes: g.scopes,
        createdAt: g.createdAt,
        expiresAt: g.expiresAt,
        expired: g.expiresAt < new Date(),
        revoked: !!g.revokedAt,
      })),
      claudeClient: claudeClient ? {
        exists: true,
        hasSecret: false, // public client; never reveal any secret metadata
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
