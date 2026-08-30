import { prisma } from "../db/prisma.js";

export type BehaviourEvent =
  | "product_viewed"
  | "category_browsed"
  | "search_query"
  | "cart_add"
  | "chat_message"
  | "product_page_viewed";

interface TrackParams {
  userId?: string;
  sessionKey: string;
  event: BehaviourEvent;
  productId?: string;
  categoryId?: string;
  query?: string;
  metadata?: Record<string, unknown>;
}

export async function trackBehaviour(params: TrackParams): Promise<void> {
  try {
    await prisma.userBehaviour.create({
      data: {
        userId: params.userId ?? null,
        sessionKey: params.sessionKey,
        event: params.event,
        productId: params.productId ?? null,
        categoryId: params.categoryId ?? null,
        query: params.query ?? null,
        metadata: (params.metadata ?? {}) as object,
      },
    });
  } catch {
    // Never throw from behaviour tracking — it's non-critical
  }
}

// ─── Get user's recent behaviour (for personalization) ────────────────────────

export async function getUserRecentBehaviour(userId: string, limit = 20) {
  return prisma.userBehaviour.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

// ─── Get most viewed products (site-wide) ────────────────────────────────────

export async function getMostViewedProducts(days = 7, limit = 10) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const views = await prisma.userBehaviour.groupBy({
    by: ["productId"],
    where: {
      event: "product_viewed",
      productId: { not: null },
      createdAt: { gte: since },
    },
    _count: { productId: true },
    orderBy: { _count: { productId: "desc" } },
    take: limit,
  });

  const productIds = views.map((v) => v.productId!).filter(Boolean);

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, brand: true, categoryId: true },
  });

  return views.map((v) => ({
    productId: v.productId,
    viewCount: v._count.productId,
    product: products.find((p) => p.id === v.productId),
  }));
}

// ─── Get trending searches ────────────────────────────────────────────────────

export async function getTrendingSearches(days = 7, limit = 10) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const searches = await prisma.userBehaviour.groupBy({
    by: ["query"],
    where: {
      event: "search_query",
      query: { not: null },
      createdAt: { gte: since },
    },
    _count: { query: true },
    orderBy: { _count: { query: "desc" } },
    take: limit,
  });

  return searches.map((s) => ({
    query: s.query,
    count: s._count.query,
  }));
}
