import { prisma } from "../db/prisma.js";
import { auditLog } from "./audit.service.js";

// ─── Get or create active cart ────────────────────────────────────────────────

export async function getOrCreateCart(userId: string, agentGrantId?: string) {
  let cart = await prisma.cart.findFirst({
    where: { userId, status: "active" },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, brand: true, subcategoryId: true } },
          variant: true,
        },
        orderBy: { addedAt: "asc" },
      },
    },
  });

  if (!cart) {
    cart = await prisma.cart.create({
      data: { userId, agentGrantId, status: "active" },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, brand: true, subcategoryId: true } },
            variant: true,
          },
        },
      },
    });
  }

  return formatCart(cart);
}

// ─── Add item (Fix #5: atomic validate + upsert in single transaction) ────────

export async function addToCart(
  userId: string,
  productId: string,
  variantSku: string,
  quantity: number,
  agentGrantId?: string
) {
  const result = await prisma.$transaction(async (tx) => {
    // Validate product + variant inside transaction
    const variant = await tx.productVariant.findUnique({
      where: { sku: variantSku },
      include: { product: true },
    });

    if (!variant || variant.productId !== productId) {
      throw new Error("INVALID_PRODUCT_OR_VARIANT");
    }
    if (variant.availabilityStatus === "out_of_stock") {
      throw new Error("OUT_OF_STOCK");
    }
    if (quantity < 1 || quantity > variant.product.maxQtyPerOrder) {
      throw new Error(`INVALID_QUANTITY:max=${variant.product.maxQtyPerOrder}`);
    }

    // Get or create cart inside same transaction
    let cart = await tx.cart.findFirst({
      where: { userId, status: "active" },
    });
    if (!cart) {
      cart = await tx.cart.create({
        data: { userId, agentGrantId, status: "active" },
      });
    }

    // Upsert cart item inside same transaction — no gap between check and write
    const existing = await tx.cartItem.findUnique({
      where: { cartId_variantSku: { cartId: cart.id, variantSku } },
    });

    if (existing) {
      const newQty = Math.min(
        existing.quantity + quantity,
        variant.product.maxQtyPerOrder
      );
      await tx.cartItem.update({
        where: { id: existing.id },
        data: { quantity: newQty, updatedAt: new Date() },
      });
    } else {
      await tx.cartItem.create({
        data: {
          cartId: cart.id,
          productId,
          variantSku,
          quantity,
          priceSnapshot: variant.priceAmount,
          mrpSnapshot: variant.mrpAmount,
        },
      });
    }

    return cart.id;
  });

  await auditLog({
    userId,
    agentGrantId,
    action: "cart.add",
    payload: { productId, variantSku, quantity, cartId: result },
  });

  return getOrCreateCart(userId, agentGrantId);
}

// ─── Update item qty ──────────────────────────────────────────────────────────

export async function updateCartItem(
  userId: string,
  itemId: string,
  quantity: number,
  agentGrantId?: string
) {
  const item = await prisma.cartItem.findUnique({
    where: { id: itemId },
    include: { cart: true, product: true },
  });

  if (!item || item.cart.userId !== userId) {
    throw new Error("ITEM_NOT_FOUND");
  }
  if (item.cart.status !== "active") {
    throw new Error("CART_NOT_ACTIVE");
  }
  if (quantity < 1 || quantity > item.product.maxQtyPerOrder) {
    throw new Error(`INVALID_QUANTITY:max=${item.product.maxQtyPerOrder}`);
  }

  await prisma.cartItem.update({
    where: { id: itemId },
    data: { quantity, updatedAt: new Date() },
  });

  await auditLog({
    userId,
    agentGrantId,
    action: "cart.update",
    payload: { itemId, quantity },
  });

  return getOrCreateCart(userId, agentGrantId);
}

// ─── Remove item ──────────────────────────────────────────────────────────────

export async function removeFromCart(
  userId: string,
  itemId: string,
  agentGrantId?: string
) {
  const item = await prisma.cartItem.findUnique({
    where: { id: itemId },
    include: { cart: true },
  });

  if (!item || item.cart.userId !== userId) {
    throw new Error("ITEM_NOT_FOUND");
  }

  await prisma.cartItem.delete({ where: { id: itemId } });

  await auditLog({
    userId,
    agentGrantId,
    action: "cart.remove",
    payload: { itemId },
  });

  return getOrCreateCart(userId, agentGrantId);
}

// ─── Format cart ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatCart(cart: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (cart.items ?? []).map((item: any) => ({
    id: item.id,
    productId: item.productId,
    productName: item.product?.name ?? "",
    productBrand: item.product?.brand ?? "",
    variantSku: item.variantSku,
    attributes: item.variant?.attributes ?? {},
    quantity: item.quantity,
    price: item.priceSnapshot,
    mrp: item.mrpSnapshot,
    subtotal: item.priceSnapshot * item.quantity,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subtotal = items.reduce((sum: number, i: any) => sum + i.subtotal, 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const savings  = items.reduce((sum: number, i: any) => sum + (i.mrp - i.price) * i.quantity, 0);

  return {
    id: cart.id,
    userId: cart.userId,
    status: cart.status,
    items,
    subtotal,
    savings,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    itemCount: items.reduce((s: number, i: any) => s + i.quantity, 0),
    currency: "INR",
  };
}
