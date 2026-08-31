import { prisma } from "../db/prisma.js";
import { auditLog } from "./audit.service.js";

export async function getUserOrders(userId: string) {
  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      checkout: {
        select: { razorpayOrderId: true, razorpayPaymentId: true, subtotal: true },
      },
    },
  });

  return orders.map((o) => ({
    id: o.id,
    status: o.status,
    total: o.total,
    currency: "INR",
    items: o.itemsJson,
    razorpayOrderId: o.checkout?.razorpayOrderId,
    razorpayPaymentId: o.checkout?.razorpayPaymentId,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  }));
}

export async function getOrder(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      checkout: {
        select: {
          razorpayOrderId: true,
          razorpayPaymentId: true,
          subtotal: true,
          policyResult: true,
        },
      },
    },
  });

  if (!order || order.userId !== userId) {
    throw new Error("ORDER_NOT_FOUND");
  }

  return {
    id: order.id,
    status: order.status,
    total: order.total,
    currency: "INR",
    items: order.itemsJson,
    razorpayOrderId: order.checkout?.razorpayOrderId,
    razorpayPaymentId: order.checkout?.razorpayPaymentId,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export async function cancelOrder(
  orderId: string,
  userId: string,
  agentGrantId?: string
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });

  if (!order || order.userId !== userId) throw new Error("ORDER_NOT_FOUND");
  if (!["placed", "processing"].includes(order.status)) {
    throw new Error("CANNOT_CANCEL");
  }

  // Fix #6: Wrap entire cancel + stock restore in one transaction
  // If any stock update fails, the order stays in its original state — no partial drift.
  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { status: "cancelled" },
    });

    // Restore stock for every item in the order
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = order.itemsJson as any[];
    for (const item of items) {
      const variant = await tx.productVariant.findUnique({
        where: { sku: item.variantSku },
        select: { quantityAvailable: true },
      });
      if (variant) {
        const restored = variant.quantityAvailable + item.quantity;
        await tx.productVariant.update({
          where: { sku: item.variantSku },
          data: {
            quantityAvailable: { increment: item.quantity },
            availabilityStatus: restored > 5 ? "in_stock" : restored > 0 ? "low_stock" : "out_of_stock",
          },
        });
      }
    }
  });

  await auditLog({
    userId, agentGrantId,
    action: "order.cancel",
    payload: { orderId },
  });

  return { orderId, status: "cancelled" };
}

// ─── Razorpay webhook handler ─────────────────────────────────────────────────

import crypto from "crypto";

export async function handleRazorpayWebhook(
  body: string,
  signature: string
): Promise<void> {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  if (expected !== signature) {
    throw new Error("INVALID_WEBHOOK_SIGNATURE");
  }

  const event = JSON.parse(body);
  const eventType: string = event.event;

  if (eventType === "payment.captured") {
    const payment = event.payload.payment.entity;
    const razorpayOrderId: string = payment.order_id;

    const checkout = await prisma.checkout.findUnique({
      where: { razorpayOrderId },
      include: {
        cart: {
          include: {
            items: { include: { product: true, variant: true } },
          },
        },
      },
    });

    if (checkout && checkout.status !== "paid") {
      // Build items snapshot from cart
      const itemsSnapshot = checkout.cart.items.map((i) => ({
        productId: i.productId,
        productName: i.product.name,
        brand: i.product.brand,
        variantSku: i.variantSku,
        attributes: i.variant.attributes,
        quantity: i.quantity,
        price: i.variant.priceAmount,
        subtotal: i.variant.priceAmount * i.quantity,
      }));
      const total = itemsSnapshot.reduce((s, i) => s + i.subtotal, 0);

      // Atomic transaction — same as confirmCheckout
      await prisma.$transaction(async (tx) => {
        // Decrement stock for each item
        for (const item of checkout.cart.items) {
          const variant = await tx.productVariant.findUnique({
            where: { sku: item.variantSku },
            select: { quantityAvailable: true },
          });
          if (variant && variant.quantityAvailable >= item.quantity) {
            const remaining = variant.quantityAvailable - item.quantity;
            await tx.productVariant.update({
              where: { sku: item.variantSku },
              data: {
                quantityAvailable: { decrement: item.quantity },
                availabilityStatus: remaining <= 0 ? "out_of_stock" : remaining <= 5 ? "low_stock" : "in_stock",
              },
            });
          }
        }

        // Mark checkout paid
        await tx.checkout.update({
          where: { id: checkout.id },
          data: { status: "paid", razorpayPaymentId: payment.id },
        });

        // Create or update order
        const existing = await tx.order.findUnique({ where: { checkoutId: checkout.id } });
        if (!existing) {
          await tx.order.create({
            data: {
              checkoutId: checkout.id,
              userId: checkout.userId,
              status: "placed",
              total,
              itemsJson: itemsSnapshot,
            },
          });
        } else {
          await tx.order.update({
            where: { checkoutId: checkout.id },
            data: { status: "processing" },
          });
        }

        // Mark cart checked out
        await tx.cart.update({
          where: { id: checkout.cartId },
          data: { status: "checked_out" },
        });
      });

      await auditLog({
        userId: checkout.userId,
        action: "webhook.payment_captured",
        payload: { razorpayOrderId, paymentId: payment.id, total },
      });
    }
  }

  if (eventType === "payment.failed") {
    const payment = event.payload.payment.entity;
    const razorpayOrderId: string = payment.order_id;
    const checkout = await prisma.checkout.findUnique({
      where: { razorpayOrderId },
    });
    if (checkout) {
      await prisma.checkout.update({
        where: { id: checkout.id },
        data: { status: "failed" },
      });
      await auditLog({
        userId: checkout.userId,
        action: "webhook.payment_failed",
        payload: { razorpayOrderId },
      });
    }
  }
}
