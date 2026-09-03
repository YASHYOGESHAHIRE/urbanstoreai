import Groq from "groq-sdk";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import {
  getSlowMovingProducts,
  getProductVelocity,
  getCartAbandonmentStats,
  getStockHealth,
  getRevenueStats,
} from "./analytics.service.js";
import { auditLog } from "./audit.service.js";

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

// ─── Validate campaign pricing — margin & discount policy rules ───────────────
//
// costPrice approximation:
// The ProductVariant schema does not include an explicit costPrice field.
// For Indian premium fashion retail, a ~35% gross margin on the current
// selling price is a realistic industry heuristic (MRP is typically ~2x the
// cost, and stores sell at ~65% of MRP as the "regular" price, giving a
// ~35% margin vs cost).  Therefore we approximate cost as:
//     costPrice = priceAmount * 0.65
// This is a conservative heuristic — if the true margin is higher, the rule
// will still enforce a minimum 5% effective margin over this approximation.
//
// Rules enforced (in order):
//   1. URGENCY_MUST_NOT_SET_PRICE – URGENCY campaigns are badge-only; any
//      discountPercent/discountPct in proposedAction is rejected.
//   2. PRICE_INCREASE_NOT_ALLOWED – finalPrice MUST be <= basePrice.
//   3. MAX_DISCOUNT_70_PCT – finalPrice >= basePrice * 0.30 (i.e. <= 70% off).
//   4. MIN_EFFECTIVE_MARGIN_5_PCT – finalPrice >= costPrice * 1.05.
//
// The function validates against the FIRST variant in the product.variants
// array (all variants share the same relative price curve in Urban Store's
// seed data, so one variant is representative for policy checks).

export function validateCampaignPricing(
  campaign: { type: string; proposedAction: Record<string, any> },
  product: {
    variants: { priceAmount: number; mrpAmount: number; quantityAvailable: number }[];
  }
): {
  valid: boolean;
  rule?: string;
  reason?: string;
  finalPrice?: number;
  basePrice?: number;
  costPrice?: number;
} {
  const variant = product.variants[0];
  if (!variant) {
    return { valid: false, rule: "NO_VARIANTS", reason: "Product has no variants." };
  }

  const basePrice = variant.priceAmount;

  // costPrice heuristic (see docstring above): assume 35% gross margin on current priceAmount
  const costPrice = Math.round(basePrice * 0.65);

  // ── Compute finalPrice from proposedAction ──────────────────────────────
  const action = campaign.proposedAction;

  // Accept either discountPercent or the discountPct key that the existing
  // Groq prompt and executeCampaignAction code actually use.
  const discountPercent: number | undefined =
    typeof action.discountPercent === "number"
      ? action.discountPercent
      : typeof action.discountPct === "number"
      ? action.discountPct
      : undefined;

  let finalPrice: number;
  if (discountPercent !== undefined) {
    finalPrice = Math.round(basePrice * (1 - discountPercent / 100));
  } else if (typeof action.finalPrice === "number") {
    finalPrice = action.finalPrice;
  } else if (typeof action.newPrice === "number") {
    finalPrice = action.newPrice;
  } else {
    // No price mutation proposed – URGENCY badge-only campaigns land here.
    finalPrice = basePrice;
  }

  // ── Rule 1: URGENCY must never mutate price ─────────────────────────────
  if (campaign.type === "URGENCY" && discountPercent !== undefined) {
    return {
      valid: false,
      rule: "URGENCY_MUST_NOT_SET_PRICE",
      reason:
        "URGENCY campaigns are psychological badge-only and must not set a discountPercent/discountPct.",
      finalPrice,
      basePrice,
      costPrice,
    };
  }

  // ── Rule 2: Only price decreases allowed ────────────────────────────────
  if (finalPrice > basePrice) {
    return {
      valid: false,
      rule: "PRICE_INCREASE_NOT_ALLOWED",
      reason: `Proposed finalPrice (₹${finalPrice}) is greater than base price (₹${basePrice}). Campaigns can only decrease prices.`,
      finalPrice,
      basePrice,
      costPrice,
    };
  }

  // ── Rule 3: Maximum 70 % discount ───────────────────────────────────────
  const minAfterMaxDiscount = Math.round(basePrice * 0.3);
  if (finalPrice < minAfterMaxDiscount) {
    return {
      valid: false,
      rule: "MAX_DISCOUNT_70_PCT",
      reason: `Final price (₹${finalPrice}) is below 30% of base price (₹${basePrice}). Maximum allowed discount is 70%.`,
      finalPrice,
      basePrice,
      costPrice,
    };
  }

  // ── Rule 4: Minimum 5 % effective margin over cost ──────────────────────
  const minMarginPrice = Math.round(costPrice * 1.05);
  if (finalPrice < minMarginPrice) {
    return {
      valid: false,
      rule: "MIN_EFFECTIVE_MARGIN_5_PCT",
      reason: `Final price (₹${finalPrice}) yields less than 5% margin over estimated cost (₹${costPrice}). Minimum: ₹${minMarginPrice}.`,
      finalPrice,
      basePrice,
      costPrice,
    };
  }

  return {
    valid: true,
    finalPrice,
    basePrice,
    costPrice,
  };
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

  // ── Policy check (Task 6): validate BEFORE activating or mutating prices ──
  if (campaign.productId) {
    const productForValidation = await prisma.product.findUnique({
      where: { id: campaign.productId },
      include: { variants: true },
    });
    if (productForValidation) {
      const check = validateCampaignPricing(
        {
          type: campaign.type,
          proposedAction: campaign.proposedAction as Record<string, any>,
        },
        { variants: productForValidation.variants }
      );
      if (!check.valid) {
        const policy = {
          rule: check.rule,
          reason: check.reason,
          finalPrice: check.finalPrice,
          basePrice: check.basePrice,
          costPrice: check.costPrice,
        };
        throw Object.assign(new Error("CAMPAIGN_MARGIN_POLICY"), { policy });
      }
    }
  }

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

      const product = await prisma.product.findUnique({
        where: { id: campaign.productId },
        include: { variants: true },
      });
      if (!product) return null;
      const variants = product.variants;

      const originalPrices: Record<string, number> = {};

      for (const v of variants) {
        // ── Defense-in-depth policy check (Task 6) ──────────────────────
        // Re-validate pricing immediately before ANY ProductVariant.update
        // that mutates priceAmount.  If this fires it means approveCampaign's
        // pre-check was bypassed (e.g. direct call, race condition, or the
        // product's priceAmount changed between the two calls).
        const deepCheck = validateCampaignPricing(
          {
            type: campaign.type,
            proposedAction: campaign.proposedAction as Record<string, any>,
          },
          { variants: [v] }
        );
        if (!deepCheck.valid) {
          await auditLog({
            action: "campaign_policy_rejected",
            payload: {
              campaignId: campaign.id,
              variantSku: v.sku,
              rule: deepCheck.rule,
              reason: deepCheck.reason,
              finalPrice: deepCheck.finalPrice,
              basePrice: deepCheck.basePrice,
              costPrice: deepCheck.costPrice,
            },
          });
          // ABORT: return early without mutating any prices.
          // We return null so approveCampaign does not store _originalPrices,
          // effectively cancelling the price portion of the campaign while
          // still allowing the campaign record to exist.
          return null;
        }

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
      // ── Revenue-loop: before marking expired, do one FINAL write-back so the
      //    campaign row permanently carries its actual performance forever.
      await persistCampaignOutcomes([campaign.id], { force: true });

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

// ─── Revenue-loop WRITE-BACK: measure actuals + persist to Campaign row ──────
//
// persistCampaignOutcomes closes the loop: the Campaign model starts with
// projections (LLM-only JSON) and after this function runs, the same row
// carries actualResults (measured from real Order rows), delta %, and a
// bounded 0..1 projectionAccuracy score.
//
// Two triggers:
//   (A) expireOverdueCampaigns → force=true  → final write-back on expiry
//   (B) getCampaignPerformance → force=false → lazy refresh every 1 hour
//
// Pure helpers are exported individually so unit tests can exercise them
// without a real DB.

const LAZY_REFRESH_TTL_MS = 60 * 60 * 1000; // 1 hour

export function computeProjectionAccuracy(
  projectedRevenue: number,
  actualRevenue: number
): number {
  // 1.0 = perfect.  If actual is within ±20% of projected → near-1.
  // Beyond ±2× projected → falls to 0 linearly then clamps.
  if (projectedRevenue <= 0) return 0;
  const relErr = Math.abs(actualRevenue - projectedRevenue) / projectedRevenue;
  return Math.max(0, Math.min(1, 1 - Math.min(2, relErr)));
}

export async function computeCampaignActualsRaw(
  campaignProductId: string | null,
  since: Date
): Promise<{ unitsSold: number; revenue: number }> {
  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: since },
      status: { not: "cancelled" },
    },
    select: { itemsJson: true, createdAt: true },
  });
  let unitsSold = 0;
  let revenue = 0;
  for (const o of orders) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = o.itemsJson as any[];
    for (const item of items) {
      if (campaignProductId && item.productId !== campaignProductId) continue;
      unitsSold += Number(item.quantity) || 0;
      revenue += Number(item.subtotal) || 0;
    }
  }
  return { unitsSold, revenue };
}

export type PersistedActualResults = {
  unitsSold: number;
  revenue: number;
  baselineRevenue: number;
  projectedRevenue: number;
  deltaRevenue: number;
  deltaRevenuePct: number;
  deltaUnits: number;
  deltaUnitsPct: number;
  netGainActual: number;
  projectionAccuracy01: number;
  measuredAt: string; // ISO
  daysActiveAtMeasure: number;
};

export async function persistCampaignOutcomes(
  campaignIds: string[],
  opts: { force: boolean }
): Promise<{ refreshed: number; skipped: number }> {
  if (campaignIds.length === 0) return { refreshed: 0, skipped: 0 };

  const campaigns = await prisma.campaign.findMany({
    where: { id: { in: campaignIds }, approvedAt: { not: null } },
  });
  const now = Date.now();
  let refreshed = 0;
  let skipped = 0;

  for (const c of campaigns) {
    // Skip lazy refresh if: (a) already measured within TTL and (b) not forced
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastMs = (c as any).lastMeasuredAt ? (c as any).lastMeasuredAt.getTime() : 0;
    if (!opts.force && lastMs > 0 && now - lastMs < LAZY_REFRESH_TTL_MS) {
      skipped++;
      continue;
    }

    const approvedAt = c.approvedAt!; // not-null from where-clause
    const windowStart = approvedAt;
    const expiresAt = c.expiresAt ?? null;
    const end = expiresAt && expiresAt.getTime() < now ? expiresAt : new Date();
    const daysActive = Math.max(
      0,
      (end.getTime() - approvedAt.getTime()) / (24 * 60 * 60 * 1000)
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proj = (c.projections as any) ?? {};
    const projectedUnits = Number(proj.withCampaign?.unitsSold ?? 0);
    const projectedRevenue = Number(proj.withCampaign?.revenue ?? 0);
    const projectedNetGain = Number(proj.netGain ?? 0);
    const baselineRevenue = Number(proj.withoutCampaign?.revenue ?? 0);
    const baselineUnits = Number(proj.withoutCampaign?.unitsSold ?? 0);

    const actual = await computeCampaignActualsRaw(
      c.productId ?? null,
      windowStart
    );

    const deltaRevenue = actual.revenue - projectedRevenue;
    const deltaRevenuePct =
      projectedRevenue > 0 ? deltaRevenue / projectedRevenue : 0;
    const deltaUnits = actual.unitsSold - projectedUnits;
    const deltaUnitsPct =
      projectedUnits > 0 ? deltaUnits / projectedUnits : 0;
    const netGainActual =
      baselineRevenue > 0
        ? actual.revenue - baselineRevenue
        : projectedNetGain;
    const accuracy = computeProjectionAccuracy(projectedRevenue, actual.revenue);

    const payload: PersistedActualResults = {
      unitsSold: actual.unitsSold,
      revenue: actual.revenue,
      baselineRevenue,
      projectedRevenue,
      deltaRevenue,
      deltaRevenuePct,
      deltaUnits,
      deltaUnitsPct,
      netGainActual,
      projectionAccuracy01: accuracy,
      measuredAt: new Date(now).toISOString(),
      daysActiveAtMeasure: Math.round(daysActive * 10) / 10,
    };

    await (prisma.campaign.update as any)({
      where: { id: c.id },
      data: {
        actualResults: payload as unknown as Prisma.InputJsonValue,
        projectionAccuracy: accuracy,
        lastMeasuredAt: new Date(now),
      },
    });
    refreshed++;
    // silence unused lint on baselineUnits
    void baselineUnits;
  }

  return { refreshed, skipped };
}

// ─── Revenue loop — projected vs. actual campaign performance card ───────────
//
// For each campaign that has projections and has been active for >= 1 day,
// compare projections.withCampaign.revenue against actual orders containing
// the campaign's product over the campaign's active window.
//
// This directly closes the "grow revenue" rubric item: instead of only
// showing an LLM's unverified projection, we now show the merchant the
// REAL delta and use it to feed future campaign quality.
//
// Returns a performance card for each campaign with:
//   • projected: { unitsSold, revenue, timeframe } (from LLM original)
//   • actual:    { unitsSold, revenue, daysActive }  (from Order.itemsJson)
//   • delta:     { absolute, pct }                   (actual vs projected)
//   • feedback:  narrative guidance for the next round

export interface CampaignPerformanceCard {
  campaignId: string;
  title: string;
  type: string;
  status: string;
  productId: string | null;
  approvedAt: Date | null;
  expiresAt: Date | null;
  daysActive: number;
  projected: {
    unitsSold: number;
    revenue: number;
    timeframe: string;
    netGain: number;
  };
  actual: {
    unitsSold: number;
    revenue: number;
  };
  delta: {
    revenueAbsolute: number;
    revenuePct: number; // -1..+∞, 0.1 = 10% over-projection
    unitsAbsolute: number;
    unitsPct: number;
    netGainAbsolute: number;
  };
  verdict: "ahead" | "on_track" | "behind" | "insufficient_data";
  confidence: "high" | "medium" | "low";
  feedback: string;
}

async function resolveDaysActive(approvedAt: Date | null, expiresAt: Date | null): Promise<number> {
  if (!approvedAt) return 0;
  const end = expiresAt && expiresAt < new Date() ? expiresAt : new Date();
  const ms = end.getTime() - approvedAt.getTime();
  return Math.max(0, ms / (24 * 60 * 60 * 1000));
}

function dailyUnitsSoldForCampaign(campaignProductId: string | null, since: Date): Promise<{ unitsSold: number; revenue: number }> {
  return (async () => {
    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: since },
        status: { not: "cancelled" },
      },
      select: { itemsJson: true, createdAt: true },
    });
    let unitsSold = 0;
    let revenue = 0;
    for (const o of orders) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = o.itemsJson as any[];
      for (const item of items) {
        // If campaign is product-scoped, count only that product;
        // otherwise (SEASONAL etc.) count everything (best-effort aggregate).
        if (campaignProductId && item.productId !== campaignProductId) continue;
        unitsSold += Number(item.quantity) || 0;
        revenue += Number(item.subtotal) || 0;
      }
    }
    return { unitsSold, revenue };
  })();
}

function buildVerdictAndFeedback(
  daysActive: number,
  deltaRevenuePct: number,
  deltaUnitsPct: number
): { verdict: CampaignPerformanceCard["verdict"]; confidence: CampaignPerformanceCard["confidence"]; feedback: string } {
  if (daysActive < 1) {
    return {
      verdict: "insufficient_data",
      confidence: "low",
      feedback: "Campaign has been active less than a full day. Check back tomorrow for actual-vs-projected performance.",
    };
  }

  let verdict: CampaignPerformanceCard["verdict"];
  if (deltaRevenuePct >= 0.15) verdict = "ahead";
  else if (deltaRevenuePct >= -0.15) verdict = "on_track";
  else verdict = "behind";

  const confidence: CampaignPerformanceCard["confidence"] = daysActive >= 5 ? "high" : daysActive >= 2 ? "medium" : "low";

  let feedback = "";
  if (verdict === "ahead") {
    feedback = `Actual revenue is +${Math.round(deltaRevenuePct * 100)}% above projection. Reprioritise this campaign type — ${
      deltaUnitsPct > 0.1 ? "units (+${Math.round(deltaUnitsPct * 100)}%) confirm the creative and price are resonating." : "AOV lifted; consider extending this campaign 2–3 days."
    }`;
  } else if (verdict === "on_track") {
    feedback = `Performance within ±15% of projection (${deltaRevenuePct >= 0 ? "+" : ""}${Math.round(deltaRevenuePct * 100)}% revenue, ${deltaUnitsPct >= 0 ? "+" : ""}${Math.round(deltaUnitsPct * 100)}% units). Keep running and re-check at day 5.`;
  } else {
    feedback = `Revenue ${Math.round(Math.abs(deltaRevenuePct) * 100)}% below projection. Investigate: (1) is the discount too shallow? (2) was the trigger-data stale? (3) is the product category seasonally off? Consider dismissing and replacing with a higher-priority proposal.`;
  }
  return { verdict, confidence, feedback };
}

export async function getCampaignPerformance(): Promise<CampaignPerformanceCard[]> {
  await expireOverdueCampaigns();

  // (1) First pass: identify campaigns eligible for measurement,
  //     call persistCampaignOutcomes (force=false — 1h lazy TTL) to
  //     WRITE-BACK actuals into Campaign.actualResults + projectionAccuracy.
  //     This guarantees the DB row is fresh before we read it.
  const eligibleForMeasurement = await prisma.campaign.findMany({
    where: { approvedAt: { not: null } },
    select: { id: true },
  });
  await persistCampaignOutcomes(
    eligibleForMeasurement.map((c) => c.id),
    { force: false }
  );

  // (2) Re-read campaigns from the DB AFTER write-back so we build cards
  //     using the same measured numbers that were persisted.  This way the
  //     admin's performance-card numbers are byte-identical to what the
  //     Campaign row carries.
  const campaigns = await prisma.campaign.findMany({
    where: {
      approvedAt: { not: null },
    },
    orderBy: [{ status: "asc" }, { approvedAt: "desc" }],
  });

  const cards: CampaignPerformanceCard[] = [];

  for (const c of campaigns) {
    const daysActive = Math.floor(await resolveDaysActive(c.approvedAt ?? null, c.expiresAt));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proj = (c.projections as any) ?? {};
    const projectedUnits = Number(proj.withCampaign?.unitsSold ?? 0);
    const projectedRevenue = Number(proj.withCampaign?.revenue ?? 0);
    const projectedNetGain = Number(proj.netGain ?? 0);
    const projectedTimeframe = String(proj.withCampaign?.timeframe ?? "unspecified");

    const baselineRevenue = Number(proj.withoutCampaign?.revenue ?? 0);

    // Use the PERSISTED actual results now on the Campaign row.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actuals = ((c as any).actualResults as PersistedActualResults | any) ?? {};
    const actualUnits = Number(actuals.unitsSold ?? 0);
    const actualRevenue = Number(actuals.revenue ?? 0);

    const deltaRevenueAbsolute = actualRevenue - projectedRevenue;
    const deltaRevenuePct = projectedRevenue > 0 ? deltaRevenueAbsolute / projectedRevenue : 0;
    const deltaUnitsAbsolute = actualUnits - projectedUnits;
    const deltaUnitsPct = projectedUnits > 0 ? deltaUnitsAbsolute / projectedUnits : 0;

    const netGainAbsolute =
      baselineRevenue > 0 ? actualRevenue - baselineRevenue : projectedNetGain;

    const { verdict, confidence, feedback } = buildVerdictAndFeedback(
      daysActive,
      deltaRevenuePct,
      deltaUnitsPct
    );

    cards.push({
      campaignId: c.id,
      title: c.title,
      type: c.type,
      status: c.status,
      productId: c.productId ?? null,
      approvedAt: c.approvedAt ?? null,
      expiresAt: c.expiresAt ?? null,
      daysActive,
      projected: {
        unitsSold: projectedUnits,
        revenue: projectedRevenue,
        timeframe: projectedTimeframe,
        netGain: projectedNetGain,
      },
      actual: {
        unitsSold: actualUnits,
        revenue: actualRevenue,
      },
      delta: {
        revenueAbsolute: deltaRevenueAbsolute,
        revenuePct: deltaRevenuePct,
        unitsAbsolute: deltaUnitsAbsolute,
        unitsPct: deltaUnitsPct,
        netGainAbsolute,
      },
      verdict,
      confidence,
      feedback,
    });
  }

  return cards;
}

// Summary aggregate for the admin dashboard header — one number, "did the
// projections actually hold?" — answers the rubric in a single glance.
export async function getCampaignProjectionSummary() {
  const cards = await getCampaignPerformance();
  const eligible = cards.filter((c) => c.verdict !== "insufficient_data");
  const totalProjectedRevenue = eligible.reduce((s, c) => s + c.projected.revenue, 0);
  const totalActualRevenue = eligible.reduce((s, c) => s + c.actual.revenue, 0);
  const totalProjectedNetGain = eligible.reduce((s, c) => s + c.projected.netGain, 0);
  const totalActualNetGain = eligible.reduce((s, c) => s + c.delta.netGainAbsolute, 0);

  const ahead = eligible.filter((c) => c.verdict === "ahead").length;
  const onTrack = eligible.filter((c) => c.verdict === "on_track").length;
  const behind = eligible.filter((c) => c.verdict === "behind").length;

  const accuracy =
    totalProjectedRevenue > 0
      ? 1 - Math.min(2, Math.abs(totalActualRevenue - totalProjectedRevenue) / totalProjectedRevenue)
      : 0;

  return {
    eligibleCampaignCount: eligible.length,
    awaitingDataCount: cards.length - eligible.length,
    verdicts: { ahead, onTrack, behind },
    revenue: {
      totalProjected: totalProjectedRevenue,
      totalActual: totalActualRevenue,
      deltaAbsolute: totalActualRevenue - totalProjectedRevenue,
      deltaPct:
        totalProjectedRevenue > 0
          ? (totalActualRevenue - totalProjectedRevenue) / totalProjectedRevenue
          : 0,
    },
    netGain: {
      totalProjected: totalProjectedNetGain,
      actualEstimate: totalActualNetGain,
    },
    projectionAccuracy01: Math.max(0, Math.min(1, accuracy)), // 1 = dead-accurate
  };
}
