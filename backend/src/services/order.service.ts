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

  await prisma.order.update({
    where: { id: orderId },
    data: { status: "cancelled" },
  });

  await auditLog({
    userId,
    agentGrantId,
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
    });

    if (checkout && checkout.status !== "paid") {
      await prisma.checkout.update({
        where: { id: checkout.id },
        data: { status: "paid", razorpayPaymentId: payment.id },
      });

      // Ensure order exists
      const existing = await prisma.order.findUnique({
        where: { checkoutId: checkout.id },
      });
      if (!existing) {
        await prisma.order.create({
          data: {
            checkoutId: checkout.id,
            userId: checkout.userId,
            status: "placed",
            total: checkout.subtotal,
            itemsJson: [],
          },
        });
      } else {
        await prisma.order.update({
          where: { checkoutId: checkout.id },
          data: { status: "processing" },
        });
      }

      await auditLog({
        userId: checkout.userId,
        action: "webhook.payment_captured",
        payload: { razorpayOrderId, paymentId: payment.id },
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
