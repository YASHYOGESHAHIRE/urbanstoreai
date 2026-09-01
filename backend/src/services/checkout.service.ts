import { prisma } from "../db/prisma.js";
import { validateCartPolicy } from "./policy.service.js";
import { auditLog } from "./audit.service.js";
import Razorpay from "razorpay";
import crypto from "crypto";

function getRazorpay() {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID ?? "",
    key_secret: process.env.RAZORPAY_KEY_SECRET ?? "",
  });
}

// ─── Create checkout (Fix #8: idempotent — reuse existing pending checkout) ───

export async function createCheckout(userId: string, agentGrantId?: string) {
  // Find active cart
  const cart = await prisma.cart.findFirst({
    where: { userId, status: "active" },
    include: { items: { include: { product: true, variant: true } } },
  });

  if (!cart || cart.items.length === 0) throw new Error("EMPTY_CART");

  // Fix #8: Idempotency — if a pending checkout already exists for this cart,
  // return it instead of creating a duplicate Razorpay order.
  const existingCheckout = await prisma.checkout.findFirst({
    where: { cartId: cart.id, status: { in: ["pending", "confirmed"] } },
  });
  if (existingCheckout?.razorpayOrderId) {
    return {
      checkoutId: existingCheckout.id,
      subtotal: existingCheckout.subtotal,
      currency: "INR",
      razorpayOrderId: existingCheckout.razorpayOrderId,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
      requiresConfirmation: true,
      policyWarnings: [],
      status: existingCheckout.status,
    };
  }

  // Run policy validation
  const policy = await validateCartPolicy(cart.id, userId);
  if (!policy.approved) {
    throw Object.assign(new Error("POLICY_REJECTED"), { policy });
  }

  const subtotal = cart.items.reduce(
    (s, i) => s + i.variant.priceAmount * i.quantity,
    0
  );

  // Create checkout record first (before Razorpay — so we have an ID for receipt)
  const checkout = await prisma.checkout.create({
    data: { cartId: cart.id, userId, status: "pending", policyResult: policy as object, subtotal },
  });

  // Create Razorpay order
  const razorpay = getRazorpay();
  const rpOrder = await razorpay.orders.create({
    amount: subtotal * 100,
    currency: "INR",
    receipt: checkout.id,
    notes: { checkoutId: checkout.id, userId },
  });

  // Save Razorpay order ID
  await prisma.checkout.update({
    where: { id: checkout.id },
    data: { razorpayOrderId: rpOrder.id, status: "confirmed" },
  });

  await auditLog({
    userId, agentGrantId,
    action: "checkout.create",
    payload: { checkoutId: checkout.id, razorpayOrderId: rpOrder.id, subtotal },
  });

  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";

  return {
    checkoutId: checkout.id,
    subtotal,
    currency: "INR",
    razorpayOrderId: rpOrder.id,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
    requiresConfirmation: policy.requiresConfirmation,
    policyWarnings: policy.issues.filter((i) => i.type === "warning"),
    status: "confirmed",
    paymentUrl: `${frontendUrl}/?checkout=${checkout.id}`,
    message: `Payment ready. Ask the user to visit this URL to complete payment: ${frontendUrl}/?checkout=${checkout.id}`,
  };
}

// ─── Get checkout ─────────────────────────────────────────────────────────────

export async function getCheckout(checkoutId: string, userId: string) {
  const checkout = await prisma.checkout.findUnique({
    where: { id: checkoutId },
    include: { cart: { include: { items: { include: { product: true, variant: true } } } } },
  });

  if (!checkout || checkout.userId !== userId) throw new Error("CHECKOUT_NOT_FOUND");
  return checkout;
}

// ─── Confirm checkout (Fix #3: atomic stock decrement + Fix #8: idempotent) ───

export async function confirmCheckout(
  checkoutId: string,
  userId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
  agentGrantId?: string
) {
  const checkout = await prisma.checkout.findUnique({
    where: { id: checkoutId },
    include: { cart: { include: { items: { include: { product: true, variant: true } } } } },
  });

  if (!checkout || checkout.userId !== userId) throw new Error("CHECKOUT_NOT_FOUND");

  // Fix #8: Idempotency — if already paid, return existing order
  if (checkout.status === "paid") {
    const existingOrder = await prisma.order.findUnique({ where: { checkoutId } });
    if (existingOrder) {
      return {
        orderId: existingOrder.id,
        status: existingOrder.status,
        total: existingOrder.total,
        currency: "INR",
        items: existingOrder.itemsJson,
      };
    }
    throw new Error("ALREADY_PAID");
  }

  if (!checkout.razorpayOrderId) throw new Error("NO_RAZORPAY_ORDER");

  // Verify Razorpay signature
  const expectedSig = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET ?? "")
    .update(`${checkout.razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  if (expectedSig !== razorpaySignature) {
    await auditLog({ userId, agentGrantId, action: "checkout.signature_mismatch", payload: { checkoutId } });
    throw new Error("INVALID_SIGNATURE");
  }

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

  // Fix #3: Atomic transaction — stock check + decrement + order create
  // If stock runs out between policy check and confirm, this will fail cleanly.
  const order = await prisma.$transaction(async (tx) => {
    // Re-validate stock atomically inside transaction
    for (const item of checkout.cart.items) {
      const variant = await tx.productVariant.findUnique({
        where: { sku: item.variantSku },
        select: { quantityAvailable: true, availabilityStatus: true },
      });

      if (!variant || variant.quantityAvailable < item.quantity) {
        throw new Error(`STOCK_EXHAUSTED:${item.variantSku}`);
      }

      // Atomically decrement stock
      await tx.productVariant.update({
        where: { sku: item.variantSku },
        data: {
          quantityAvailable: { decrement: item.quantity },
          availabilityStatus: variant.quantityAvailable - item.quantity <= 0
            ? "out_of_stock"
            : variant.quantityAvailable - item.quantity <= 5
            ? "low_stock"
            : "in_stock",
        },
      });
    }

    // Mark checkout paid
    await tx.checkout.update({
      where: { id: checkoutId },
      data: { status: "paid", razorpayPaymentId, razorpaySignature },
    });

    // Create order
    const newOrder = await tx.order.create({
      data: { checkoutId, userId, status: "placed", total, itemsJson: itemsSnapshot },
    });

    // Mark cart checked out
    await tx.cart.update({
      where: { id: checkout.cartId },
      data: { status: "checked_out" },
    });

    return newOrder;
  });

  await auditLog({
    userId, agentGrantId,
    action: "checkout.confirmed",
    payload: { checkoutId, orderId: order.id, total },
  });

  return { orderId: order.id, status: order.status, total, currency: "INR", items: itemsSnapshot };
}
