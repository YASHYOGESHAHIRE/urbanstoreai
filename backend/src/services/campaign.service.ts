import Groq from "groq-sdk";
import { prisma } from "../db/prisma.js";
import {
  getSlowMovingProducts,
  getProductVelocity,
  getCartAbandonmentStats,
  getStockHealth,
  getRevenueStats,
} from "./analytics.service.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "" });

// ─── System prompt for marketing agent ───────────────────────────────────────

const MARKETING_AGENT_PROMPT = `You are the marketing intelligence agent for Urban Store — a premium Indian fashion and accessories e-commerce store.

You will receive REAL store data: inventory levels, sales velocity, revenue, cart abandonment, and product catalogue details.

Your job is to generate specific, data-backed campaign decisions for the merchant (admin).

CAMPAIGN TYPES you can propose:
- CLEARANCE: Product has high stock + low sell rate → propose discount
- BUNDLE: Products frequently bought together → propose combo price
- URGENCY: Product has very low stock → "Only X left" urgency label
- SEASONAL: Product's use_cases match an upcoming season/occasion → homepage highlight
- CROSS_SELL: Cart analysis shows missed upsell opportunities → recommend pairing

STRICT RULES:
1. Every recommendation MUST cite specific numbers from the data provided
2. Every projection MUST show the actual arithmetic (e.g. "8 units × ₹2,699 = ₹21,592")
3. Risk assessment must be honest — do not oversell projections
4. Generate exactly 3-5 decisions, ordered by expected revenue impact (priority 1 = highest)
5. Never recommend below 5% margin
6. All amounts in INR
7. Be specific about timeframes (e.g. "this week", "next 7 days")

OUTPUT: Return ONLY valid JSON, no markdown, no explanation outside the JSON.

{
  "campaigns": [
    {
      "type": "CLEARANCE",
      "productId": "urs_bag_003",
      "title": "Travel Duffel Year-End Clearance",
      "trigger": "15 units in stock, only 1 sold in 30 days (6.7% sell-through). ₹44,985 locked in inventory.",
      "proposedAction": {
        "discountPct": 15,
        "newPrice": 2549,
        "originalPrice": 2999,
        "label": "Year-End Sale",
        "durationDays": 7
      },
      "reasoning": [
        "15 units unsold at current rate = 450 days to clear stock",
        "15% discount brings price to ₹2,549 — still ₹550 above cost",
        "Year-end travel season (Dec) aligns with product use_cases: travel, weekend_trips",
        "Similar discount in Bags category historically drives 3-4x volume increase"
      ],
      "projections": {
        "withoutCampaign": { "unitsSold": 2, "revenue": 5998, "timeframe": "7 days" },
        "withCampaign":    { "unitsSold": 8, "revenue": 20392, "timeframe": "7 days" },
        "netGain": 14394,
        "marginImpact": "-₹450 per unit (15% reduction)",
        "confidence": "medium"
      },
      "risks": [
        "May train customers to wait for discounts on premium bags",
        "If all 15 units sell, restock lead time unknown",
        "Discount should not run beyond 2 weeks to protect brand perception"
      ],
      "priority": 1
    }
  ]
}`;

// ─── Generate campaign decisions ──────────────────────────────────────────────

export async function generateCampaignDecisions(): Promise<void> {
  const [slowMoving, velocity, cartStats, stockHealth, revenue] = await Promise.all([
    getSlowMovingProducts(30),
    getProductVelocity(30),
    getCartAbandonmentStats(),
    getStockHealth(),
    getRevenueStats(30),
  ]);

  const storeData = {
    period: "Last 30 days",
    revenue: {
      total: revenue.totalRevenue,
      orderCount: revenue.orderCount,
      avgOrderValue: revenue.avgOrderValue,
    },
    slowMovingProducts: slowMoving.slice(0, 8).map((p) => ({
      productId: p.productId,
      name: p.name,
      brand: p.brand,
      category: p.categoryId,
      currentStock: p.totalStock,
      unitsSoldLast30Days: p.unitsSold,
      sellThroughRate: `${p.sellThroughRate}%`,
      lockedInventoryValue: `₹${p.lockedValue.toLocaleString("en-IN")}`,
      currentPrice: `₹${p.price.toLocaleString("en-IN")}`,
      mrp: `₹${p.mrp.toLocaleString("en-IN")}`,
    })),
    topSelling: velocity.slice(0, 5).map((p) => ({
      productId: p.productId,
      name: p.name,
      unitsSold: p.unitsSold,
      revenue: `₹${p.revenue.toLocaleString("en-IN")}`,
    })),
    cartAbandonment: {
      rate: `${cartStats.abandonmentRate}%`,
      abandonedCarts: cartStats.abandoned,
      valueAtRisk: `₹${cartStats.abandonedValue.toLocaleString("en-IN")}`,
    },
    stockAlerts: stockHealth.lowStockAlerts.slice(0, 5),
    currentDate: new Date().toLocaleDateString("en-IN", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    }),
  };

  const response = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: MARKETING_AGENT_PROMPT },
      {
        role: "user",
        content: `Here is the current Urban Store data. Generate campaign decisions:\n\n${JSON.stringify(storeData, null, 2)}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 3000,
  });

  const raw = response.choices[0].message.content ?? "{}";

  let parsed: { campaigns: CampaignInput[] };
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse marketing agent response: ${raw.slice(0, 200)}`);
  }

  const campaigns = parsed.campaigns ?? [];
  for (const c of campaigns) {
    await prisma.campaign.create({
      data: {
        type: c.type,
        productId: c.productId ?? null,
        title: c.title,
        trigger: c.trigger,
        proposedAction: c.proposedAction as object,
        reasoning: c.reasoning as object,
        projections: c.projections as object,
        risks: c.risks as object,
        priority: c.priority ?? 1,
        status: "pending",
      },
    });
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CampaignInput {
  type: string;
  productId?: string;
  title: string;
  trigger: string;
  proposedAction: Record<string, unknown>;
  reasoning: string[];
  projections: Record<string, unknown>;
  risks: string[];
  priority: number;
}

// ─── Get all campaigns ────────────────────────────────────────────────────────

export async function getCampaigns(status?: string) {
  return prisma.campaign.findMany({
    where: status ? { status } : {},
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });
}

// ─── Approve campaign ─────────────────────────────────────────────────────────

export async function approveCampaign(id: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id } });

  // Execute the campaign action and capture original prices for later revert
  const originalPrices = await executeCampaignAction(campaign);

  // Store original prices in proposedAction so dismissCampaign/expiry can revert
  const updatedAction = {
    ...(campaign.proposedAction as Record<string, unknown>),
    ...(originalPrices ? { _originalPrices: originalPrices } : {}),
  };

  return prisma.campaign.update({
    where: { id },
    data: {
      status: "active",
      approvedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      proposedAction: updatedAction,
    },
  });
}

// ─── Execute campaign action — apply changes to product/variant data ──────────
// Returns a map of { sku → originalPriceAmount } for CLEARANCE/URGENCY so the
// caller can store it and revert later. Returns null for informational campaigns.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeCampaignAction(campaign: any): Promise<Record<string, number> | null> {
  const action = campaign.proposedAction as Record<string, unknown>;
  if (!campaign.productId) return null;

  switch (campaign.type as string) {
    case "CLEARANCE":
    case "URGENCY": {
      const discountPct = typeof action.discountPct === "number" ? action.discountPct : 0;
      if (discountPct <= 0) return null;

      const variants = await prisma.productVariant.findMany({
        where: { productId: campaign.productId },
      });

      const originalPrices: Record<string, number> = {};

      for (const v of variants) {
        originalPrices[v.sku] = v.priceAmount; // snapshot before change
        const newPrice = Math.round(v.priceAmount * (1 - discountPct / 100));
        await prisma.productVariant.update({
          where: { sku: v.sku },
          data: { priceAmount: newPrice },
        });

        // Fix #8: update priceSnapshot on active cart items for this variant
        // so the policy service doesn't flag a price drift and block checkout
        await prisma.cartItem.updateMany({
          where: {
            variantSku: v.sku,
            cart: { status: "active" },
          },
          data: { priceSnapshot: newPrice },
        });
      }

      return originalPrices;
    }

    case "BUNDLE":
    case "SEASONAL":
    case "CROSS_SELL":
    default:
      return null;
  }
}

// ─── Revert campaign action — restore original prices ────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function revertCampaignAction(campaign: any): Promise<void> {
  const action = campaign.proposedAction as Record<string, unknown>;
  const originalPrices = action._originalPrices as Record<string, number> | undefined;
  if (!originalPrices || Object.keys(originalPrices).length === 0) return;

  for (const [sku, originalPrice] of Object.entries(originalPrices)) {
    await prisma.productVariant.update({
      where: { sku },
      data: { priceAmount: originalPrice },
    });
  }
}

// ─── Dismiss campaign — revert prices if it was active ───────────────────────

export async function dismissCampaign(id: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id } });

  // If campaign was active and had price changes, revert them
  if (campaign.status === "active") {
    await revertCampaignAction(campaign);
  }

  return prisma.campaign.update({
    where: { id },
    data: { status: "dismissed" },
  });
}

// ─── Expire campaigns — called on server startup and by getActiveCampaigns ───

export async function expireOverdueCampaigns(): Promise<void> {
  const expired = await prisma.campaign.findMany({
    where: {
      status: "active",
      expiresAt: { lt: new Date() },
    },
  });

  for (const campaign of expired) {
    try {
      await revertCampaignAction(campaign);
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "expired" },
      });
    } catch (err) {
      console.error(`[campaign] failed to expire campaign ${campaign.id}:`, err);
    }
  }
}

// ─── Get active campaigns (used by storefront) ───────────────────────────────

export async function getActiveCampaigns() {
  // Lazily expire overdue campaigns on every storefront fetch — no cron needed
  await expireOverdueCampaigns();

  return prisma.campaign.findMany({
    where: {
      status: "active",
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    orderBy: { priority: "asc" },
  });
}
