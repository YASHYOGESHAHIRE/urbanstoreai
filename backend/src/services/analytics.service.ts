import { prisma } from "../db/prisma.js";

// ─── Revenue & orders ─────────────────────────────────────────────────────────

export async function getRevenueStats(days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: since }, status: { not: "cancelled" } },
    select: { total: true, createdAt: true, itemsJson: true },
  });

  const totalRevenue = orders.reduce((s, o) => s + o.total, 0);
  const orderCount = orders.length;
  const avgOrderValue = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0;

  // Daily breakdown for chart
  const dailyMap = new Map<string, number>();
  for (const o of orders) {
    const day = o.createdAt.toISOString().slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + o.total);
  }
  const dailyRevenue = Array.from(dailyMap.entries())
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { totalRevenue, orderCount, avgOrderValue, dailyRevenue };
}

// ─── Product velocity (units sold per day) ────────────────────────────────────

export async function getProductVelocity(days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: since }, status: { not: "cancelled" } },
    select: { itemsJson: true },
  });

  // Count units sold per product
  const soldMap = new Map<string, { productId: string; name: string; brand: string; unitsSold: number; revenue: number }>();

  for (const order of orders) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = order.itemsJson as any[];
    for (const item of items) {
      const existing = soldMap.get(item.productId);
      if (existing) {
        existing.unitsSold += item.quantity;
        existing.revenue += item.subtotal;
      } else {
        soldMap.set(item.productId, {
          productId: item.productId,
          name: item.productName ?? item.name ?? "Unknown",
          brand: item.brand ?? "",
          unitsSold: item.quantity,
          revenue: item.subtotal,
        });
      }
    }
  }

  const velocityList = Array.from(soldMap.values())
    .map((p) => ({
      ...p,
      unitsPerDay: Math.round((p.unitsSold / days) * 100) / 100,
    }))
    .sort((a, b) => b.unitsSold - a.unitsSold);

  return velocityList;
}

// ─── Top selling products ─────────────────────────────────────────────────────

export async function getTopSellingProducts(limit = 5, days = 30) {
  const velocity = await getProductVelocity(days);
  return velocity.slice(0, limit);
}

// ─── Slow moving products ─────────────────────────────────────────────────────

export interface SlowProduct {
  productId: string;
  name: string;
  brand: string;
  categoryId: string;
  subcategoryId: string;
  totalStock: number;
  unitsSold: number;
  sellThroughRate: number;
  lockedValue: number;
  price: number;
  mrp: number;
}

export async function getSlowMovingProducts(days = 30, minStock = 5) {
  const velocity = await getProductVelocity(days);
  const soldProductIds = new Set(velocity.map((v) => v.productId));

  // Products with stock but zero/low sales
  const allProducts = await prisma.product.findMany({
    include: { variants: true },
  });

  const slow: SlowProduct[] = [];
  for (const product of allProducts) {
    const totalStock = product.variants.reduce((s, v) => s + v.quantityAvailable, 0);
    if (totalStock < minStock) continue;

    const salesData = velocity.find((v) => v.productId === product.id);
    const unitsSold = salesData?.unitsSold ?? 0;
    const sellThroughRate = totalStock > 0 ? unitsSold / (unitsSold + totalStock) : 0;

    if (unitsSold === 0 || sellThroughRate < 0.2) {
      const lowestPrice = Math.min(...product.variants.map((v) => v.priceAmount));
      slow.push({
        productId: product.id,
        name: product.name,
        brand: product.brand,
        categoryId: product.categoryId,
        subcategoryId: product.subcategoryId,
        totalStock,
        unitsSold,
        sellThroughRate: Math.round(sellThroughRate * 100),
        lockedValue: totalStock * lowestPrice,
        price: lowestPrice,
        mrp: Math.min(...product.variants.map((v) => v.mrpAmount)),
      });
    }
  }

  return slow.sort((a, b) => b.lockedValue - a.lockedValue);
}

// ─── Cart abandonment ─────────────────────────────────────────────────────────

export async function getCartAbandonmentStats() {
  const totalCarts = await prisma.cart.count();
  const checkedOut = await prisma.cart.count({ where: { status: "checked_out" } });
  const abandoned = await prisma.cart.count({ where: { status: "active" } });

  const abandonmentRate = totalCarts > 0
    ? Math.round((abandoned / totalCarts) * 100)
    : 0;

  // Value locked in abandoned carts
  const activeCarts = await prisma.cart.findMany({
    where: { status: "active" },
    include: { items: true },
  });
  const abandonedValue = activeCarts.reduce(
    (s, c) => s + c.items.reduce((is, i) => is + i.priceSnapshot * i.quantity, 0),
    0
  );

  return { totalCarts, checkedOut, abandoned, abandonmentRate, abandonedValue };
}

// ─── Stock health ─────────────────────────────────────────────────────────────

export async function getStockHealth() {
  const variants = await prisma.productVariant.findMany({
    select: { availabilityStatus: true, quantityAvailable: true, productId: true },
  });

  const inStock = variants.filter((v) => v.availabilityStatus === "in_stock").length;
  const lowStock = variants.filter((v) => v.availabilityStatus === "low_stock").length;
  const outOfStock = variants.filter((v) => v.availabilityStatus === "out_of_stock").length;
  const total = variants.length;

  // Low stock products (quantity <= 5)
  const lowStockProducts = await prisma.product.findMany({
    where: { variants: { some: { quantityAvailable: { lte: 5, gt: 0 } } } },
    include: { variants: { where: { quantityAvailable: { lte: 5, gt: 0 } } } },
    take: 10,
  });

  return {
    total,
    inStock,
    lowStock,
    outOfStock,
    healthScore: Math.round((inStock / total) * 100),
    lowStockAlerts: lowStockProducts.map((p) => ({
      productId: p.id,
      name: p.name,
      minStock: Math.min(...p.variants.map((v) => v.quantityAvailable)),
    })),
  };
}

// ─── User activity ────────────────────────────────────────────────────────────

export async function getUserActivityStats(days = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [totalUsers, recentAuditCount, recentOrders] = await Promise.all([
    prisma.user.count(),
    prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
    prisma.order.count({ where: { createdAt: { gte: since } } }),
  ]);

  // Agent usage
  const agentActions = await prisma.auditLog.count({
    where: { action: { startsWith: "agent." }, createdAt: { gte: since } },
  });

  // Payment success rate
  const paymentCaptures = await prisma.auditLog.count({
    where: { action: "webhook.payment_captured", createdAt: { gte: since } },
  });
  const paymentFailed = await prisma.auditLog.count({
    where: { action: "webhook.payment_failed", createdAt: { gte: since } },
  });
  const paymentSuccessRate = (paymentCaptures + paymentFailed) > 0
    ? Math.round((paymentCaptures / (paymentCaptures + paymentFailed)) * 100)
    : 100;

  return {
    totalUsers,
    recentActions: recentAuditCount,
    recentOrders,
    agentConversations: agentActions,
    paymentSuccessRate,
  };
}

// ─── Full dashboard snapshot ──────────────────────────────────────────────────

export async function getDashboardSnapshot() {
  const [revenue, topSelling, slowMoving, cartStats, stockHealth, userStats] =
    await Promise.all([
      getRevenueStats(30),
      getTopSellingProducts(5, 30),
      getSlowMovingProducts(30),
      getCartAbandonmentStats(),
      getStockHealth(),
      getUserActivityStats(7),
    ]);

  return {
    revenue,
    topSelling,
    slowMoving: slowMoving.slice(0, 5),
    cart: cartStats,
    stock: stockHealth,
    users: userStats,
    generatedAt: new Date().toISOString(),
  };
}
