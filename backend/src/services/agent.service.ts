import Groq from "groq-sdk";
import { searchProducts, getProduct, getProductAvailability } from "./catalog.service.js";
import { getOrCreateCart, addToCart, updateCartItem, removeFromCart } from "./cart.service.js";
import { createCheckout } from "./checkout.service.js";
import { getUserOrders, cancelOrder } from "./order.service.js";
import { auditLog } from "./audit.service.js";
import { prisma } from "../db/prisma.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ProductCard = Record<string, any>;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "" });

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: Groq.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_products",
      description: "Semantically search Urban Store product catalogue. Understands natural language like 'something cozy for winter', 'minimal office bag', 'gift for dad under 1000'. Use for finding products based on any user intent, mood, occasion, category, price, or keywords. Always try this first when user wants to find or browse products.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural language search — e.g. 'black minimal backpack for office', 'cozy winter jacket', 'something for travel under 3000'" },
          category: { type: "string", description: "Category filter: footwear, bags, fashion, accessories, lifestyle" },
          subcategory: { type: "string", description: "Subcategory e.g. running_shoes, laptop_bags, t_shirts, watches" },
          minPrice: { type: "number", description: "Minimum price in INR" },
          maxPrice: { type: "number", description: "Maximum price in INR" },
          availability: { type: "string", enum: ["in_stock", "low_stock"], description: "Filter by availability" },
          limit: { type: "number", description: "Max results to return (default 5)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product",
      description: "Get full details of a specific product by ID including all variants.",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "string", description: "Product ID e.g. urs_shoe_001" },
        },
        required: ["productId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_availability",
      description: "Check real-time stock availability for a product.",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "string", description: "Product ID to check availability for" },
        },
        required: ["productId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cart",
      description: "Get the user's current shopping cart contents and totals.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_to_cart",
      description: "Add a product variant to the user's cart.",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "string", description: "Product ID" },
          variantSku: { type: "string", description: "Variant SKU e.g. URS-SHOE-001-BLK-8" },
          quantity: { type: "number", description: "Quantity to add (default 1)" },
        },
        required: ["productId", "variantSku"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_cart_item",
      description: "Update quantity of an item already in the cart.",
      parameters: {
        type: "object",
        properties: {
          itemId: { type: "string", description: "Cart item ID" },
          quantity: { type: "number", description: "New quantity" },
        },
        required: ["itemId", "quantity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_from_cart",
      description: "Remove an item from the cart.",
      parameters: {
        type: "object",
        properties: {
          itemId: { type: "string", description: "Cart item ID to remove" },
        },
        required: ["itemId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_checkout",
      description: "Initiate checkout for the user's current cart. Only call this AFTER user has explicitly confirmed payment with YES. Validates stock, prices, and policy. Returns Razorpay order details.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_discounts",
      description: "Find discounted products where the selling price is lower than MRP. Use when user asks for deals, discounts, sale items, or best value products.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "Optional category filter: footwear, bags, fashion, accessories, lifestyle" },
          maxPrice: { type: "number", description: "Optional max price filter in INR" },
          limit: { type: "number", description: "Max results (default 3)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_orders",
      description: "Get the user's order history. Use when user asks about previous orders, wants to reorder something, asks 'what did I buy last time', or wants to cancel/track an order.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_order",
      description: "Cancel a specific order by order ID. Only use when user explicitly asks to cancel an order. Always confirm the order ID before cancelling.",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "The order ID to cancel" },
        },
        required: ["orderId"],
      },
    },
  },
];

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Urban AI, the intelligent shopping assistant for Urban Store — a premium Indian e-commerce store specialising in footwear, bags, fashion, accessories, and lifestyle products.

CRITICAL RULES — NEVER BREAK THESE:
- NEVER make up, invent, or describe products that don't exist in the catalogue. ALWAYS call search_products first and only show what it returns.
- NEVER describe products by name, price, or details unless you have just called a tool and received that data in this conversation.
- If search_products returns 0 results, say "I couldn't find that in our catalogue" and suggest a related category search.
- NEVER say "we have" or "we carry" without having just called search_products.

CONVERSATION FLOW:

STEP 1 — FIND PRODUCTS:
Before searching, check if the query has enough information:
- A clear product type (bag, watch, shoes, shirt etc.) AND at least one of: budget, occasion, style, or specific use case → search immediately.
- Vague query with only a product type and nothing else (e.g. "shoes", "bag", "something nice") → ask ONE short clarifying question. Max one question, max two options. Example: "Any budget in mind? And is this for office or casual use?"
- Once user provides any additional detail → search immediately with what you have. Do not ask again.

When searching → call search_products with limit=3.
Only show products that were returned by the tool. Show max 3.
End with: "Would you like to add one to your cart?"

If search returns 0 results → retry with a broader query (remove subcategory/price filters, use just the main category keyword). Only say "not found" after two attempts both return 0 results.

For deals/discounts → call search_discounts.
For order history → call get_orders.

STEP 2 — ADD TO CART:
When user picks a product → call add_to_cart immediately.
Show cart summary. Say: "Ready to checkout?"

If add_to_cart returns OUT_OF_STOCK:
Say: "Sorry, that's out of stock. Let me find alternatives..."
Call search_products with similar keywords.

STEP 3 — CHECKOUT (GATED):
When user says "checkout", "buy", "pay", "proceed":
ALWAYS ask: "About to charge ₹[amount] for [item]. Confirm? Reply YES to proceed."
Wait for YES before calling create_checkout.

STEP 4 — PAYMENT:
Only after YES → call create_checkout.

OTHER RULES:
- Max 3 products per response
- Keep replies short — under 3 lines after product cards
- NEVER use markdown tables. NEVER use | characters. Plain conversational text only.
- NEVER use bullet points with - or *. Use plain sentences.
- Never show SKUs or internal IDs
- For out of stock → suggest alternatives immediately
- When user asks "better version", "upgrade", "premium" → call search_products with similar query and higher price range
- When user says "specs", "details", "tell me more" after seeing products → call get_product for ALL products shown, then summarise in plain text. Do not ask which one.
- For items outside our categories (groceries, electronics, etc.) → say "Urban Store specialises in fashion, accessories, and bags. We don't carry [item]." Do NOT suggest alternatives you haven't searched for.`;


// ─── Message history type ─────────────────────────────────────────────────────

export type ChatMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Groq.Chat.ChatCompletionMessageToolCall[];
};

// ─── Reasoning step (for dev mode) ───────────────────────────────────────────

export interface ReasoningStep {
  type: "thinking" | "tool_call" | "tool_result" | "final_response";
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  content?: string;
  iteration: number;
  durationMs?: number;
}

// ─── Explainability block — what the AI understood ───────────────────────────

export interface ExplainBlock {
  understood: {
    category?: string;
    budget?: string;
    style?: string[];
    context?: string[];
    intent?: string;
  };
  search: {
    query: string;
    filters: Record<string, unknown>;
    resultsFound: number;
    withinBudget?: number;
    semanticMatches?: number;
  };
  selection?: {
    reason: string[];
    priceNote?: string;
    styleNote?: string;
    contextNote?: string;
  };
}

// ─── Execute tool ─────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  agentGrantId?: string,
  sessionId?: string,
  isCheckoutConfirmed?: (sid: string) => boolean,
  clearConfirmation?: (sid: string) => void
): Promise<string> {
  try {
    switch (name) {
      case "search_products": {
        const result = await searchProducts({
          query: args.query as string | undefined,
          category: args.category as string | undefined,
          subcategory: args.subcategory as string | undefined,
          minPrice: args.minPrice as number | undefined,
          maxPrice: args.maxPrice as number | undefined,
          availability: args.availability as string | undefined,
          limit: (args.limit as number | undefined) ?? 3,
        });
        return JSON.stringify(result);
      }

      case "get_product": {
        const product = await getProduct(args.productId as string);
        if (!product) return JSON.stringify({ error: "Product not found" });
        return JSON.stringify(product);
      }

      case "get_availability": {
        const avail = await getProductAvailability(args.productId as string);
        if (!avail) return JSON.stringify({ error: "Product not found" });
        return JSON.stringify(avail);
      }

      case "get_cart": {
        const cart = await getOrCreateCart(userId, agentGrantId);
        return JSON.stringify(cart);
      }

      case "add_to_cart": {
        const cart = await addToCart(
          userId,
          args.productId as string,
          args.variantSku as string,
          (args.quantity as number | undefined) ?? 1,
          agentGrantId
        );
        return JSON.stringify(cart);
      }

      case "update_cart_item": {
        const cart = await updateCartItem(
          userId,
          args.itemId as string,
          args.quantity as number,
          agentGrantId
        );
        return JSON.stringify(cart);
      }

      case "remove_from_cart": {
        const cart = await removeFromCart(
          userId,
          args.itemId as string,
          agentGrantId
        );
        return JSON.stringify(cart);
      }

      case "create_checkout": {
        // ── Server-side gate: block if user hasn't explicitly confirmed ──────
        if (isCheckoutConfirmed && sessionId && !isCheckoutConfirmed(sessionId)) {
          return JSON.stringify({
            error: "CONFIRMATION_REQUIRED",
            message: "Payment not confirmed. Ask the user to reply YES to confirm before proceeding.",
          });
        }
        const checkout = await createCheckout(userId, agentGrantId);
        // Clear the confirmation after use — one-time gate
        if (clearConfirmation && sessionId) clearConfirmation(sessionId);
        return JSON.stringify(checkout);
      }

      case "search_discounts": {
        // Find products where price < mrp — indicates a discount
        const limit = (args.limit as number | undefined) ?? 3;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const where: any = {
          variants: {
            some: {
              // priceAmount less than mrpAmount — discounted
              AND: [
                { availabilityStatus: { in: ["in_stock", "low_stock"] } },
              ],
            },
          },
        };

        if (args.category) {
          where.categoryId = { equals: (args.category as string).toLowerCase(), mode: "insensitive" };
        }
        if (args.maxPrice) {
          where.variants.some.AND.push({ priceAmount: { lte: args.maxPrice as number } });
        }

        const products = await prisma.product.findMany({
          where,
          include: { variants: true },
          take: 20, // fetch more to filter for actual discounts
        });

        // Filter to only genuinely discounted products
        const { formatProduct } = await import("./catalog.service.js");
        const discounted = products
          .map(formatProduct)
          .filter((p) => p.mrp > p.price)
          .sort((a, b) => {
            // Sort by highest discount %
            const discA = ((a.mrp - a.price) / a.mrp) * 100;
            const discB = ((b.mrp - b.price) / b.mrp) * 100;
            return discB - discA;
          })
          .slice(0, limit);

        return JSON.stringify({
          products: discounted,
          total: discounted.length,
          message: discounted.length > 0
            ? `Found ${discounted.length} discounted products:`
            : "No discounted products found right now.",
        });
      }

      case "get_orders": {
        const orders = await getUserOrders(userId);
        if (orders.length === 0) {
          return JSON.stringify({
            orders: [],
            message: "You haven't placed any orders yet.",
          });
        }

        // Format orders for AI readability
        const formatted = orders.slice(0, 5).map((o) => ({
          orderId: o.id,
          status: o.status,
          total: o.total,
          currency: o.currency,
          placedAt: o.createdAt,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          items: (o.items as any[]).map((i) => ({
            name: i.productName,
            brand: i.brand,
            variant: i.attributes,
            quantity: i.quantity,
            price: i.price,
            productId: i.productId,
          })),
        }));

        return JSON.stringify({
          orders: formatted,
          totalOrders: orders.length,
          lastOrder: formatted[0] ?? null,
        });
      }

      case "cancel_order": {
        try {
          const result = await cancelOrder(args.orderId as string, userId);
          await auditLog({
            userId, agentGrantId,
            action: "order.cancel",
            payload: { orderId: args.orderId },
          });
          return JSON.stringify({
            success: true,
            orderId: result.orderId,
            message: `Order ${result.orderId.slice(-8)} has been cancelled successfully.`,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Cancel failed";
          return JSON.stringify({
            success: false,
            error: msg,
            message: msg === "CANNOT_CANCEL"
              ? "This order can no longer be cancelled — it may already be shipped or delivered."
              : "Failed to cancel the order.",
          });
        }
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return JSON.stringify({ error: msg });
  }
}

// ─── Audit entry ─────────────────────────────────────────────────────────────

export interface AuditEntry {
  timestamp: string;
  event: string;
  detail: Record<string, unknown>;
  durationMs?: number;
}

function ts() {
  return new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// ─── Build explainability block from tool calls ───────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildExplainBlock(userMessage: string, toolCalls: { name: string; args: any; result: any }[]): ExplainBlock | null {
  if (toolCalls.length === 0) return null;

  const msg = userMessage.toLowerCase();
  const searchCall = toolCalls.find((t) => t.name === "search_products" || t.name === "search_discounts");
  const orderCall  = toolCalls.find((t) => t.name === "get_orders");

  // ── Order history intent ──────────────────────────────────────────────────
  if (orderCall && !searchCall) {
    const orders = orderCall.result?.orders ?? [];
    return {
      understood: { intent: userMessage.slice(0, 80) },
      search: {
        query: "order history",
        filters: {},
        resultsFound: orders.length,
        semanticMatches: undefined,
      },
    };
  }

  // ── No search call — still show a minimal reasoning block ─────────────────
  if (!searchCall) {
    return {
      understood: { intent: userMessage.slice(0, 80) },
      search: { query: userMessage, filters: {}, resultsFound: 0 },
    };
  }

  // ── Full search intent parsing ────────────────────────────────────────────
  const args   = searchCall.args;
  const result = searchCall.result;

  const understood: ExplainBlock["understood"] = {};

  // Category
  if (args.category) {
    understood.category = String(args.category).charAt(0).toUpperCase() + String(args.category).slice(1);
  } else if (msg.includes("watch"))                               understood.category = "Watches";
  else if (msg.includes("bag") || msg.includes("backpack"))       understood.category = "Bags";
  else if (msg.includes("shoe") || msg.includes("sneaker"))       understood.category = "Footwear";
  else if (msg.includes("shirt") || msg.includes("tee") || msg.includes("jeans")) understood.category = "Fashion";
  else if (msg.includes("gift"))                                  understood.category = "Gifting";
  else if (msg.includes("accessory") || msg.includes("accessories")) understood.category = "Accessories";

  // Budget
  if (args.maxPrice) understood.budget = `≤ ₹${Number(args.maxPrice).toLocaleString("en-IN")}`;
  else if (args.minPrice) understood.budget = `≥ ₹${Number(args.minPrice).toLocaleString("en-IN")}`;

  // Style
  const styleMap: Record<string, string> = {
    minimal: "Minimal", modern: "Modern", classic: "Classic",
    casual: "Casual", formal: "Formal", sporty: "Sporty",
    streetwear: "Streetwear", retro: "Retro", slim: "Slim fit",
    oversized: "Oversized", elegant: "Elegant", trending: "Trending",
    popular: "Popular", bestseller: "Bestseller",
  };
  const styles = Object.entries(styleMap).filter(([k]) => msg.includes(k)).map(([, v]) => v);
  if (styles.length > 0) understood.style = styles;

  // Context
  const contextMap: Record<string, string> = {
    office: "Office", gym: "Gym", travel: "Travel", wedding: "Wedding",
    college: "College", gift: "Gifting", outdoor: "Outdoor",
    "rainy": "Wet weather", everyday: "Everyday", work: "Work",
  };
  const contexts = Object.entries(contextMap).filter(([k]) => msg.includes(k)).map(([, v]) => v);
  if (contexts.length > 0) understood.context = contexts;

  understood.intent = args.query ?? userMessage.slice(0, 60);

  // Search stats
  const products = result?.products ?? [];
  const maxPrice = args.maxPrice;
  const withinBudget = maxPrice
    ? products.filter((p: ProductCard) => p.price <= maxPrice).length
    : undefined;

  const search: ExplainBlock["search"] = {
    query: args.query ?? userMessage,
    filters: {
      ...(args.category  ? { category: args.category }   : {}),
      ...(args.maxPrice  ? { maxPrice: args.maxPrice }    : {}),
      ...(args.minPrice  ? { minPrice: args.minPrice }    : {}),
      ...(args.availability ? { availability: args.availability } : {}),
    },
    resultsFound: products.length,
    withinBudget,
    semanticMatches: Math.min(products.length, 3),
  };

  return { understood, search };
}

export async function runAgentTurn(
  userId: string,
  userMessage: string,
  history: ChatMessage[],
  agentGrantId?: string,
  sessionId?: string,
  isCheckoutConfirmed?: (sid: string) => boolean,
  clearConfirmation?: (sid: string) => void
): Promise<{ reply: string; updatedHistory: ChatMessage[]; products?: ProductCard[]; audit: AuditEntry[]; explain?: ExplainBlock }> {
  const messages: ChatMessage[] = [
    ...history,
    { role: "user", content: userMessage },
  ];

  const audit: AuditEntry[] = [];
  let lastSearchResults: ProductCard[] | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolCallLog: { name: string; args: any; result: any }[] = [];

  audit.push({ timestamp: ts(), event: "USER_REQUEST", detail: { message: userMessage } });

  await auditLog({
    userId, agentGrantId, action: "agent.message",
    payload: { message: userMessage.slice(0, 200) },
  });

  // Inject order history context on first turn (no history yet)
  let orderContext = "";
  if (history.length === 0) {
    try {
      const orders = await getUserOrders(userId);
      if (orders.length > 0) {
        const last = orders[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const itemNames = (last.items as any[]).map((i) => i.productName).join(", ");
        orderContext = `\n\nUSER ORDER HISTORY CONTEXT (do not reveal unless asked):
Last order: ${itemNames} — ₹${last.total} — Status: ${last.status} — Order ID: ${last.id}
Total orders placed: ${orders.length}`;
      }
    } catch { /* ignore — order history is optional context */ }
  }

  // Tool-call loop — max 5 iterations to prevent infinite loops
  for (let i = 0; i < 5; i++) {
    const response = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT + orderContext },
        ...(messages as Groq.Chat.ChatCompletionMessageParam[]),
      ],
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.3,
      max_tokens: 1024,
    });

    const choice = response.choices[0];
    const msg = choice.message;

    // No tool calls — final response
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const reply = msg.content ?? "I'm not sure how to help with that.";
      messages.push({ role: "assistant", content: reply });
      const explain = buildExplainBlock(userMessage, toolCallLog);
      return { reply, updatedHistory: messages, products: lastSearchResults, audit, explain: explain ?? undefined };
    }

    messages.push({
      role: "assistant",
      content: msg.content ?? "",
      tool_calls: msg.tool_calls,
    });

    for (const toolCall of msg.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments || "{}");
      const toolName = toolCall.function.name;

      audit.push({ timestamp: ts(), event: "TOOL_CALL", detail: { tool: toolName, args } });

      const t1 = Date.now();
      const result = await executeTool(toolName, args, userId, agentGrantId, sessionId, isCheckoutConfirmed, clearConfirmation);
      const duration = Date.now() - t1;

      let parsedResult: unknown;
      try { parsedResult = JSON.parse(result); } catch { parsedResult = result; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = parsedResult as any;

      // Readable result summary
      let resultSummary: Record<string, unknown> = {};
      if (toolName === "search_products") {
        resultSummary = { productsFound: r?.products?.length ?? 0, searchMode: r?.searchMode };
      } else if (toolName === "add_to_cart") {
        resultSummary = { cartTotal: r?.subtotal, itemCount: r?.itemCount };
      } else if (toolName === "create_checkout") {
        resultSummary = { checkoutId: r?.checkoutId, total: r?.subtotal, razorpayOrderId: r?.razorpayOrderId };
        audit.push({
          timestamp: ts(),
          event: "POLICY",
          detail: { requiresConfirmation: r?.requiresConfirmation, warnings: r?.policyWarnings?.length ?? 0, total: r?.subtotal },
        });
      } else if (toolName === "get_cart") {
        resultSummary = { items: r?.itemCount, total: r?.subtotal };
      } else if (r?.error) {
        resultSummary = { error: r.error };
      } else { resultSummary = { ok: true }; }

      audit.push({ timestamp: ts(), event: "TOOL_RESULT", detail: { tool: toolName, ...resultSummary }, durationMs: duration });

      // Capture product results for frontend display
      if (toolName === "search_products" || toolName === "search_discounts") {
        try {
          if (r?.products && Array.isArray(r.products) && r.products.length > 0) {
            lastSearchResults = r.products.slice(0, 3);
          }
        } catch { /* ignore */ }
      }
      if (toolName === "get_product") {
        try {
          if (r?.id && r?.name) lastSearchResults = [r];
        } catch { /* ignore */ }
      }
      if (toolName === "get_upsell") {
        try {
          if (r?.upsells && r.upsells.length > 0) lastSearchResults = r.upsells.slice(0, 3);
        } catch { /* ignore */ }
      }
      if (toolName === "get_upgrade") {
        try {
          if (r?.upgrades && r.upgrades.length > 0) lastSearchResults = r.upgrades.slice(0, 3);
        } catch { /* ignore */ }
      }

      toolCallLog.push({ name: toolName, args, result: parsedResult });

      messages.push({ role: "tool", tool_call_id: toolCall.id, content: result });
    }
  }

  const fallback = "I've processed your request. Is there anything else I can help you with?";
  messages.push({ role: "assistant", content: fallback });
  return { reply: fallback, updatedHistory: messages, products: lastSearchResults, audit, explain: undefined };
}

// ─── Agent loop with full reasoning trace ─────────────────────────────────────

export async function runAgentTurnWithReasoning(
  userId: string,
  userMessage: string,
  history: ChatMessage[],
  agentGrantId?: string
): Promise<{ reply: string; updatedHistory: ChatMessage[]; reasoning: ReasoningStep[] }> {
  const messages: ChatMessage[] = [
    ...history,
    { role: "user", content: userMessage },
  ];

  const reasoning: ReasoningStep[] = [];
  let iteration = 0;

  for (let i = 0; i < 5; i++) {
    iteration = i + 1;
    const t0 = Date.now();

    const response = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...(messages as Groq.Chat.ChatCompletionMessageParam[]),
      ],
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.3,
      max_tokens: 1024,
    });

    const choice = response.choices[0];
    const msg = choice.message;
    const llmDuration = Date.now() - t0;

    // Record thinking step if LLM produced text before tool call
    if (msg.content) {
      reasoning.push({
        type: "thinking",
        content: msg.content,
        iteration,
        durationMs: llmDuration,
      });
    }

    // No tool calls — final answer
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const reply = msg.content ?? "I'm not sure how to help with that.";
      messages.push({ role: "assistant", content: reply });
      reasoning.push({
        type: "final_response",
        content: reply,
        iteration,
        durationMs: llmDuration,
      });
      return { reply, updatedHistory: messages, reasoning };
    }

    // Record tool call intent
    for (const toolCall of msg.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments || "{}");
      reasoning.push({
        type: "tool_call",
        toolName: toolCall.function.name,
        toolArgs: args,
        iteration,
        durationMs: llmDuration,
      });
    }

    messages.push({
      role: "assistant",
      content: msg.content ?? "",
      tool_calls: msg.tool_calls,
    });

    // Execute tools and record results
    for (const toolCall of msg.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments || "{}");
      const t1 = Date.now();
      const result = await executeTool(toolCall.function.name, args, userId, agentGrantId);
      const toolDuration = Date.now() - t1;

      let parsedResult: unknown;
      try {
        parsedResult = JSON.parse(result);
      } catch {
        parsedResult = result;
      }

      reasoning.push({
        type: "tool_result",
        toolName: toolCall.function.name,
        toolResult: parsedResult,
        iteration,
        durationMs: toolDuration,
      });

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }

  const fallback = "I've processed your request. Is there anything else I can help you with?";
  messages.push({ role: "assistant", content: fallback });
  reasoning.push({ type: "final_response", content: fallback, iteration });
  return { reply: fallback, updatedHistory: messages, reasoning };
}
